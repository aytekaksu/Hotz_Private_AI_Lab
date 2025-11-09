#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "[deploy] Bun 1.3.2+ is required. Install it from https://bun.sh" >&2
  exit 1
fi

USE_NO_CACHE=false
BUILDX_BUILDER_NAME=${BUILDX_BUILDER_NAME:-hotz_lab_builder}
DOCKER_CACHE_DIR="$(pwd)/.docker/cache"
DOCKER_CACHE_TMP="$(pwd)/.docker/cache-tmp"
BUILDX_READY=0

show_help() {
  cat <<'EOF'
Usage: bun run deploy [--clean|--no-cache]

Options:
  --clean, --no-cache   Force a clean Docker build without layer caching.
  -h, --help            Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clean|--no-cache)
      USE_NO_CACHE=true
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "[deploy] Unknown option: $1" >&2
      show_help
      exit 1
      ;;
  esac
done

if [[ "$USE_NO_CACHE" == "true" ]]; then
  echo "[deploy] Clean build requested (Docker cache disabled)."
fi

ensure_buildx() {
  if (( BUILDX_READY == 1 )); then
    return
  fi
  if ! docker buildx version >/dev/null 2>&1; then
    bash scripts/setup-buildx.sh
  fi
  if ! docker buildx version >/dev/null 2>&1; then
    echo "[deploy] Docker Buildx is required but could not be installed." >&2
    exit 1
  fi
  if ! docker buildx inspect "$BUILDX_BUILDER_NAME" >/dev/null 2>&1; then
    echo "[deploy] Creating Docker Buildx builder ($BUILDX_BUILDER_NAME)…"
    docker buildx create --name "$BUILDX_BUILDER_NAME" --driver docker-container --use >/dev/null
  else
    docker buildx use "$BUILDX_BUILDER_NAME" >/dev/null
  fi
  BUILDX_READY=1
}

SCRIPT_START_MS=$(date +%s%3N)
declare -a STEP_TIMINGS=()
SLOWEST_LABEL=""
SLOWEST_DURATION_MS=0

record_timing() {
  local label=$1
  local duration_ms=$2
  STEP_TIMINGS+=("$label|$duration_ms")
  if (( duration_ms > SLOWEST_DURATION_MS )); then
    SLOWEST_DURATION_MS=$duration_ms
    SLOWEST_LABEL=$label
  fi
}

format_duration() {
  awk -v ms="$1" 'BEGIN { printf "%.2f", ms / 1000 }'
}

print_summary() {
  local total_ms=$(( $(date +%s%3N) - SCRIPT_START_MS ))
  echo "[deploy] Timing summary:"
  for entry in "${STEP_TIMINGS[@]}"; do
    IFS="|" read -r label duration <<<"$entry"
    printf "  - %s: %ss\n" "$label" "$(format_duration "$duration")"
  done
  if [[ -n "$SLOWEST_LABEL" ]]; then
    printf "[deploy] Slowest step: %s at %ss\n" "$SLOWEST_LABEL" "$(format_duration "$SLOWEST_DURATION_MS")"
  fi
  printf "[deploy] Total deploy time: %ss\n" "$(format_duration "$total_ms")"
}
trap print_summary EXIT

run_step() {
  local label=$1
  shift
  local start_ms
  start_ms=$(date +%s%3N)
  echo "[deploy] $label…"
  "$@"
  local duration_ms=$(( $(date +%s%3N) - start_ms ))
  record_timing "$label" "$duration_ms"
}

ensure_dependencies() {
  if ! bun install >/dev/null 2>&1; then
    bun install
  fi
}

build_web_image() {
  ensure_buildx
  local cmd=(buildx build --builder "$BUILDX_BUILDER_NAME" --progress=plain --load --tag hotz_private_ai_lab-web --file apps/web/Dockerfile --build-arg APP_SRC=apps/web .)
  if [[ "$USE_NO_CACHE" == "true" ]]; then
    cmd+=(--no-cache)
  else
    if [[ -d "$DOCKER_CACHE_DIR" ]]; then
      cmd+=(--cache-from "type=local,src=$DOCKER_CACHE_DIR")
    fi
    rm -rf "$DOCKER_CACHE_TMP"
    mkdir -p "$DOCKER_CACHE_TMP"
    cmd+=(--cache-to "type=local,dest=$DOCKER_CACHE_TMP,mode=max")
  fi
  docker "${cmd[@]}"
  local status=$?
  if [[ "$USE_NO_CACHE" != "true" ]]; then
    if [[ $status -eq 0 ]]; then
      rm -rf "$DOCKER_CACHE_DIR"
      mv "$DOCKER_CACHE_TMP" "$DOCKER_CACHE_DIR"
    else
      rm -rf "$DOCKER_CACHE_TMP"
    fi
  else
    rm -rf "$DOCKER_CACHE_TMP"
  fi
  return $status
}

run_db_migrations() {
  DATABASE_URL="file://$(pwd)/data/sqlite/app.db" bun run db:migrate || true
}

health_check() {
  curl -fsS https://assistant.aytekaksu.com/api/health || true
}

run_step "Ensuring workspace dependencies" ensure_dependencies
run_step "Building web image" build_web_image
run_step "Recreating web service" docker-compose up -d web
run_step "Running DB migrations" run_db_migrations
run_step "Services status" docker-compose ps
run_step "Health check" health_check

echo "[deploy] Done."
