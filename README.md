# T3 Code for Umbrel

An independent Umbrel community app store packaging [T3 Code](https://t3.codes)
with Codex and Claude Code. Runs on AMD64 and ARM64 Umbrel machines.

## Install

1. In Umbrel, open **App Store → Community App Stores**.
2. Add `https://github.com/syntaxbube/t3-code-docker-container`.
3. Install **T3 Code**, then open it from the Umbrel dashboard.
4. Enter the app password shown in Umbrel's app details and select **Connect to T3 Code**.
5. In **Settings → Providers**, enable Codex or Claude and sign in with your own account.
   Codex offers **Connect with ChatGPT**. For Claude, use the provider sign-in flow;
   if needed, open T3 Code's integrated terminal and run `claude auth login`.
   Follow the CLI's browser link and paste its returned code into the terminal.

Create projects under `/home/node/projects`. Use the integrated terminal to clone
repositories and configure Git identity, SSH keys, and repository authentication.
The bundled tools include Node.js 24, npm, Git, SSH, Bash, ripgrep, Python, make,
and a C++ compiler. Other language toolchains are not bundled.

The dashboard opens `/umbrel`, where already paired browsers can choose **Open
T3 Code**. Pairing links expire after five minutes; native browser sessions survive
restarts. Enter the app password again to pair a new browser. Both the Umbrel proxy
and the native T3 Code session protect access. The setup page additionally checks
the app password, including when reached from another container on the Umbrel network.

## Storage and backups

Umbrel mounts `${APP_DATA_DIR}/data/home` at `/home/node`. This contains projects,
T3 Code databases and history (`.t3`), provider credentials (`.codex`, `.claude`,
and `.claude.json`), Git configuration, and SSH keys. Treat backups as sensitive.
Stop the app before taking a manual copy of `data/` for a consistent database backup.
Restore it with ownership UID/GID `1000:1000`, then start the app. Files outside the
mounted home do not survive recreation. Avoid storing projects outside it.

The image and `/opt/t3` runtime are separate from user data. Updates replace the
image without hiding new binaries behind an old persistent installation. Use
Umbrel app updates, rather than `t3 update` or global npm updates inside the app.
Additional user tools can be installed into the persistent home; do not expect
system package installations to survive an upgrade. Uninstalling the app may
remove its data: export or back up projects first.

## Automatic stable updates

GitHub Actions checks upstream T3 Code releases every six hours (at 00:17,
06:17, 12:17, and 18:17 UTC; GitHub may delay scheduled jobs). You can also run
**Actions → Update stable T3 Code → Run workflow** for an immediate check.

Only newer stable `vX.Y.Z` releases qualify; drafts and prereleases are ignored.
The updater requires both Linux archives and their published SHA-256 checksums,
updates the Dockerfile in a temporary candidate, then builds and smoke-tests AMD64
and ARM64. After both pass, it publishes the multi-platform image and commits the
new version, release notes, Dockerfile checksums, and pinned image digest to `main`.
The commit and release tag are pushed together. Codex and Claude stay pinned.

Failed checks do not change the installed store package. If `main` changes during
the build, promotion stops; the next check retries from current `main`. Check the
workflow logs for failures. Standard GitHub Actions email notifications can notify
repository maintainers of failed runs. Updates become available through Umbrel;
the workflow does not force-upgrade running Umbrel installations.

No extra access token is needed: the workflow uses its built-in `GITHUB_TOKEN`
with package publishing and repository write permissions. [Bot pushes do not start
a second image workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow); the updater has already built and tested those images.
GitHub can [disable scheduled workflows in inactive public repositories after
60 days](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule); re-enable the workflow in Actions if that happens.

## Image and releases

Images are published publicly at
`ghcr.io/syntaxbube/t3-code-docker-container`. Each release builds and smoke-tests
both architectures on native GitHub runners, then publishes a multi-platform
manifest. The app's Compose file pins that manifest by digest.

Pinned tools: T3 Code **0.1.7**, Codex **0.167.0**, Claude Code **2.1.319**.
Upstream T3 release archives are verified with architecture-specific SHA-256
checksums. T3 Code and this packaging are MIT licensed; bundled third-party tools
retain their respective licenses and account requirements.

For a release, update tool versions and checksums in `Dockerfile`, update listing
and documentation versions, then push a `v<version>-umbrel.<revision>` tag.
After the Container image workflow succeeds, obtain the multi-platform digest
with `docker buildx imagetools inspect`, update the app's Compose image reference,
and commit it to `main`. Only point the store at a published, anonymously pullable
image. Images use public GHCR package visibility; source repository visibility
alone does not guarantee public package visibility.

## Development and verification

```sh
CHROMIUM_PATH=/usr/bin/chromium node --test tests/*.test.mjs
python -m pip install PyYAML
python scripts/validate.py
python -m unittest discover -s tests -p 'test_*.py'
bash -n scripts/smoke.sh
docker buildx build --platform linux/amd64 --load -t t3-umbrel:test .
bash scripts/smoke.sh t3-umbrel:test
```

The gateway tests cover real Chromium form submission (set `CHROMIUM_PATH` to
your Chromium/Chrome executable), password rejection, cross-origin rejection, native pairing
redirects, cookie forwarding, and WebSocket upgrades. CI runs real executable,
HTTP, pairing, non-root write, shutdown, and recreation/persistence smoke checks on
both architectures. No provider account is needed for CI.

Before declaring an Umbrel release fully verified, test on an actual Umbrel:
install from this store, open through its authenticated proxy, pair a browser,
authenticate both providers, complete one task with each, and recreate/update the
app to confirm credentials and projects persist. Umbrel proxy WebSockets and
provider OAuth behavior require that integration check; CI does not substitute for it.

No host Docker socket, privileged mode, host networking, or unrelated host mounts
are used. The backend listens on container loopback; only the gateway is reachable
by Umbrel's app proxy, with no direct host-published backend port. Remote internet
access is outside this package's default configuration.

## Credits and support

T3 Code: [pingdotgg/t3code](https://github.com/pingdotgg/t3code), by T3 Tools Inc.
This is not an official T3 Tools or Umbrel release. Report packaging issues in
[this repository](https://github.com/syntaxbube/t3-code-docker-container/issues).
