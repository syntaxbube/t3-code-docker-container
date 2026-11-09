<p align="center">
  <img src="assets/icon.svg" alt="T3 Code icon" width="92">
</p>

<h1 align="center">T3 Code for Umbrel</h1>

<p align="center">
  Run T3 Code with Codex and Claude Code on your own Umbrel server — in your browser, with persistent projects and optional remote access.
</p>

<p align="center">
  <a href="https://github.com/syntaxbube/t3-code-docker-container/actions/workflows/image.yml"><img alt="Container image workflow" src="https://github.com/syntaxbube/t3-code-docker-container/actions/workflows/image.yml/badge.svg"></a>
  <a href="https://github.com/syntaxbube/t3-code-docker-container/actions/workflows/update-t3.yml"><img alt="Stable update workflow" src="https://github.com/syntaxbube/t3-code-docker-container/actions/workflows/update-t3.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="AMD64 and ARM64" src="https://img.shields.io/badge/platform-AMD64%20%7C%20ARM64-informational.svg">
</p>

> [!IMPORTANT]
> This is an **independent Umbrel community app store**, not an official release from T3 Tools or Umbrel. You need your own provider account; provider subscriptions or usage charges are not included.

## Features

- **Browser-based AI coding:** enable Codex or Claude Code in T3 Code's provider settings.
- **Self-hosted on Umbrel:** installs on AMD64 and ARM64 Umbrel machines, with no host-published backend port.
- **Persistent workspace:** projects, conversation history, settings, and provider credentials survive container recreation and app updates.
- **Optional T3 Connect:** link your server to your T3 account for remote access from supported clients.
- **Verified releases:** container builds and smoke tests cover both architectures; upstream stable T3 Code releases are checked automatically.

## Requirements

| Requirement | Details |
| --- | --- |
| Host | Running Umbrel installation with support for community app stores |
| CPU | AMD64 (x86-64) or ARM64 |
| Provider | Your own Codex/ChatGPT or Claude account, according to the provider's access requirements |
| Network | Internet access for downloading the app and authenticating providers |
| Optional | A T3 account to set up T3 Connect remote access |

## Quick start

1. Open **Umbrel → App Store → Community App Stores**.
2. Add this store: **`https://github.com/syntaxbube/t3-code-docker-container`**.
3. Install **T3 Code** and open it from the Umbrel dashboard.
4. Enter the **app password** shown in Umbrel's app details, then select **Connect to T3 Code**.
5. Open **Settings → Providers**, enable Codex or Claude Code, and sign into your account.

For Codex, choose **Connect with ChatGPT**. For Claude Code, follow the provider sign-in screen; if needed, use `claude auth login` in the integrated terminal and complete the browser/code flow.

**Your first project:** create or clone a repository under `/home/node/projects` using the integrated terminal. The image includes Node.js 24, npm, Git, SSH, Bash, ripgrep, Python, make, and a C++ compiler. Other language toolchains are not installed by default.

Already paired browsers can choose **Open T3 Code** at `/umbrel`. Pairing links expire after five minutes; use the app password again to pair a different browser.

## Remote access with T3 Connect

T3 Connect is optional and is configured independently of the local browser session.

1. On the `/umbrel` page, select **Set up T3 Connect remote access**.
2. At the credential prompt, enter username **umbrel** and your Umbrel app password.
3. Select **Link / sign in**, open the displayed HTTPS sign-in link, and approve the device code on your device.
4. After the server restarts, check **Status** to verify authentication and reachability. Sign into the same account in the official T3 client or at [app.t3.codes](https://app.t3.codes).

Linking and **Disconnect** restart the T3 server and interrupt running tasks, so perform those actions while idle. Disconnect disables remote access but retains CLI authorization. T3 Connect uses a pinned and checksum-verified Cloudflare tunnel client and does not install a host service. External reachability still needs to be verified with your account.

## Storage, backups, and updates

Umbrel persists `${APP_DATA_DIR}/data/home` as `/home/node` inside the app. This stores projects, conversation history (`.t3`), provider credentials, and Git/SSH configuration. Treat backups as sensitive: **stop the app before making a manual copy of `data/`**, and restore with UID/GID `1000:1000`. Files outside the mounted home may not survive container recreation. Back up before uninstalling.

Update through **Umbrel**, not `t3 update` or global npm updates in the container. The latest stable upstream T3 Code release is checked every six hours, built and smoke-tested for AMD64/ARM64 before publication; running installations are **not** force-upgraded.

Pinned tools: T3 Code **0.1.7**, Codex **0.167.0**, Claude Code **2.1.319**.

Codex and Claude Code versions are currently pinned separately from the automatic T3 Code updater. For implementation and release details, see [Development and releases](docs/development.md).

## Troubleshooting

Common problems and fixes are covered in the [Troubleshooting and FAQ](docs/troubleshooting.md), including expired pairing links, provider login, T3 Connect, persistence, and logs.

## Development and contributing

See [Development and releases](docs/development.md) for architecture, CI, version updates, smoke tests, and release instructions. Issues and packaging bugs belong in the [issue tracker](https://github.com/syntaxbube/t3-code-docker-container/issues).

## Credits and license

[T3 Code](https://github.com/pingdotgg/t3code) is made by T3 Tools Inc. This independently maintained Umbrel packaging and T3 Code are MIT licensed; bundled third-party tools retain their own licenses, terms, and account requirements. See [LICENSE](LICENSE).
