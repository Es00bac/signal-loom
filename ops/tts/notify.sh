#!/usr/bin/env bash
# Spoken status update ("chime") to the JLab BLUETOOTH audio device via Edge TTS neural voice.
# Used to get the user's attention at stopping points (they don't watch the screen while work runs).
# IMPORTANT: run with the Bash sandbox DISABLED (dangerouslyDisableSandbox) or audio is blocked.
# Usage: ops/tts/notify.sh "message" [voice]
set -uo pipefail

MSG="${1:?usage: notify.sh \"message\" [voice]}"
VOICE="${2:-en-US-AriaNeural}"
EDGE_TTS="${EDGE_TTS_BIN:-edge-tts}"

command -v "$EDGE_TTS" >/dev/null 2>&1 || { echo "edge-tts not found on PATH" >&2; exit 1; }

# Prefer the JLab bluetooth sink (bluez_output.*) when connected; fall back to the default sink.
SINK="$(pactl list sinks short 2>/dev/null | awk '/bluez_output/{print $2; exit}')"
[ -z "$SINK" ] && SINK="$(pactl get-default-sink 2>/dev/null || true)"

TMP_MP3="$(mktemp --suffix=.mp3)"; TMP_WAV="$(mktemp --suffix=.wav)"
trap 'rm -f "$TMP_MP3" "$TMP_WAV"' EXIT

"$EDGE_TTS" --voice "$VOICE" --text "$MSG" --write-media "$TMP_MP3" >/dev/null 2>&1 \
  || { echo "edge-tts synthesis failed" >&2; exit 1; }

# Bluetooth sinks are plain stereo, so a normal stereo render plays correctly (no pro-audio channel routing).
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -i "$TMP_MP3" -ac 2 -ar 48000 "$TMP_WAV" -y >/dev/null 2>&1 || cp "$TMP_MP3" "$TMP_WAV"
else
  cp "$TMP_MP3" "$TMP_WAV"
fi

if command -v paplay >/dev/null 2>&1; then
  paplay ${SINK:+--device="$SINK"} "$TMP_WAV" >/dev/null 2>&1 && exit 0
fi
if command -v pw-play >/dev/null 2>&1; then
  pw-play ${SINK:+--target="$SINK"} "$TMP_WAV" >/dev/null 2>&1 && exit 0
fi
if command -v mpv >/dev/null 2>&1; then
  mpv --no-video --no-terminal ${SINK:+--audio-device="pulse/$SINK"} "$TMP_WAV" >/dev/null 2>&1 && exit 0
fi
echo "playback failed" >&2
exit 1
