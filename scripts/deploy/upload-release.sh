#!/usr/bin/env bash
# Retries verified delta transfers into staging while retaining partial data for the next attempt.
set -Eeuo pipefail

source_path="${1:?Local source is required}"
remote_path="${2:?Remote staging path is required}"
basis_path="${3:-}"
: "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}"
[[ "$remote_path" == /* && "$remote_path" != / ]] || { echo 'An absolute remote staging path is required' >&2; exit 1; }
command -v rsync >/dev/null

ssh_options=(ssh -i "${DEPLOY_SSH_KEY_FILE:-$HOME/.ssh/deploy_key}" -p "${DEPLOY_PORT:-22}"
  -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=4
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$HOME/.ssh/known_hosts")
printf -v remote_shell '%q ' "${ssh_options[@]}"
options=(-a --checksum --protect-args --partial-dir=.rsync-partial --delay-updates
  --info=progress2 --stats --outbuf=L --timeout=60 -e "$remote_shell")
if [[ -n "$basis_path" ]]; then
  [[ "$basis_path" == /* ]] || { echo 'An absolute basis path is required' >&2; exit 1; }
  options+=(--link-dest="$basis_path")
fi
# Delete only obsolete staging entries; delayed updates never write through links to the active release.
[[ "$source_path" != */ ]] || options+=(--delete-delay)

for attempt in 1 2 3; do
  started_at="$(date +%s)"
  echo "[upload] attempt=$attempt source=$source_path bytes=$(du -sb -- "$source_path" | cut -f1)"
  status=0
  timeout "${DEPLOY_TRANSFER_TIMEOUT:-180}" rsync "${options[@]}" -- \
    "$source_path" "$DEPLOY_USER@$DEPLOY_HOST:$remote_path" || status=$?
  echo "[upload] status=$status duration=$(( $(date +%s) - started_at ))s"
  [[ "$status" -ne 0 ]] || exit 0
  [[ "$attempt" -eq 3 ]] || sleep 2
done
echo '[upload] All attempts failed; partial staging data is retained and activation was not started.' >&2
exit "$status"
