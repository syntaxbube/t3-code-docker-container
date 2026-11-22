# syntax=docker/dockerfile:1
# Independent downloads and Codex install run in parallel BuildKit stages, and the
# frequently bumped T3 Code layer is last among tool layers so updates reuse apt/Codex caches.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS t3
ARG TARGETARCH
ARG T3_VERSION=0.1.11
# Keep the entire upstream runtime tree (client assets and native modules included).
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x64; checksum=2b691c07f5bcb5adea4a863d5324aae7db21bd6d82280cec7787836dcaa013e1 ;; \
      arm64) arch=arm64; checksum=7d90a5af032fe0988a616403e0f51a6cb68eff7ed7a84bc40999cc3997dffd71 ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    test "$T3_VERSION" = 0.1.11; \
    node -e ' \
      const { createHash } = require("node:crypto"); \
      const { createWriteStream, unlinkSync } = require("node:fs"); \
      const { pipeline } = require("node:stream/promises"); \
      const { Readable } = require("node:stream"); \
      const [url, dest, expected] = process.argv.slice(1); \
      (async () => { \
        for (let attempt = 1; ; attempt++) { \
          try { \
            const res = await fetch(url, { signal: AbortSignal.timeout(120000) }); \
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`); \
            const hash = createHash("sha256"); \
            const body = Readable.fromWeb(res.body); \
            body.on("data", chunk => hash.update(chunk)); \
            await pipeline(body, createWriteStream(dest)); \
            const actual = hash.digest("hex"); \
            if (actual !== expected) throw new Error(`Checksum mismatch: ${actual} !== ${expected}`); \
            return; \
          } catch (err) { \
            try { unlinkSync(dest); } catch {} \
            if (attempt >= 3) throw err; \
            await new Promise(r => setTimeout(r, 1000)); \
          } \
        } \
      })().catch(err => { console.error(err); process.exit(1); }); \
    ' "https://github.com/pingdotgg/t3code/releases/download/v${T3_VERSION}/t3-${T3_VERSION}-linux-${arch}.tar.gz" /tmp/t3.tar.gz "$checksum"; \
    mkdir -p /out/opt/t3 /out/usr/local/bin; \
    tar -xzf /tmp/t3.tar.gz -C /out/opt/t3 --strip-components=1; \
    ln -s /opt/t3/t3 /out/usr/local/bin/t3; \
    rm /tmp/t3.tar.gz

FROM ${NODE_IMAGE} AS cloudflared
ARG TARGETARCH
ARG CLOUDFLARED_VERSION=2026.10.4
# Pin the same verified tunnel client used by the upstream T3 release.
RUN set -eu; mkdir -p /out; \
    case "$TARGETARCH" in \
      amd64) relay_checksum=ae5e8add7884b0531d66bbca4570d1de491ff6da51e4ebe7eb160cdf241d9e42 ;; \
      arm64) relay_checksum=2b7203b4fb0ba28a0c1e12f8855ce2c25f76d266a8d5edafac5540b6812acff6 ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    node -e ' \
      const { createHash } = require("node:crypto"); \
      const { createWriteStream, unlinkSync } = require("node:fs"); \
      const { pipeline } = require("node:stream/promises"); \
      const { Readable } = require("node:stream"); \
      const [url, dest, expected] = process.argv.slice(1); \
      (async () => { \
        for (let attempt = 1; ; attempt++) { \
          try { \
            const res = await fetch(url, { signal: AbortSignal.timeout(120000) }); \
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`); \
            const hash = createHash("sha256"); \
            const body = Readable.fromWeb(res.body); \
            body.on("data", chunk => hash.update(chunk)); \
            await pipeline(body, createWriteStream(dest)); \
            const actual = hash.digest("hex"); \
            if (actual !== expected) throw new Error(`Checksum mismatch: ${actual} !== ${expected}`); \
            return; \
          } catch (err) { \
            try { unlinkSync(dest); } catch {} \
            if (attempt >= 3) throw err; \
            await new Promise(r => setTimeout(r, 1000)); \
          } \
        } \
      })().catch(err => { console.error(err); process.exit(1); }); \
    ' "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${TARGETARCH}" /out/cloudflared "$relay_checksum"; \
    chmod 755 /out/cloudflared

FROM ${NODE_IMAGE} AS codex
ARG CODEX_VERSION=0.167.0
RUN --mount=type=cache,target=/root/.npm \
    npm install --global --prefix /out/usr/local --no-audit --no-fund --no-update-notifier "@openai/codex@${CODEX_VERSION}"

FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.source="https://github.com/syntaxbube/t3-code-docker-container" \
      org.opencontainers.image.title="T3 Code for Umbrel" \
      org.opencontainers.image.licenses="MIT"
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git openssh-client ripgrep python3 make g++ \
    libatomic1 libsecret-1-0 procps
# Claude Code is proprietary (Anthropic, all rights reserved) and is deliberately NOT
# bundled in this image. On first start it is downloaded from npm into the user's own
# persistent home (see container/claude-install.mjs), so each user obtains it from
# Anthropic directly under their own terms. Set T3_INSTALL_CLAUDE_CODE=0 to disable.
COPY --from=codex /out/ /
COPY --from=cloudflared /out/cloudflared /usr/local/bin/cloudflared
ENV T3CODE_CLOUDFLARED_PATH=/usr/local/bin/cloudflared
COPY --from=t3 /out/ /
COPY --chown=root:root LICENSE THIRD_PARTY_NOTICES.md licenses/ /usr/share/licenses/t3-umbrel/
COPY --chown=root:root container/ /opt/umbrel/
ENV HOME=/home/node T3CODE_HOME=/home/node/.t3 NODE_ENV=production \
    T3_CLAUDE_CODE_VERSION=2.1.319 \
    PATH=/home/node/.claude-cli/node_modules/.bin:$PATH
USER 1000:1000
WORKDIR /home/node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl --fail --silent --max-time 4 http://127.0.0.1:8080/.well-known/t3/environment >/dev/null || exit 1
CMD ["node", "/opt/umbrel/start.mjs"]
