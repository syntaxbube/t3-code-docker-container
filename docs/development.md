# Development and releases

This document describes how the independently maintained [T3 Code for Umbrel](../README.md) package is built, tested, and released. For installation and daily usage, start with the main README.

## Architecture and security

The image and `/opt/t3` runtime are separate from user data. Umbrel mounts `${APP_DATA_DIR}/data/home` to `/home/node`. The app runs as UID/GID `1000:1000` and has no privileged mode, host networking, host Docker socket, or unrelated host mounts.

The T3 backend listens only on the container loopback interface. Umbrel's app proxy reaches the gateway; no backend port is published directly to the host. The `/umbrel` setup page requires the app password, including requests arriving from other containers on the Umbrel network. Both the Umbrel proxy and T3 Code's native session protect access.

Browser pairing links last five minutes. Native sessions survive restarts. Gateway integration tests exercise real Chromium form submission, password and cross-origin rejection, native pairing redirects, cookie forwarding, and WebSocket upgrades.

Remote access via T3 Connect is **opt-in**. Its separate headless setup page supports device-code linking and disconnecting, and restarts T3 when the tunnel is enabled or disabled. No host service is installed. Setup codes and command output are password-protected and are not written to container logs. The bundled Cloudflare tunnel client is version-pinned and checksum-verified. The local LAN web UI still follows upstream sign-in-domain restrictions.

## Automatic stable updates

[Update stable T3 Code](../.github/workflows/update-t3.yml) checks upstream releases every six hours, scheduled at **00:17, 06:17, 12:17, and 18:17 UTC** (GitHub may delay scheduled jobs). A maintainer can also run **Actions → Update stable T3 Code → Run workflow**.

Only a newer stable `vX.Y.Z` release qualifies. Drafts and prereleases are excluded. The update process:

1. Requires published Linux AMD64 and ARM64 archives and matching SHA-256 checksums.
2. Builds a candidate Dockerfile and tests it on native GitHub runners for both architectures.
3. Publishes tested images and assembles a multi-platform manifest.
4. Updates the Dockerfile, release notes, manifest digest in the Compose reference, and the main README's **Pinned tools** version.
5. Pushes the release commit and tag together only if `main` has not changed since candidate preparation.

Codex and Claude Code stay pinned; this automatic updater only advances upstream T3 Code. Failed checks do not alter the store package. If `main` changes during the build, promotion stops and a subsequent run can retry. Umbrel exposes the new package as an update; the workflow does not force-update running installations.

The workflow uses the built-in `GITHUB_TOKEN` with repository-write and package-publishing permissions; no separate token is required. [Commits pushed with `GITHUB_TOKEN` do not trigger another image workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). GitHub may [disable scheduled workflows after 60 days of inactivity](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) for public repositories; maintainers can re-enable them in Actions.

## Image publishing and manual releases

Public images are published to [GitHub Container Registry](https://github.com/syntaxbube/t3-code-docker-container/pkgs/container/t3-code-docker-container) as `ghcr.io/syntaxbube/t3-code-docker-container`. Images are built and smoke-tested for AMD64 and ARM64. The Umbrel Compose file pins the multi-platform image by digest. GitHub repository visibility alone does not guarantee anonymous access to a GHCR package: verify that the published image is publicly pullable.

For a manual release:

1. Update pinned tool versions and verified checksums in [Dockerfile](../Dockerfile).
2. Update the package version, release notes, and relevant documentation.
3. Push a tag matching `v<version>-umbrel.<revision>`.
4. After the [Container image workflow](../.github/workflows/image.yml) succeeds, obtain the multi-platform digest with `docker buildx imagetools inspect`.
5. Update the Compose image reference and commit it to `main` only after confirming that the image can be pulled anonymously.

Prefer Umbrel-managed application updates to running `t3 update` or global npm upgrades inside the container. Image recreation should replace the runtime without hiding new binaries behind old persisted installations.

## Local tests

Run from the repository root. Adjust `CHROMIUM_PATH` to a locally installed Chromium or Chrome executable.

```sh
CHROMIUM_PATH=/usr/bin/chromium node --test tests/*.test.mjs
python -m pip install PyYAML
python scripts/validate.py
python -m unittest discover -s tests -p 'test_*.py'
bash -n scripts/smoke.sh
docker buildx build --platform linux/amd64 --load -t t3-umbrel:test .
bash scripts/smoke.sh t3-umbrel:test
```

CI exercises actual executable startup, HTTP access, pairing, non-root writes, shutdown, and recreation/persistence on both architectures. CI does not need a provider account.

## Manual Umbrel acceptance test

Before calling a release fully verified on Umbrel:

1. Install the app from this community store.
2. Open it through Umbrel's authenticated proxy and pair a browser.
3. Sign into both providers and complete a test task with each.
4. Recreate or update the app; confirm projects, history, settings, and credentials persist.
5. Test remote T3 Connect sign-in and reachability when the feature is part of the release.

The Umbrel proxy's WebSocket behavior and provider OAuth flows cannot be fully verified by the standalone CI suite.

## Contributions

Open an [issue](https://github.com/syntaxbube/t3-code-docker-container/issues) for packaging bugs and include the Umbrel version, architecture, app/package version, the steps to reproduce, and sanitized logs. Never post credentials, app passwords, tokens, pairing URLs, or device codes. This is an independent community project, not an official T3 Tools or Umbrel release.

## Frontend components

The optional React/TypeScript component preview is documented in
[frontend.md](frontend.md). It uses shadcn-compatible `/components/ui` paths and
Tailwind CSS. Its build is independent of the container-served setup page.
