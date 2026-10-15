#!/usr/bin/env bash
# Reports existing deployment privileges without changing Nginx, PM2, or release files.
set -Eeuo pipefail

deploy_path="${1:?An absolute deployment directory is required}"
[[ "$deploy_path" == /* && "$deploy_path" != / ]] || exit 1
node_bin="$(command -v node)"
nginx_bin="$(command -v nginx)"
routing_script="$deploy_path/shared/source/scripts/deploy/nginx-next-routing.mjs"

if [[ "$(id -u)" == 0 ]]; then
  echo 'Deployment account is root: yes'
else
  echo 'Deployment account is root: no'
fi

if "$nginx_bin" -t >/dev/null 2>&1; then
  echo 'Direct Nginx validation: allowed'
else
  echo 'Direct Nginx validation: denied or invalid configuration'
fi

if ! command -v sudo >/dev/null; then
  echo 'Existing noninteractive sudo: unavailable'
  exit 0
fi

# sudo -l checks policy only; it never runs the requested command or modifies privileges.
if sudo -n -l -- "$node_bin" "$routing_script" check "$deploy_path" --nginx-bin "$nginx_bin" >/dev/null 2>&1; then
  echo 'Existing sudo permission for routing helper: allowed'
else
  echo 'Existing sudo permission for routing helper: unavailable'
fi
if sudo -n -l -- "$nginx_bin" -t >/dev/null 2>&1; then
  if sudo -n -- "$nginx_bin" -t >/dev/null 2>&1; then
    echo 'Nginx validation with existing sudo: passed'
  else
    echo 'Nginx validation with existing sudo: failed'
  fi
else
  echo 'Existing sudo permission for Nginx validation: unavailable'
fi
