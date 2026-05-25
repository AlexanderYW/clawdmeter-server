# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Build: `npm run build` (tsc → `dist/`)
- Run from sources (dev): `bun src/index.ts` or `npm run dev`
- Run built: `npm start` (= `node dist/index.js`)
- Tests: `bun test` (uses Bun's test runner)
- Single test: `bun test src/__tests__/api.test.ts` (or pass `-t '<name pattern>'`)
- Install as a user service: `./service/install.sh` (writes systemd user unit on Linux, LaunchAgent plist on macOS)

Requires Node ≥ 20. Bun is used for dev/test; the shipped artifact is plain Node ESM in `dist/`.

## Architecture

This is a cross-platform host daemon that bridges the Anthropic API to an ESP32 "Claude Controller" over BLE. It replaces two prior per-platform daemons (Linux shell + macOS Python) with one TypeScript codebase using `@abandonware/noble` for BLE on both platforms.

Control flow (`src/index.ts` is the only entry point):

1. **Address resolution** (`config.ts`) — cache at `~/.config/claude-usage-monitor/ble-address` (shared with the legacy daemons). On any connection/session failure the cache is dropped and the next loop iteration rescans.
2. **Scan** (`ble.ts::scanForDevice`) — filtered by the custom service UUID; matches advertisement `localName === "Claude Controller"`.
3. **Connect + discover** (`ble.ts::connect`) — opens RX (write-no-response) and REQ (notify) characteristics. Service/char UUIDs must stay in sync with the firmware; the no-dash lowercase form noble expects is hardcoded in `ble.ts`.
4. **Session loop** (`index.ts::runSession`) — ticks every 5 s. Polls Anthropic every 60 s, or immediately when the device pushes a REQ notify (firmware sends `0x01` to request a refresh). Disconnect ends the session; the outer loop reconnects with exponential backoff (1 s → 60 s).
5. **API poll** (`api.ts::pollApi`) — sends a 1-token `messages` request purely to read rate-limit response headers. The body is irrelevant; we only care about `anthropic-ratelimit-unified-{5h,7d}-{utilization,reset,status}`. Payload sent over BLE is the compact shape `{ s, sr, w, wr, st, ok }` — **do not rename these keys**, the firmware parses them positionally by name.
6. **Token** (`token.ts`) — macOS: Keychain (`security find-generic-password -s "Claude Code-credentials"`), falling back to `~/.claude/.credentials.json`. Linux: file only. `extractAccessToken` tolerates several JSON shapes plus a raw-token fallback.

### Platform gotchas

- **macOS**: BLE permission is granted to the *parent* process (Terminal/iTerm/launchd). First run prompts; on launchd it must be granted to launchd itself in System Settings → Privacy & Security → Bluetooth.
- **Linux**: noble needs raw HCI access — either run as root or `sudo setcap cap_net_raw+eip "$(command -v node)"`.
- noble peripheral identifiers differ by OS: macOS uses a UUID as `id`; Linux uses a MAC. `findPeripheral` normalizes by comparing `id`, `address`, and de-colonized `address`.

### Protocol (mirrors the firmware — change both sides together)

- Service UUID: `4c41555a-4465-7669-6365-000000000001`
- RX (write no-response): `…0002` — JSON `{ s, sr, w, wr, st, ok }`
- REQ (notify): `…0004` — firmware writes `0x01` to ask for an immediate poll

## Service installation

`service/install.sh` detects the OS and either installs `service/claude-usage-daemon.service` as a systemd user unit or `service/com.user.claude-usage-daemon.plist` as a LaunchAgent. Both expect the built `dist/index.js` to exist.
