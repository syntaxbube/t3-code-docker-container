# syntax=docker/dockerfile:1
# Independent downloads run in parallel BuildKit stages, and the frequently bumped
# T3 Code layer is last so a version update never rebuilds apt or npm layers.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS fetch
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

FROM fetch AS t3
ARG TARGETARCH
ARG T3_VERSION=0.1.9
# Keep the entire upstream runtime tree (client assets and native modules included).
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x64; checksum=0141025335da334759cecd8db3483e09772f3600ca03674698524e7d94291362 ;; \
      arm64) arch=arm64; checksum=52023bc5728a4dee4de361ad6fef7c236f1efb2742ff25e29d5c55e2fb662eea ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    test "$T3_VERSION" = 0.1.9; \
    curl -fL --retry 3 "https://github.com/pingdotgg/t3code/releases/download/v${T3_VERSION}/t3-${T3_VERSION}-linux-${arch}.tar.gz" -o /tmp/t3.tar.gz; \
    echo "$checksum  /tmp/t3.tar.gz" | sha256sum -c -; \
    mkdir -p /out/opt/t3 /out/usr/local/bin; tar -xzf /tmp/t3.tar.gz -C /out/opt/t3 --strip-components=1; \
    ln -s /opt/t3/t3 /out/usr/local/bin/t3; rm /tmp/t3.tar.gz

FROM fetch AS cloudflared
ARG TARGETARCH
# Pin the same verified tunnel client used by the upstream T3 release.
RUN set -eu; mkdir -p /out; \
    case "$TARGETARCH" in \
      amd64) relay_checksum=ae5e8add7884b0531d66bbca4570d1de491ff6da51e4ebe7eb160cdf241d9e42 ;; \
      arm64) relay_checksum=2b7203b4fb0ba28a0c1e12f8855ce2c25f76d266a8d5edafac5540b6812acff6 ;; \
      *) exit 1 ;; \
    esac; \
    curl -fL --retry 3 "https://github.com/cloudflare/cloudflared/releases/download/2026.10.4/cloudflared-linux-${TARGETARCH}" -o /out/cloudflared; \
    echo "$relay_checksum  /out/cloudflared" | sha256sum -c -; \
    chmod 755 /out/cloudflared

FROM ${NODE_IMAGE}
ARG CODEX_VERSION=0.167.0
ARG CLAUDE_VERSION=2.1.319
LABEL org.opencontainers.image.source="https://github.com/syntaxbube/t3-code-docker-container" \
      org.opencontainers.image.title="T3 Code for Umbrel" \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git openssh-client bash ripgrep python3 make g++ \
    libatomic1 libstdc++6 libsecret-1-0 procps \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global --no-audit --no-fund --no-update-notifier \
      "@openai/codex@${CODEX_VERSION}" "@anthropic-ai/claude-code@${CLAUDE_VERSION}" \
    && npm cache clean --force
COPY --from=cloudflared /out/cloudflared /usr/local/bin/cloudflared
ENV T3CODE_CLOUDFLARED_PATH=/usr/local/bin/cloudflared
# Keep the entire upstream runtime tree (client assets and native modules included).
COPY --from=t3 /out/ /
COPY --chown=root:root container/ /opt/umbrel/
ENV HOME=/home/node T3CODE_HOME=/home/node/.t3 NODE_ENV=production
USER 1000:1000
WORKDIR /home/node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:3773/.well-known/t3/environment >/dev/null || exit 1
CMD ["node", "/opt/umbrel/start.mjs"]
