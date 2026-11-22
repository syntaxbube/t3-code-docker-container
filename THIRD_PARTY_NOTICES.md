# Third-party notices

This repository packages third-party software. Each component keeps its own
license; the MIT license in [LICENSE](LICENSE) applies to T3 Code and to the
original packaging files in this repository only.

The published container image includes a copy of these notices and license
texts under `/usr/share/licenses/t3-umbrel/`.

| Component | License | Notes |
| --- | --- | --- |
| [T3 Code](https://github.com/pingdotgg/t3code) | MIT, Copyright (c) 2026 T3 Tools Inc. | Downloaded unmodified from the official GitHub release and checksum-verified. Text: [licenses/t3code-MIT.txt](licenses/t3code-MIT.txt). |
| Dependencies inside the T3 Code release archive | Various; each ships its own license file | Kept intact under `/opt/t3`. The archive includes `@cursor/sdk`, which is proprietary ("© Anysphere Inc. All rights reserved", use subject to Cursor's Terms of Service). It is part of the unmodified upstream release and is **not** covered by the MIT license. |
| [OpenAI Codex CLI](https://github.com/openai/codex) | Apache-2.0, Copyright 2025 OpenAI | Installed from npm at build time. Text: [licenses/codex-Apache-2.0.txt](licenses/codex-Apache-2.0.txt); notice: [licenses/codex-NOTICE.txt](licenses/codex-NOTICE.txt). Use of the service requires your own OpenAI account and is subject to OpenAI's terms. |
| [cloudflared](https://github.com/cloudflare/cloudflared) | Apache-2.0, Copyright Cloudflare, Inc. | Unmodified release binary, checksum-verified. Text: [licenses/cloudflared-Apache-2.0.txt](licenses/cloudflared-Apache-2.0.txt). |
| [Claude Code](https://github.com/anthropics/claude-code) | Proprietary, © Anthropic PBC. All rights reserved. Use is subject to Anthropic's [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) or consumer terms, depending on your account. | **Not included in the published image and not redistributed by this project.** On first start, the container downloads it from the npm registry into your own persistent storage (`/home/node/.claude-cli`), so you obtain it directly from Anthropic under your own terms. Set `T3_INSTALL_CLAUDE_CODE=0` to disable this. |
| Debian packages and Node.js (base image `node:24-bookworm-slim`) | Various (mostly GPL/LGPL/MIT/BSD) | License texts are in `/usr/share/doc/*/copyright` inside the image. |
| Unslop methodology (setup page design) | CC BY 4.0, Damir Sokolovsky ([@heydamir](https://heydamir.design/unslop)) | Credited in `container/welcome.html` and the served page source. |

## Trademarks

"T3", "T3 Code" and the T3 logo belong to T3 Tools Inc. "Claude" and "Claude
Code" belong to Anthropic PBC. "Codex", "ChatGPT" and "OpenAI" belong to
OpenAI. "Umbrel" belongs to its owners. They are used here only to identify the
software this package works with. This project is independent and is not
affiliated with, sponsored by, or endorsed by any of them.
