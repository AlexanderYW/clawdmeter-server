# Development

Notes for hacking on `clawdmeter-server` itself. End-user install/run docs live
in [README.md](README.md).

## Stack

- TypeScript, ESM, targets Node ≥ 20.
- [`@abandonware/noble`](https://www.npmjs.com/package/@abandonware/noble) for BLE.
- Bun is used for dev + tests; the shipped artifact is plain Node ESM in `dist/`.

## Setup

```bash
git clone <repo>
cd clawdmeter-server
bun install   # or: npm install
```

## Commands

| | |
|---|---|
| `npm run build` | `tsc` → `dist/` |
| `npm run dev` | Run from sources with Bun (`bun src/index.ts`) |
| `npm start` | Run built artifact (`node dist/index.js`) |
| `bun test` | Run the test suite |
| `bun test src/__tests__/api.test.ts` | Run a single test file |
| `bun test -t '<pattern>'` | Filter by test name |

## Layout

```
src/
  index.ts    # entry point + outer reconnect loop
  ble.ts      # noble scan/connect/discover, RX + REQ characteristics
  api.ts      # Anthropic rate-limit poll
  config.ts   # BLE address cache
  token.ts    # OAuth token resolution (Keychain / credentials.json)
service/
  install.sh                              # OS-dispatching installer
  claude-usage-daemon.service             # systemd user unit (Linux)
  com.user.claude-usage-daemon.plist      # LaunchAgent (macOS)
```

## Control flow

`src/index.ts` is the only entry point.

1. **Address resolution** (`config.ts`) — cache at
   `~/.config/claude-usage-monitor/ble-address`, shared with the legacy
   per-platform daemons. On any connection/session failure the cache is dropped
   and the next loop iteration rescans.
2. **Scan** (`ble.ts::scanForDevice`) — filtered by the custom service UUID;
   matches advertisement `localName === "Claude Controller"`.
3. **Connect + discover** (`ble.ts::connect`) — opens RX (write-no-response)
   and REQ (notify) characteristics. The no-dash lowercase UUID form noble
   expects is hardcoded.
4. **Session loop** (`index.ts::runSession`) — ticks every 5 s. Polls
   Anthropic every 60 s, or immediately when the device pushes a REQ notify
   (firmware sends `0x01`). Disconnect ends the session; the outer loop
   reconnects with exponential backoff (1 s → 60 s).
5. **API poll** (`api.ts::pollApi`) — sends a 1-token `messages` request
   purely to read rate-limit response headers. The body is discarded; we only
   read `anthropic-ratelimit-unified-{5h,7d}-{utilization,reset,status}`.
6. **Token** (`token.ts`) — macOS reads the Keychain
   (`security find-generic-password -s "Claude Code-credentials"`) and falls
   back to `~/.claude/.credentials.json`. Linux is file-only.
   `extractAccessToken` tolerates several JSON shapes plus a raw-token fallback.

## Protocol

The firmware and the server must agree on these — change both sides together.

- **Service UUID**: `4c41555a-4465-7669-6365-000000000001`
- **RX** (write, no response): `…0002` — JSON `{ s, sr, w, wr, st, ok }`
- **REQ** (notify): `…0004` — firmware writes `0x01` to request an immediate poll

> The payload keys are short and parsed positionally-by-name on the firmware.
> Do **not** rename `s`, `sr`, `w`, `wr`, `st`, `ok`.

## Platform gotchas

- **macOS Bluetooth permission** is granted to the *parent* process
  (Terminal / iTerm / launchd). First run prompts; when running under launchd
  it must be granted to `launchd` itself in System Settings → Privacy &
  Security → Bluetooth.
- **Linux raw HCI access**: either run as root or
  `sudo setcap cap_net_raw+eip "$(command -v node)"`.
- **noble peripheral identifiers differ by OS**: macOS uses a UUID as `id`,
  Linux uses a MAC. `findPeripheral` normalizes by comparing `id`, `address`,
  and de-colonized `address`.

## Releasing

1. Bump `version` in `package.json`.
2. `npm run build` — confirm `dist/` is clean.
3. `npm publish`.

The `bin` entry in `package.json` exposes `clawdmeter-server` →
`dist/index.js`, so `npm install -g` is enough for end users.
