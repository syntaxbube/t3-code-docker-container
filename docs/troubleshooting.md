# Troubleshooting and FAQ

This page is for the [T3 Code for Umbrel](../README.md) community package.

## I cannot connect a browser

1. Open the app again from the Umbrel dashboard and locate the app password in Umbrel's app details.
2. Enter it on the `/umbrel` setup screen, then select **Connect to T3 Code**.
3. Pairing links expire after **five minutes**. If you opened an old link, start a fresh pairing from `/umbrel`.
4. Already paired browsers can normally choose **Open T3 Code**. Native sessions persist through restarts.

If access still fails, check that the app is running and examine the logs. Note that both the Umbrel proxy and native session enforce authentication. Do not post app passwords or pairing links.

## Codex or Claude Code does not appear / cannot sign in

Open **Settings → Providers** and enable the provider first.

- **Codex:** choose **Connect with ChatGPT** and sign in with the appropriate ChatGPT account.
- **Claude Code:** use the provider sign-in flow. If it does not complete, open the T3 Code integrated terminal, run `claude auth login`, open the CLI-provided link, and paste the returned code into the terminal.

These providers require your own accounts and are subject to their own access rules, subscriptions, and potential charges. Their availability is not provided by this Umbrel package.

## T3 Connect remote access is not working

1. Open **Set up T3 Connect remote access** from `/umbrel`.
2. When asked for credentials, use **umbrel** as the username and your Umbrel app password.
3. Choose **Link / sign in**, open the HTTPS authorization link on your own device, and approve the shown device code.
4. After linking, allow the T3 server restart to complete; linking interrupts tasks that were running.
5. Use **Status** on the setup page to check authentication and reachability. Sign in with the same T3 account in the official mobile/desktop app or at [app.t3.codes](https://app.t3.codes).

**Disconnect** turns off remote access and restarts the server, but keeps the CLI authorization. Linking is separate from the LAN web UI because upstream applies sign-in-domain restrictions. Successful device approval alone is not proof of external reachability; verify it through your own account and network.

## Where are projects and credentials stored?

Store projects under `/home/node/projects`. The volume `${APP_DATA_DIR}/data/home` on the Umbrel host is mounted as `/home/node` and contains projects, history (`.t3`), provider credentials (`.codex`, `.claude`, `.claude.json`), Git identity, and SSH keys.

Stop the app before manually copying its `data/` directory for a consistent database backup. Restore the files with ownership **1000:1000** before starting it again. Treat those backups as sensitive and protect them. Files stored outside the mounted home may disappear when the container is recreated.

Uninstalling the app may delete its data. Back up or export your projects first.

## An upgrade did not keep an installed system tool

The app image and its `/opt/t3` runtime are replaced during upgrades. Changes made to system packages inside the container are not guaranteed to persist. Tools installed under the persistent home can survive upgrades. The bundled toolchain includes Node.js 24, npm, Git, SSH, Bash, ripgrep, Python, make, and a C++ compiler; other language toolchains are not bundled.

Install updates through Umbrel rather than running `t3 update` or global npm updates in the app.

## Where can I find logs?

Start with the app's status or log view in Umbrel if your version provides one. On the Umbrel host, users with Docker access can inspect containers and logs, for example:

```sh
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep t3code
docker logs --tail 100 t3code-t3-code_server_1
```

The container name shown is the name used by this package's proxy configuration; use the actual name from `docker ps` if it differs. Redact credentials, tokens, URLs with authentication codes, and personal project content before sharing logs.

## Where should bugs be reported?

Use this repository's [issue tracker](https://github.com/syntaxbube/t3-code-docker-container/issues) for Umbrel packaging and integration problems. For upstream application issues, consult [pingdotgg/t3code](https://github.com/pingdotgg/t3code).
