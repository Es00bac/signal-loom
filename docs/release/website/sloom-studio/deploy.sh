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
EXCLUDES=(--exclude verify-site.mjs --exclude deploy.sh --exclude repoint-downloads.sh --exclude README.md --exclude nginx-sloom.studio.conf --exclude '.omc' --exclude '.git*' --exclude forum --exclude e)

if [[ "$GO" == "--go" ]]; then
  echo "▶ deploying $HERE/ → $TARGET:$REMOTE_PATH"
  rsync -avz --delete "${EXCLUDES[@]}" "$HERE/" "$TARGET:$REMOTE_PATH"
  echo "▶ checking https://sloom.studio/privacy …"
  code="$(curl -s -o /dev/null -w '%{http_code}' https://sloom.studio/privacy || echo 000)"
  echo "   privacy URL HTTP $code"
  [[ "$code" == "200" ]] && echo "✓ live" || echo "⚠ expected 200 — check nginx try_files / DNS / TLS"
  # Ping IndexNow (Bing/DuckDuckGo/Yandex/Ecosia) so search engines re-crawl on every deploy.
  # Key is the 32-hex-char file hosted at the site root; non-fatal if absent.
  KEYFILE="$(find "$HERE" -maxdepth 1 -regextype posix-extended -regex '.*/[0-9a-f]{32}\.txt' -printf '%f\n' 2>/dev/null | head -1)"
  if [[ -n "$KEYFILE" ]]; then
    KEY="${KEYFILE%.txt}"
    URLS="$(grep -oE '<loc>[^<]+' sitemap.xml 2>/dev/null | sed 's/<loc>//' | sed 's/.*/"&"/' | paste -sd, -)"
    if [[ -n "$URLS" ]]; then
      echo "▶ pinging IndexNow ($KEY)…"
      inc="$(curl -s -m15 -o /dev/null -w '%{http_code}' -X POST 'https://api.indexnow.org/indexnow' \
        -H 'Content-Type: application/json' \
        -d "{\"host\":\"sloom.studio\",\"key\":\"$KEY\",\"keyLocation\":\"https://sloom.studio/$KEYFILE\",\"urlList\":[$URLS]}" || echo 000)"
      echo "   IndexNow HTTP $inc (200/202 = accepted)"
    fi
  fi
else
  echo "▶ DRY RUN $HERE/ → $TARGET:$REMOTE_PATH  (add --go to apply)"
  rsync -avzn --delete "${EXCLUDES[@]}" "$HERE/" "$TARGET:$REMOTE_PATH"
  echo "— dry run only; nothing changed. Re-run with --go to deploy."
fi
