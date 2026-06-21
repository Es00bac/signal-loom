#!/usr/bin/env bash
# Speak a short message to the Host PC audio via Edge TTS.
# IMPORTANT: run with the Bash sandbox DISABLED (dangerouslyDisableSandbox) or audio is blocked.
# The host's default sink is a multi-channel "Pro Audio" device whose speakers are on channels 0 & 1
# (front L/R). A plain stereo or 5.1-upmix lands on the wrong/LFE channels and is inaudible, so we
# synth mono and route it to channels 0 and 1 of an N-channel stream (N = the sink's channel count).
# Usage: ops/tts/say.sh "message" [voice]
set -euo pipefail

MSG="${1:?usage: say.sh \"message\" [voice]}"
VOICE="${2:-en-US-AriaNeural}"
EDGE_TTS="${EDGE_TTS_BIN:-edge-tts}"

command -v "$EDGE_TTS" >/dev/null 2>&1 || { echo "edge-tts not found on PATH" >&2; exit 1; }

TMP_MP3="$(mktemp --suffix=.mp3)"; TMP_MONO="$(mktemp --suffix=.wav)"; TMP_OUT="$(mktemp --suffix=.wav)"
trap 'rm -f "$TMP_MP3" "$TMP_MONO" "$TMP_OUT"' EXIT

"$EDGE_TTS" --voice "$VOICE" --text "$MSG" --write-media "$TMP_MP3" >/dev/null 2>&1 \
  || { echo "edge-tts synthesis failed" >&2; exit 1; }

DEF="$(pactl get-default-sink 2>/dev/null || true)"
CH="$(pactl list sinks short 2>/dev/null | awk -v d="$DEF" '$2==d{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+ch$/){gsub(/ch/,"",$i);print $i;exit}}')"
CH="${CH:-6}"

ffmpeg -i "$TMP_MP3" -ac 1 -ar 48000 "$TMP_MONO" -y >/dev/null 2>&1
if [ "$CH" -ge 2 ] 2>/dev/null && command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -i "$TMP_MONO" -af "pan=${CH}c|c0=c0|c1=c0" -ar 48000 "$TMP_OUT" -y >/dev/null 2>&1 || cp "$TMP_MONO" "$TMP_OUT"
else
  cp "$TMP_MONO" "$TMP_OUT"
fi

command -v pw-play >/dev/null 2>&1 && pw-play "$TMP_OUT" >/dev/null 2>&1 && exit 0
command -v mpv >/dev/null 2>&1 && mpv --no-video --no-terminal "$TMP_OUT" >/dev/null 2>&1 && exit 0
echo "playback failed" >&2
exit 1
