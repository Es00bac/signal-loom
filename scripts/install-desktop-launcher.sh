#!/usr/bin/env bash
# Installs Signal Loom as a real desktop app: packages the current code with
# electron-builder, syncs the unpacked build into a stable install dir, and
# points the application-menu entry at the installed binary. Re-run after any
# change to refresh the installed app (or `--no-build` to just re-sync/repoint).
set -euo pipefail

self="$(readlink -f -- "${BASH_SOURCE[0]}" 2>/dev/null || realpath -- "${BASH_SOURCE[0]}")"
script_dir="$(cd -- "$(dirname -- "$self")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
bin_dir="${HOME}/.local/bin"
desktop_dir="${HOME}/.local/share/applications"
icon_dir="${HOME}/.local/share/icons/hicolor/512x512/apps"
install_dir="${SIGNAL_LOOM_INSTALL_DIR:-${HOME}/.local/opt/signal-loom}"
bin_target="${bin_dir}/signal-loom-electron"
desktop_target="${desktop_dir}/signal-loom.desktop"
unpacked="${project_root}/release/linux-unpacked"

build=1
for arg in "$@"; do
  case "$arg" in
    --no-build) build=0 ;;
    *) echo "Unknown option: $arg (supported: --no-build)" >&2; exit 2 ;;
  esac
done

if [ "$build" -eq 1 ]; then
  (cd "$project_root" && npm run build && npx electron-builder --linux dir)
fi

if [ ! -x "${unpacked}/signal-loom" ]; then
  echo "No unpacked build at ${unpacked} — run without --no-build first." >&2
  exit 1
fi

mkdir -p "$bin_dir" "$desktop_dir" "$icon_dir" "$install_dir"
rsync -a --delete "${unpacked}/" "${install_dir}/"

# Keep the dev wrapper on PATH for terminal use; the menu entry below no
# longer depends on it.
ln -sfn "$project_root/scripts/signal-loom-electron" "$bin_target"
chmod +x "$project_root/scripts/signal-loom-electron"

if [ -f "$project_root/build/icons/icon.png" ]; then
  install -m 644 "$project_root/build/icons/icon.png" "${icon_dir}/signal-loom.png"
fi

cat > "$desktop_target" <<DESKTOP
[Desktop Entry]
Type=Application
Version=1.0
Name=Signal Loom
GenericName=AI Multimedia Editor
Comment=Generative AI media flow builder and timeline editor
Exec=env SIGNAL_LOOM_ELECTRON_PANEL_MENU=1 ${install_dir}/signal-loom %U
Icon=signal-loom
Terminal=false
Categories=AudioVideo;AudioVideoEditing;
Keywords=video;audio;multimedia;editor;timeline;AI;generation;
StartupNotify=true
StartupWMClass=signal-loom
DESKTOP

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
fi

if command -v xdg-desktop-menu >/dev/null 2>&1; then
  xdg-desktop-menu forceupdate >/dev/null 2>&1 || true
fi

version="$(node -p "require('${project_root}/package.json').version" 2>/dev/null || echo '?')"
printf 'Installed Signal Loom %s to %s (menu entry: %s)\n' "$version" "$install_dir" "$desktop_target"
