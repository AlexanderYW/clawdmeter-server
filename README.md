# clawdmeter-server

BLE host daemon for the [Clawdmeter](https://github.com/) ESP32 Claude usage monitor.
Polls Anthropic rate-limit headers and forwards a compact status payload over
Bluetooth LE to the "Claude Controller" firmware.

Cross-platform (macOS + Linux), single Node/Bun binary.

## Install

```bash
npm install -g clawdmeter-server
```

Requires Node ≥ 20.

## Run

```bash
clawdmeter-server
```

The daemon will scan for the ESP32, connect, and start polling. Logs go to stdout.

## Install as a background service

The package ships with a helper script that installs a user-level service
(systemd on Linux, LaunchAgent on macOS):

```bash
# from the install dir, e.g. $(npm root -g)/clawdmeter-server
./service/install.sh
```

- **Linux**: writes `~/.config/systemd/user/claude-usage-daemon.service` and enables it.
- **macOS**: writes `~/Library/LaunchAgents/com.user.claude-usage-daemon.plist` and loads it.

## Platform setup

### macOS

- On first run, macOS prompts for Bluetooth permission for the *parent* process
  (Terminal, iTerm, or `launchd` if running as a LaunchAgent). Approve under
  **System Settings → Privacy & Security → Bluetooth**.
- The OAuth token is read from the Keychain entry `Claude Code-credentials`,
  with a fallback to `~/.claude/.credentials.json`.

### Linux

- noble needs raw HCI socket access. Either run as root, or grant the capability
  to your Node binary once:

  ```bash
  sudo setcap cap_net_raw+eip "$(command -v node)"
  ```

- The OAuth token is read from `~/.claude/.credentials.json`.

## Authentication

You need to be logged in to Claude Code on the host machine — `clawdmeter-server`
reuses the same OAuth credentials. If `claude` works in your terminal, the
daemon will work too.

## Configuration

- The resolved BLE address is cached at `~/.config/claude-usage-monitor/ble-address`.
- On any connection failure the cache is cleared, and the next iteration
  rescans by advertised name (`Claude Controller`).
- No other configuration is required or supported.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `noble warning: unknown peripheral` | Make sure the ESP32 is powered and advertising. |
| Hangs on scan (macOS) | Grant Bluetooth permission to the parent process. |
| `EPERM` / `Operation not permitted` (Linux) | Run `setcap` (see above) or run as root. |
| `no token found` | Run `claude` once to log in, or check `~/.claude/.credentials.json`. |

## License

MIT
