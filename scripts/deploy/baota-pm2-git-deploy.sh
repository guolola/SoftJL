#!/usr/bin/env bash
# Builds and publishes a production release from a persistent server-side git checkout.
set -Eeuo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/www/wwwroot/uml-platform}"
RELEASE_SHA="${RELEASE_SHA:-}"
SOURCE_DIR="${SOURCE_DIR:-$DEPLOY_PATH/shared/source}"
KEEP_RELEASES="${KEEP_RELEASES:-2}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
NPM_CACHE_DIR="${NPM_CACHE_DIR:-$DEPLOY_PATH/shared/npm-cache}"
STALE_INCOMING_DAYS="${STALE_INCOMING_DAYS:-1}"
PLANTUML_JAR="${PLANTUML_JAR:-plantuml-1.2026.3beta8.jar}"

log_deploy() {
  printf '[deploy][%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

run_timed() {
  local label="$1"
  shift
  local started_at
  local finished_at
  local status
  started_at="$(date +%s)"
  log_deploy "START $label"
  set +e
  "$@"
  status="$?"
  set -e
  finished_at="$(date +%s)"
  log_deploy "END $label status=$status duration=$((finished_at - started_at))s"
  return "$status"
}

if [[ -z "$RELEASE_SHA" ]]; then
  echo "RELEASE_SHA is required" >&2
  exit 1
fi

if [[ "$DEPLOY_PATH" == "/" || -z "$DEPLOY_PATH" ]]; then
  echo "Refusing to deploy with unsafe DEPLOY_PATH: $DEPLOY_PATH" >&2
  exit 1
fi

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  echo "SOURCE_DIR is not a git checkout: $SOURCE_DIR" >&2
  exit 1
fi

command -v git >/dev/null || {
  echo "git is required on the server" >&2
  exit 1
}
command -v node >/dev/null || {
  echo "node is required. Install Node.js 22 in BaoTa first." >&2
  exit 1
}
command -v npm >/dev/null || {
  echo "npm is required. Install Node.js/npm in BaoTa first." >&2
  exit 1
}
command -v pm2 >/dev/null || {
  echo "pm2 is required. Run: npm i -g pm2" >&2
  exit 1
}
command -v java >/dev/null || {
  echo "java is required for PlantUML rendering. Install a JRE first." >&2
  exit 1
}
command -v dot >/dev/null || {
  echo "graphviz is required for PlantUML rendering. Install it first: sudo apt-get install -y graphviz" >&2
  exit 1
}

run_nginx_routing() {
  local nginx_bin
  nginx_bin="$(command -v "${NGINX_BIN:-nginx}")" || {
    echo "nginx is required for routing preflight" >&2
    return 1
  }
  local routing_command=("$(command -v node)" "$SOURCE_DIR/scripts/deploy/nginx-next-routing.mjs")
  # Only Nginx configuration needs root. Builds, secrets and PM2 stay owned by the deploy user.
  if [[ "$EUID" -ne 0 ]]; then
    routing_command=(sudo -n -- "${routing_command[@]}")
  fi
  "${routing_command[@]}" "$@" --nginx-bin "$nginx_bin"
}

mkdir -p "$DEPLOY_PATH/releases" "$DEPLOY_PATH/incoming" "$DEPLOY_PATH/shared"

RELEASE_DIR="$DEPLOY_PATH/releases/$RELEASE_SHA"
TMP_DIR="$DEPLOY_PATH/incoming/$RELEASE_SHA"
RELEASE_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PRODUCTION_ENV_FILE="$DEPLOY_PATH/shared/production.env"
PREVIOUS_RELEASE="$(readlink -f "$DEPLOY_PATH/current" 2>/dev/null || true)"

case "$TMP_DIR" in
  "$DEPLOY_PATH"/incoming/*) ;;
  *)
    echo "Refusing to remove unsafe incoming path: $TMP_DIR" >&2
    exit 1
    ;;
esac

case "$RELEASE_DIR" in
  "$DEPLOY_PATH"/releases/*) ;;
  *)
    echo "Refusing to remove unsafe release path: $RELEASE_DIR" >&2
    exit 1
    ;;
esac

cleanup_tmp_dir() {
  if [[ -n "${TMP_DIR:-}" && -d "$TMP_DIR" ]]; then
    rm -rf -- "$TMP_DIR"
  fi
}

cleanup_stale_deploy_artifacts() {
  echo "Cleaning stale deploy artifacts ..."
  find "$DEPLOY_PATH/incoming" -mindepth 1 -maxdepth 1 -type d -mtime +"$STALE_INCOMING_DAYS" -print0 |
    while IFS= read -r -d '' incoming_dir; do
      rm -rf -- "$incoming_dir"
    done
}

verify_web_bundle() {
  local web_dir="$1"
  local standalone_dir="$web_dir/.next/standalone/apps/web"
  local client_dir="$web_dir/.next/static"
  local matches

  if [[ ! -d "$client_dir" && -d "$standalone_dir/.next/static" ]]; then
    client_dir="$standalone_dir/.next/static"
  fi
  if [[ ! -f "$standalone_dir/server.js" || ! -d "$client_dir" ]]; then
    echo "Next.js standalone server or static assets are missing: $web_dir" >&2
    exit 1
  fi

  matches="$(
    find "$client_dir" -type f -name '*.js' \
      -exec grep -HnE '(127\.0\.0\.1|localhost):(4001|4101)' {} + 2>/dev/null || true
  )"

  if [[ -n "$matches" ]]; then
    echo "Production web bundle contains a local API base URL." >&2
    echo "Build with NEXT_PUBLIC_APP_API_BASE_URL='' so browser requests use same-origin /api." >&2
    echo "$matches" >&2
    exit 1
  fi

  echo "Next.js web bundle check passed: $web_dir"
}

verify_web_seo_artifacts() {
  local web_dir="$1"
  if [[ ! -f "$web_dir/public/og-cover.png" && ! -f "$web_dir/.next/standalone/apps/web/public/og-cover.png" ]]; then
    echo "Next.js public SEO cover is missing: $web_dir" >&2
    exit 1
  fi
  echo "Next.js public SEO asset check passed: $web_dir"
}

copy_release_payload() {
  echo "Creating release payload ..."
  rm -rf "$TMP_DIR" "$RELEASE_DIR"
  mkdir -p "$TMP_DIR"

  cp "$SOURCE_DIR/package.json" "$SOURCE_DIR/package-lock.json" "$SOURCE_DIR/ecosystem.config.cjs" "$TMP_DIR/"

  mkdir -p "$TMP_DIR/apps/api" "$TMP_DIR/apps/render-service" "$TMP_DIR/apps/web"
  cp "$SOURCE_DIR/apps/api/package.json" "$TMP_DIR/apps/api/"
  cp "$SOURCE_DIR/apps/render-service/package.json" "$TMP_DIR/apps/render-service/"
  cp "$SOURCE_DIR/apps/web/package.json" "$TMP_DIR/apps/web/"
  cp -R "$SOURCE_DIR/apps/api/dist" "$TMP_DIR/apps/api/dist"
  cp -R "$SOURCE_DIR/apps/render-service/dist" "$TMP_DIR/apps/render-service/dist"
  # Vector PDF fonts and their license are generated runtime assets shipped with dist.
  for font_asset in NotoSansCJKsc-Regular.otf NotoSansCJKsc-Bold.otf LICENSE.txt; do
    if [[ ! -s "$TMP_DIR/apps/render-service/dist/assets/pdf-fonts/$font_asset" ]]; then
      echo "PDF font asset missing from render-service build: $font_asset" >&2
      exit 1
    fi
  done
  mkdir -p "$TMP_DIR/apps/web/.next"
  cp -R "$SOURCE_DIR/apps/web/.next/standalone" "$TMP_DIR/apps/web/.next/standalone"
  mkdir -p "$TMP_DIR/apps/web/.next/standalone/apps/web/.next"
  cp -R "$SOURCE_DIR/apps/web/.next/static" "$TMP_DIR/apps/web/.next/standalone/apps/web/.next/static"
  cp -R "$SOURCE_DIR/apps/web/public" "$TMP_DIR/apps/web/.next/standalone/apps/web/public"

  mkdir -p "$TMP_DIR/packages/contracts" "$TMP_DIR/packages/prompts"
  cp "$SOURCE_DIR/packages/contracts/package.json" "$TMP_DIR/packages/contracts/"
  cp "$SOURCE_DIR/packages/prompts/package.json" "$TMP_DIR/packages/prompts/"
  cp -R "$SOURCE_DIR/packages/contracts/dist" "$TMP_DIR/packages/contracts/dist"
  cp -R "$SOURCE_DIR/packages/prompts/dist" "$TMP_DIR/packages/prompts/dist"

  mkdir -p "$TMP_DIR/scripts/deploy"
  cp "$SOURCE_DIR/scripts/deploy/baota-pm2-git-deploy.sh" "$TMP_DIR/scripts/deploy/"
}

ensure_plantuml_jar() {
  local target="$TMP_DIR/plantuml/build/libs/$PLANTUML_JAR"
  local source_jar="$SOURCE_DIR/plantuml/build/libs/$PLANTUML_JAR"
  local shared_jar="$DEPLOY_PATH/shared/plantuml/$PLANTUML_JAR"
  local current_jar="$DEPLOY_PATH/current/plantuml/build/libs/$PLANTUML_JAR"

  mkdir -p "$(dirname "$target")"
  if [[ -f "$source_jar" ]]; then
    cp "$source_jar" "$target"
  elif [[ -f "$shared_jar" ]]; then
    cp "$shared_jar" "$target"
  elif [[ -f "$current_jar" ]]; then
    cp "$current_jar" "$target"
    mkdir -p "$(dirname "$shared_jar")"
    cp "$current_jar" "$shared_jar"
  else
    echo "PlantUML jar not found in source, shared cache, or current release" >&2
    exit 1
  fi
}

install_production_dependencies() {
  echo "Installing production dependencies from $NPM_REGISTRY ..."
  (
    cd "$TMP_DIR"
    npm ci \
      --omit=dev \
      --no-audit \
      --no-fund \
      --ignore-scripts \
      --cache "$NPM_CACHE_DIR" \
      --workspace @uml-platform/api \
      --workspace @uml-platform/render-service \
      --include-workspace-root=false \
      --registry="$NPM_REGISTRY"
  )
}

load_production_env() {
  if [[ -f "$PRODUCTION_ENV_FILE" ]]; then
    echo "Loading production environment: $PRODUCTION_ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    . "$PRODUCTION_ENV_FILE"
    set +a
  else
    echo "Warning: production environment file not found: $PRODUCTION_ENV_FILE" >&2
    echo "OnlyOffice and other optional production integrations may be unavailable." >&2
  fi
}

wait_for_http_health() {
  local service_name="$1"
  local url="$2"
  local pm2_process="$3"

  for attempt in $(seq 1 30); do
    if curl -fsS "$url" >/dev/null; then
      echo "$service_name health check passed"
      return 0
    fi
    echo "$service_name health check is not ready yet (attempt $attempt/30)"
    sleep 2
  done

  echo "$service_name health check failed: $url" >&2
  pm2 status || true
  pm2 logs "$pm2_process" --nostream --lines 80 || true
  return 1
}

check_pm2_cwd() {
  local process_name="$1"
  local expected_cwd="$2"
  local pid_output
  local pids=()
  local pid
  local actual_cwd

  pid_output="$(pm2 pid "$process_name" || true)"
  while IFS= read -r pid; do
    if [[ -n "$pid" && "$pid" != "0" ]]; then
      pids+=("$pid")
    fi
  done < <(printf '%s\n' "$pid_output")

  if [[ "${#pids[@]}" -eq 0 ]]; then
    echo "$process_name is not running" >&2
    pm2 status || true
    return 1
  fi

  for pid in "${pids[@]}"; do
    actual_cwd="$(readlink -f "/proc/$pid/cwd" || true)"
    if [[ "$actual_cwd" != "$expected_cwd" ]]; then
      echo "$process_name pid $pid is running from the wrong directory" >&2
      echo "Expected cwd: $expected_cwd" >&2
      echo "Actual cwd:   ${actual_cwd:-<unreadable>}" >&2
      pm2 status || true
      pm2 logs "$process_name" --nostream --lines 80 || true
      return 1
    fi
  done
}

reload_pm2_for_release() {
  local release_dir="$1"
  local release_sha="$2"
  local started_at="$3"
  local migrate_database="${4:-true}"

  (
    cd "$release_dir"
    load_production_env
    export UML_RELEASE_SHA="$release_sha"
    export UML_RELEASE_DIR="$release_dir"
    export UML_RELEASE_STARTED_AT="$started_at"

    pm2 delete uml-generation-worker >/dev/null 2>&1 || true
    pm2 delete uml-api >/dev/null 2>&1 || true
    pm2 delete uml-render-service >/dev/null 2>&1 || true
    pm2 delete uml-web >/dev/null 2>&1 || true
    # Stop old writers, then finish migrations before the concurrent PM2 startup.
    # Explicit returns are required: this function also runs inside an `if !` condition.
    if [[ "$migrate_database" == "true" ]]; then
      run_timed "database migrations" node apps/api/dist/db/migrate.js || return 1
    fi
    run_timed "pm2 start production processes" pm2 start ecosystem.config.cjs --env production
    sleep 2

    echo "Checking render-service health ..."
    run_timed "render-service health check" \
      wait_for_http_health "render-service" http://127.0.0.1:4002/health uml-render-service

    echo "Checking API health ..."
    run_timed "API health check" \
      wait_for_http_health "API" http://127.0.0.1:4001/api/health uml-api

    if [[ -f "$release_dir/apps/web/.next/standalone/apps/web/server.js" ]]; then
      run_timed "Next.js web health check" \
        wait_for_http_health "web" http://127.0.0.1:4003/ uml-web
    fi

    echo "Checking PM2 process directories ..."
    local expected_release_dir
    expected_release_dir="$(readlink -f "$release_dir")"
    run_timed "PM2 process cwd check render-service" \
      check_pm2_cwd uml-render-service "$expected_release_dir"
    run_timed "PM2 process cwd check API" \
      check_pm2_cwd uml-api "$expected_release_dir"
    if [[ -f "$release_dir/apps/web/.next/standalone/apps/web/server.js" ]]; then
      run_timed "PM2 process cwd check web" \
        check_pm2_cwd uml-web "$expected_release_dir/apps/web/.next/standalone/apps/web"
    fi

    echo "Checking API version ..."
    local version_json
    version_json="$(curl -fsS http://127.0.0.1:4001/api/version)"
    echo "API version: $version_json"
    if [[ "$version_json" != *'"supportsDesignTableDiagram":true'* ]]; then
      echo "API version check failed: design table diagram support is not enabled" >&2
      pm2 status || true
      pm2 logs uml-api --nostream --lines 80 || true
      return 1
    fi
    if [[ "$version_json" != *"\"releaseSha\":\"$release_sha\""* ]]; then
      echo "API version check failed: expected release SHA $release_sha" >&2
      pm2 status || true
      pm2 logs uml-api --nostream --lines 80 || true
      return 1
    fi

    pm2 save
  )
}

rollback_to_previous_release() {
  # Restore the matching routing configuration before serving the previous app.
  local routing_status=0
  run_nginx_routing restore "$RELEASE_DIR/nginx-routing-backup.json" || routing_status=$?
  if [[ "$routing_status" -ne 0 ]]; then
    echo "Routing recovery failed; restoring the previous application still takes priority" >&2
  fi
  if [[ -z "$PREVIOUS_RELEASE" || ! -d "$PREVIOUS_RELEASE" ]]; then
    echo "No previous release is available for rollback" >&2
    return 1
  fi

  local previous_sha
  previous_sha="$(basename "$PREVIOUS_RELEASE")"
  echo "Rolling back to previous release: $previous_sha"
  ln -sfnT "$PREVIOUS_RELEASE" "$DEPLOY_PATH/current"
  # Older releases have no migration CLI; rollback restores processes without rerunning new migrations.
  reload_pm2_for_release "$PREVIOUS_RELEASE" "$previous_sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" false || return 1
  return "$routing_status"
}

cleanup_old_releases() {
  echo "Cleaning old releases, keeping latest $KEEP_RELEASES ..."
  local current_release
  current_release="$(readlink -f "$DEPLOY_PATH/current" || true)"
  if [[ -z "$current_release" || ! -d "$current_release" ]]; then
    echo "Current release symlink is invalid after deploy: $DEPLOY_PATH/current" >&2
    exit 1
  fi

  local release_rank=0
  while read -r _ release_dir; do
    release_rank="$((release_rank + 1))"
    local release_real
    release_real="$(readlink -f "$release_dir" || true)"

    if [[ "$release_rank" -le "$KEEP_RELEASES" || "$release_real" == "$current_release" ]]; then
      continue
    fi

    if ! rm -rf -- "$release_dir"; then
      echo "Warning: failed to remove old release, keeping it: $release_dir" >&2
    fi
  done < <(find "$DEPLOY_PATH/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn)
}

trap cleanup_tmp_dir EXIT

# Fail before building or switching the current release if routing or privileges are unsuitable.
if ! run_timed "Nginx routing preflight" \
  run_nginx_routing check "$DEPLOY_PATH"; then
  echo "Nginx preflight failed. A root deploy account or existing noninteractive sudo access is required." >&2
  echo "Production was not switched. Ask the server administrator to verify Nginx access and routing." >&2
  exit 1
fi

echo "Disk usage before deploy:"
df -h "$DEPLOY_PATH" /tmp || true

cleanup_stale_deploy_artifacts

echo "Building production bundles from $SOURCE_DIR ..."
(
  cd "$SOURCE_DIR"
  git rev-parse --verify "$RELEASE_SHA^{commit}" >/dev/null
  rm -rf apps/api/dist apps/render-service/dist apps/web/.next packages/contracts/dist packages/prompts/dist
  run_timed "npm ci build dependencies" \
    npm ci --no-audit --no-fund --cache "$NPM_CACHE_DIR" --registry="$NPM_REGISTRY"
  run_timed "build contracts" npm run build:contracts
  run_timed "build prompts" npm run build:prompts
  run_timed "build api" npm run build:api
  run_timed "build render service" npm run build:render
  run_timed "build production web" npm run build:web:production
)
verify_web_bundle "$SOURCE_DIR/apps/web"

copy_release_payload
ensure_plantuml_jar
run_timed "install production dependencies" install_production_dependencies

if [[ ! -f "$TMP_DIR/apps/web/.next/standalone/apps/web/server.js" ]]; then
  echo "Current release candidate is missing its Next.js server" >&2
  exit 1
fi
verify_web_bundle "$TMP_DIR/apps/web"
verify_web_seo_artifacts "$TMP_DIR/apps/web"

mv "$TMP_DIR" "$RELEASE_DIR"
ln -sfnT "$RELEASE_DIR" "$DEPLOY_PATH/current"

if ! run_timed "PM2 reload and release verification" \
  reload_pm2_for_release "$RELEASE_DIR" "$RELEASE_SHA" "$RELEASE_STARTED_AT"; then
  echo "New release failed health checks; restoring previous release" >&2
  rollback_to_previous_release
  exit 1
fi

if ! run_timed "switch Nginx to Next.js" \
  run_nginx_routing apply \
    "$RELEASE_DIR/nginx-routing-backup.json" "$DEPLOY_PATH"; then
  echo "Nginx route migration failed; restoring previous release" >&2
  rollback_to_previous_release
  exit 1
fi

if ! run_timed "public SEO verification" \
  node "$SOURCE_DIR/apps/web/scripts/verify-seo-deployment.mjs"; then
  echo "New release failed SEO checks; restoring previous release" >&2
  rollback_to_previous_release
  exit 1
fi

cleanup_old_releases

if [[ ! -f "$DEPLOY_PATH/current/apps/web/.next/standalone/apps/web/server.js" ]]; then
  echo "Current release is missing its Next.js server after cleanup" >&2
  exit 1
fi

echo "Disk usage after deploy:"
df -h "$DEPLOY_PATH" /tmp || true

echo "Deploy finished: $RELEASE_SHA"
echo "Check API: curl http://127.0.0.1:4001/api/health"
echo "Check render-service: curl http://127.0.0.1:4002/health"
