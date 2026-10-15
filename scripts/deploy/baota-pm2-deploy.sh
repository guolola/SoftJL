#!/usr/bin/env bash
# Rejects archive releases because their Vite payload cannot run the Next.js application.
set -Eeuo pipefail

echo "Archive deployment is retired after the Next.js migration. Use baota-pm2-git-deploy.sh." >&2
exit 1