#!/usr/bin/env bash
# Sets up on-device voice for Sprout's check-in: whisper.cpp from Homebrew plus the small English model.
set -euo pipefail
command -v whisper-cli >/dev/null || brew install whisper-cpp
mkdir -p "$HOME/.nomi"
model="$HOME/.nomi/ggml-base.en.bin"
[ -f "$model" ] || curl -L --fail -o "$model" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
echo "Voice is ready: $(command -v whisper-cli) with $model"
