#!/usr/bin/env bash
set -euo pipefail
image=${1:?Supply an image}
name="t3-smoke-${RANDOM}"
volume="${name}-home"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true' EXIT
for binary in t3 codex claude; do docker run --rm "$image" "$binary" --version; done
docker volume create "$volume" >/dev/null
start() {
  docker run -d --name "$name" --init -e APP_PASSWORD=smoke-test-password -v "$volume:/home/node" -p 127.0.0.1::8080 "$image" >/dev/null
  port=$(docker port "$name" 8080/tcp | cut -d: -f2)
  for attempt in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:$port/.well-known/t3/environment" > /tmp/t3-descriptor.json; then return; fi
    sleep 2
  done
  docker logs "$name"
  return 1
}
start
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
