#!/usr/bin/env bash
# Signal Loom Android smoke-test harness — drives the real app over ADB like a human user.
# Usage: ops/android-smoke/smoke.sh <command> [args]
# Device: set SLOOM_ADB_DEVICE, else first connected device.
set -uo pipefail

PKG="studio.sloom.signalloom"
ACT="$PKG/.MainActivity"
SHOT_DIR="${SLOOM_SHOT_DIR:-/tmp/sloom-smoke}"
mkdir -p "$SHOT_DIR"

dev() {
  if [ -n "${SLOOM_ADB_DEVICE:-}" ]; then echo "$SLOOM_ADB_DEVICE"; return; fi
  adb devices | awk '/\tdevice$/{print $1; exit}'
}
D="$(dev)"
A() { adb -s "$D" "$@"; }

case "${1:-}" in
  launch)   A shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep "${2:-3}";;
  stop)     A shell am force-stop "$PKG";;
  fg)       A shell dumpsys activity activities 2>/dev/null | grep -iE "ResumedActivity" | head -1;;
  shot)     f="$SHOT_DIR/${2:-shot}.png"; A exec-out screencap -p > "$f" 2>/dev/null; echo "$f ($(identify -format '%wx%h' "$f" 2>/dev/null))";;
  tap)      A shell input tap "$2" "$3";;
  long)     A shell input swipe "$2" "$3" "$2" "$3" "${4:-700}";;   # long-press = zero-distance swipe held
  swipe)    A shell input swipe "$2" "$3" "$4" "$5" "${6:-300}";;
  text)     A shell input text "$(printf '%s' "$2" | sed 's/ /%s/g')";;
  key)      A shell input keyevent "$2";;
  back)     A shell input keyevent 4;;
  console)  A logcat -d 2>/dev/null | grep -iE "chromium|Capacitor|SignalLoom|console" | tail -"${2:-40}";;
  clearlog) A logcat -c;;
  *) echo "commands: launch|stop|fg|shot <name>|tap x y|long x y [ms]|swipe x1 y1 x2 y2 [ms]|text <s>|key <code>|back|console [n]|clearlog"; exit 1;;
esac
