#!/usr/bin/env bash
# Air cloud startup: dependencies, the web tests' Docker image, and (on warmup) a healthcheck that runs
# what CI runs. Skill Atlas is a CLI; its web view listens on 127.0.0.1 only, so no server is started here.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi

log() { echo "[startup] $*"; }

# The image npm run e2e uses, named as e2e/web/run.ts names it.
web_image() {
  node -e "
    const c = require('crypto'), f = require('fs');
    const v = JSON.parse(f.readFileSync('node_modules/playwright-core/package.json', 'utf8')).version;
    const tag = c.createHash('sha256').update(f.readFileSync('e2e/web/Dockerfile')).update(v).digest('hex').slice(0, 16);
    console.log((process.env.SKILL_ATLAS_WEB_REGISTRY || 'ghcr.io/paigethewen/skill-atlas-web-tests') + ':' + tag);"
}

wait_for_docker() {
  until docker info >/dev/null 2>&1; do log "waiting for the Docker daemon..."; sleep 2; done
}

healthcheck() {
  log "healthcheck: typecheck"
  npm run typecheck
  log "healthcheck: tests"
  npm test
  log "healthcheck: CLI smoke"
  ./skill-atlas help >/dev/null
  ./skill-atlas scan ./fixture
  ./skill-atlas serve --port 4173 & server=$!
  trap 'kill $server 2>/dev/null || true' RETURN
  until curl -sf http://127.0.0.1:4173/ >/dev/null; do
    kill -0 "$server" 2>/dev/null || { log "web view exited before answering"; return 1; }
    log "waiting for the web view on 4173..."; sleep 1
  done
  curl -sf 'http://127.0.0.1:4173/api/scan?repo=./fixture' | grep -q '"id":"fixture"'
  log "healthcheck: web tests in Docker"
  wait_for_docker
  npm run e2e
  log "healthcheck passed"
}

log "npm ci"
npm ci --no-audit --no-fund
log "npm ci done"

if [ -n "$WARMUP" ]; then
  wait_for_docker
  image=$(web_image)
  if docker image inspect "$image" >/dev/null 2>&1; then
    log "web test image present: $image"
  else
    log "pulling web test image $image"
    docker pull --quiet "$image" || log "pull failed; npm run e2e will build it"
  fi
  healthcheck
fi
log "done"
