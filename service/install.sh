#!/usr/bin/env bash
# Install the Node host daemon as a user service on Linux (systemd) or macOS (launchd).
set -euo pipefail

HOST_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DAEMON_PATH="$HOST_DIR/dist/index.js"
NODE_BIN="$(command -v node || true)"

if [[ -z "$NODE_BIN" ]]; then
    echo "node not found on PATH" >&2
    exit 1
fi

if [[ ! -f "$DAEMON_PATH" ]]; then
    echo "Building host package..."
    (cd "$HOST_DIR" && npm install && npm run build)
fi

case "$(uname -s)" in
Linux)
    UNIT_DIR="$HOME/.config/systemd/user"
    mkdir -p "$UNIT_DIR"
    sed \
        -e "s|__NODE_BIN__|$NODE_BIN|g" \
        -e "s|__DAEMON_PATH__|$DAEMON_PATH|g" \
        "$HOST_DIR/service/claude-usage-daemon.service" >"$UNIT_DIR/claude-usage-daemon.service"
    systemctl --user daemon-reload
    systemctl --user enable --now claude-usage-daemon.service
    echo "Installed and started: $UNIT_DIR/claude-usage-daemon.service"
    echo "Note: Linux noble may need: sudo setcap cap_net_raw+eip \"$NODE_BIN\""
    ;;
Darwin)
    LAUNCH_DIR="$HOME/Library/LaunchAgents"
    LOG_DIR="$HOME/Library/Logs"
    mkdir -p "$LAUNCH_DIR" "$LOG_DIR"
    PLIST="$LAUNCH_DIR/com.user.claude-usage-daemon.plist"
    sed \
        -e "s|__NODE_BIN__|$NODE_BIN|g" \
        -e "s|__DAEMON_PATH__|$DAEMON_PATH|g" \
        -e "s|__HOST_DIR__|$HOST_DIR|g" \
        -e "s|__HOME__|$HOME|g" \
        -e "s|__LOG_OUT__|$LOG_DIR/claude-usage-daemon.out.log|g" \
        -e "s|__LOG_ERR__|$LOG_DIR/claude-usage-daemon.err.log|g" \
        "$HOST_DIR/service/com.user.claude-usage-daemon.plist" >"$PLIST"
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "Installed and loaded: $PLIST"
    echo "Note: macOS will prompt for Bluetooth permission on first run."
    ;;
*)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac
