#!/usr/bin/env bash
set -euo pipefail

self="$(readlink -f -- "${BASH_SOURCE[0]}" 2>/dev/null || realpath -- "${BASH_SOURCE[0]}")"
script_dir="$(cd -- "$(dirname -- "$self")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
bin_dir="${HOME}/.local/bin"
desktop_dir="${HOME}/.local/share/applications"
bin_target="${bin_dir}/signal-loom-electron"
desktop_target="${desktop_dir}/signal-loom.desktop"

mkdir -p "$bin_dir" "$desktop_dir"
ln -sfn "$project_root/scripts/signal-loom-electron" "$bin_target"
chmod +x "$project_root/scripts/signal-loom-electron"

cat > "$desktop_target" <<DESKTOP
[Desktop Entry]
Type=Application
Version=1.0
Name=Signal Loom
GenericName=AI Multimedia Editor
Comment=Generative AI media flow builder and timeline editor
Exec=${bin_target}
Icon=signal-loom
Terminal=false
Categories=AudioVideo;AudioVideoEditing;
Keywords=video;audio;multimedia;editor;timeline;AI;generation;
StartupNotify=true
StartupWMClass=Signal Loom
DESKTOP
chmod +x "$desktop_target"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
fi

if command -v xdg-desktop-menu >/dev/null 2>&1; then
  xdg-desktop-menu forceupdate >/dev/null 2>&1 || true
fi

printf 'Installed %s and %s\n' "$bin_target" "$desktop_target"
