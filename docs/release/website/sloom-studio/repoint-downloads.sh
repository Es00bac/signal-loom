#!/usr/bin/env bash
# Repoint the stable download symlinks to a new version's real files.
# The website HTML links ONLY the stable names, so on release you run just this.
#   ./repoint-downloads.sh 0.9.11
set -euo pipefail
V="${1:?usage: repoint-downloads.sh <version>   e.g. 0.9.11}"
cd "$(dirname "$0")/downloads"
# stable name  ->  versioned real file for version $V
map=(
  "SloomStudio-Setup.exe:SloomStudio-Setup-${V}.exe"
  "SloomStudio.AppImage:SloomStudio-${V}-x86_64.AppImage"
  "SloomStudio.deb:SloomStudio-${V}-amd64.deb"
  "SloomStudio-arm64.dmg:SloomStudio-${V}-arm64.dmg"
  "SloomStudio-x64.dmg:SloomStudio-${V}-x64.dmg"
)
missing=0
for pair in "${map[@]}"; do
  stable="${pair%%:*}"; target="${pair#*:}"
  if [[ -f "$target" ]]; then ln -sfn "$target" "$stable"; echo "OK   $stable -> $target"
  else echo "MISS $target (put the new build in downloads/ first)"; missing=1; fi
done
[[ $missing -eq 0 ]] && echo "All stable links repointed to $V. Deploy as usual." || { echo "Some targets missing — nothing half-done, fix and re-run."; exit 1; }
