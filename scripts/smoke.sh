#!/usr/bin/env bash
set -euo pipefail
image=${1:?Supply an image}
name="t3-smoke-${RANDOM}"
volume="${name}-home"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true' EXIT
# One container for all version checks instead of one cold start per binary.
docker run --rm "$image" sh -ec 'for binary in t3 codex cloudflared; do "$binary" --version; done'
# Claude Code is proprietary and must never be baked into the published image.
if docker run --rm "$image" sh -c 'command -v claude >/dev/null 2>&1 || find / -path /proc -prune -o -type d -path "*@anthropic-ai/claude-code" -print 2>/dev/null | grep -q .'; then
  echo "Claude Code must not be bundled in the image" >&2; exit 1
fi
# License notices must ship with the image.
docker run --rm "$image" sh -c 'cd /usr/share/licenses/t3-umbrel && test -s LICENSE && test -s THIRD_PARTY_NOTICES.md && test -s codex-Apache-2.0.txt && test -s cloudflared-Apache-2.0.txt'
docker volume create "$volume" >/dev/null
start() {
  docker run -d --name "$name" --init -e APP_PASSWORD=smoke-test-password -v "$volume:/home/node" -p 127.0.0.1::8080 "$image" >/dev/null
  port=$(docker port "$name" 8080/tcp | cut -d: -f2)
  for attempt in $(seq 1 360); do
    if curl -fsS "http://127.0.0.1:$port/.well-known/t3/environment" > /tmp/t3-descriptor.json; then return; fi
    sleep 0.5
  done
  docker logs "$name"
  return 1
}
start
# Verify the released CLI exposes Connect without requiring a user account.
docker exec "$name" t3 connect status --json | jq -e '.relayClient.status == "available"' >/dev/null
# Setup device codes must not be accessible without the separate app password.
test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/umbrel/connect")" = 401
curl -fsS -u umbrel:smoke-test-password "http://127.0.0.1:$port/umbrel/connect" | grep -q 'Link / sign in'
curl -fsS "http://127.0.0.1:$port/umbrel" | grep -q 'App password'
# Exercise the real native CLI/database pairing contract through the gateway.
curl -fsS -D /tmp/t3-pair-headers -o /dev/null \
  -H "Origin: http://127.0.0.1:$port" \
  --data 'password=smoke-test-password' "http://127.0.0.1:$port/umbrel/pair"
grep -qi 'location: /pair#token=' /tmp/t3-pair-headers
token=$(sed -n 's/^[Ll]ocation: \/pair#token=//p' /tmp/t3-pair-headers | tr -d '\r')
curl -fsS -c /tmp/t3-smoke-cookies -o /dev/null \
  -H "Origin: http://127.0.0.1:$port" -H 'Content-Type: application/json' \
  --data "$(jq -n --arg credential "$token" '{credential:$credential}')" \
  "http://127.0.0.1:$port/api/auth/browser-session"
curl -fsS -b /tmp/t3-smoke-cookies -H "Origin: http://127.0.0.1:$port" \
  "http://127.0.0.1:$port/api/auth/session" | jq -e '.authenticated == true' >/dev/null
docker exec "$name" sh -c 'test "$(id -u)" = 1000; echo persistent > /home/node/projects/smoke.txt; test -d /home/node/.t3'
docker stop --time 25 "$name" >/dev/null
test "$(docker inspect -f '{{.State.ExitCode}}' "$name")" = 0
docker rm "$name" >/dev/null
start
curl -fsS -b /tmp/t3-smoke-cookies -H "Origin: http://127.0.0.1:$port" \
  "http://127.0.0.1:$port/api/auth/session" | jq -e '.authenticated == true' >/dev/null
docker exec "$name" sh -c 'test "$(cat /home/node/projects/smoke.txt)" = persistent'
# No backend host port is published.
test -z "$(docker port "$name" 3773/tcp 2>/dev/null || true)"
