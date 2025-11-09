#!/usr/bin/env bash
set -euo pipefail

VERSION="${BUILDX_VERSION:-v0.29.1}"
PLUGIN_DIR="${HOME}/.docker/cli-plugins"
TARGET="${PLUGIN_DIR}/docker-buildx"

if command -v docker >/dev/null 2>&1 && docker buildx version >/dev/null 2>&1; then
  exit 0
fi

mkdir -p "${PLUGIN_DIR}"

ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64|amd64)
    ARCH="amd64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    echo "[buildx] Unsupported architecture: ${ARCH}" >&2
    exit 1
    ;;
esac

TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

URL="https://github.com/docker/buildx/releases/download/${VERSION}/buildx-${VERSION}.linux-${ARCH}"
echo "[buildx] Installing Docker Buildx ${VERSION} for ${ARCH}…"
curl -fsSL "${URL}" -o "${TMP}"
install -m 0755 "${TMP}" "${TARGET}"
echo "[buildx] Installed at ${TARGET}"
