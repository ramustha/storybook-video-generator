#!/usr/bin/env bash
set -euo pipefail

# Installs Chromium/FFmpeg (and optional extra packages such as poppler-utils) on Ubuntu CI runners
# with bounded HTTP timeouts, retries, and mirror fallback away from transient azure.archive.ubuntu.com outages.

EXTRA_PKGS=("$@")
APT_OPTS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20)

for attempt in 1 2 3; do
  if [ "$attempt" -eq 2 ]; then
    echo "⚠️ Attempt 1 failed — switching apt sources away from azure.archive.ubuntu.com to archive.ubuntu.com..."
    sudo find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) \
      -exec sed -i 's|http://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g; s|https://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' {} + || true
  fi

  if ! sudo apt-get "${APT_OPTS[@]}" update -qq; then
    echo "⚠️ apt-get update failed on attempt ${attempt}/3"
    sleep $((attempt * 5))
    continue
  fi

  ASOUND_PKG="libasound2t64"
  if ! apt-cache show libasound2t64 >/dev/null 2>&1; then
    ASOUND_PKG="libasound2"
  fi

  PKGS=(
    ffmpeg
    libnss3
    libatk1.0-0
    libatk-bridge2.0-0
    libcups2
    libdrm2
    libxkbcommon0
    libxcomposite1
    libxdamage1
    libxrandr2
    libgbm1
    "$ASOUND_PKG"
  )
  if [ "${#EXTRA_PKGS[@]}" -gt 0 ]; then
    PKGS+=("${EXTRA_PKGS[@]}")
  fi

  if sudo DEBIAN_FRONTEND=noninteractive apt-get "${APT_OPTS[@]}" install -y --no-install-recommends --fix-missing "${PKGS[@]}"; then
    echo "✔ System dependencies installed on attempt ${attempt}/3 (audio lib: ${ASOUND_PKG})."
    exit 0
  fi

  echo "⚠️ apt-get install failed on attempt ${attempt}/3"
  sleep $((attempt * 5))
done

echo "❌ Failed to install Ubuntu system dependencies after 3 attempts."
exit 1
