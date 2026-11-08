# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
ARG TARGETARCH
ARG T3_VERSION=0.1.7
ARG CODEX_VERSION=0.167.0
ARG CLAUDE_VERSION=2.1.319
LABEL org.opencontainers.image.source="https://github.com/syntaxbube/t3-code-docker-container" \
      org.opencontainers.image.title="T3 Code for Umbrel" \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git openssh-client bash ripgrep python3 make g++ \
    libatomic1 libstdc++6 libsecret-1-0 procps \
    && rm -rf /var/lib/apt/lists/*
# Keep the entire upstream runtime tree (client assets and native modules included).
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x64; checksum=c089892bf7922e2e73c6f44a5d1ea125c99f70e378c18361cbbed2fba1920e6c ;; \
      arm64) arch=arm64; checksum=5a528e23af394cc6f359036d3cb8441fda14129d477630fc6c53e4f4a1025bc8 ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    test "$T3_VERSION" = 0.1.7; \
    curl -fL --retry 3 "https://github.com/pingdotgg/t3code/releases/download/v${T3_VERSION}/t3-${T3_VERSION}-linux-${arch}.tar.gz" -o /tmp/t3.tar.gz; \
    echo "$checksum  /tmp/t3.tar.gz" | sha256sum -c -; \
    mkdir -p /opt/t3; tar -xzf /tmp/t3.tar.gz -C /opt/t3 --strip-components=1; \
    ln -s /opt/t3/t3 /usr/local/bin/t3; rm /tmp/t3.tar.gz
# Pin the same verified tunnel client used by the upstream T3 release.
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) relay_checksum=ae5e8add7884b0531d66bbca4570d1de491ff6da51e4ebe7eb160cdf241d9e42 ;; \
      arm64) relay_checksum=2b7203b4fb0ba28a0c1e12f8855ce2c25f76d266a8d5edafac5540b6812acff6 ;; \
      *) exit 1 ;; \
    esac; \
    curl -fL --retry 3 "https://github.com/cloudflare/cloudflared/releases/download/2026.10.4/cloudflared-linux-${TARGETARCH}" -o /usr/local/bin/cloudflared; \
    echo "$relay_checksum  /usr/local/bin/cloudflared" | sha256sum -c -; \
    chmod 755 /usr/local/bin/cloudflared
ENV T3CODE_CLOUDFLARED_PATH=/usr/local/bin/cloudflared
RUN npm install --global "@openai/codex@${CODEX_VERSION}" "@anthropic-ai/claude-code@${CLAUDE_VERSION}" \
    && npm cache clean --force
COPY --chown=root:root container/ /opt/umbrel/
ENV HOME=/home/node T3CODE_HOME=/home/node/.t3 NODE_ENV=production
USER 1000:1000
WORKDIR /home/node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:3773/.well-known/t3/environment >/dev/null || exit 1
CMD ["node", "/opt/umbrel/start.mjs"]
