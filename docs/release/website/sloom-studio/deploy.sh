#!/usr/bin/env bash
# Deploy the sloom.studio static site to the VPN nginx host.
#
#   ./deploy.sh user@vpn-host              # DRY RUN (shows what would change, touches nothing)
#   ./deploy.sh user@vpn-host --go         # real deploy (rsync --delete)
#   ./deploy.sh user@vpn-host --go /custom/root/   # override remote path
#
# Runs the verification gate first and refuses to deploy a broken site.
# After a real deploy it curls https://sloom.studio/privacy to confirm the
# Play-Store-required privacy URL is live (200).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"
GO="${2:-}"
REMOTE_PATH="${3:-/var/www/sloom.studio/html/}"

if [[ -z "$TARGET" ]]; then
  echo "usage: ./deploy.sh user@vpn-host [--go] [remote_path]" >&2
  echo "       (no --go = dry run)" >&2
  exit 2
fi

echo "▶ verifying site…"
node "$HERE/verify-site.mjs"

# Never ship these to the public root.
EXCLUDES=(--exclude verify-site.mjs --exclude deploy.sh --exclude README.md --exclude nginx-sloom.studio.conf --exclude '.omc' --exclude '.git*')

if [[ "$GO" == "--go" ]]; then
  echo "▶ deploying $HERE/ → $TARGET:$REMOTE_PATH"
  rsync -avz --delete "${EXCLUDES[@]}" "$HERE/" "$TARGET:$REMOTE_PATH"
  echo "▶ checking https://sloom.studio/privacy …"
  code="$(curl -s -o /dev/null -w '%{http_code}' https://sloom.studio/privacy || echo 000)"
  echo "   privacy URL HTTP $code"
  [[ "$code" == "200" ]] && echo "✓ live" || echo "⚠ expected 200 — check nginx try_files / DNS / TLS"
else
  echo "▶ DRY RUN $HERE/ → $TARGET:$REMOTE_PATH  (add --go to apply)"
  rsync -avzn --delete "${EXCLUDES[@]}" "$HERE/" "$TARGET:$REMOTE_PATH"
  echo "— dry run only; nothing changed. Re-run with --go to deploy."
fi
