#!/usr/bin/env node
import { pollApi } from "./api.js";
import { connect, scanForDevice, writePayload, type BleSession } from "./ble.js";
import { clearCachedAddress, loadCachedAddress, saveAddress } from "./config.js";
import { log } from "./log.js";
import { readToken } from "./token.js";

const POLL_INTERVAL_MS = 60_000;
const TICK_MS = 5_000;

let stopping = false;
const stopWaiters: Array<() => void> = [];

function stop(): void {
  if (stopping) return;
  stopping = true;
  log("Daemon stopping");
  for (const w of stopWaiters.splice(0)) w();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      remove();
      resolve();
    }, ms);
    const onStop = () => {
      clearTimeout(t);
      resolve();
    };
    const remove = () => {
      const i = stopWaiters.indexOf(onStop);
      if (i >= 0) stopWaiters.splice(i, 1);
    };
    stopWaiters.push(onStop);
  });
}

async function runSession(session: BleSession): Promise<boolean> {
  let lastPoll = 0;
  let refreshRequested = false;
  let disconnected = false;
  let usedSuccessfully = false;

  session.onDisconnect(() => {
    disconnected = true;
    log("Device disconnected");
  });
  session.onRefresh(() => {
    refreshRequested = true;
  });

  while (!disconnected && !stopping) {
    const now = Date.now();
    if (refreshRequested || now - lastPoll >= POLL_INTERVAL_MS) {
      refreshRequested = false;
      const token = readToken();
      if (!token) {
        log("No token; skipping poll");
      } else {
        const payload = await pollApi(token);
        if (payload) {
          if (await writePayload(session, payload)) {
            lastPoll = Date.now();
            usedSuccessfully = true;
          }
        }
      }
    }
    await sleep(TICK_MS);
  }

  if (!disconnected) {
    try {
      await session.disconnect();
    } catch {}
  }
  return usedSuccessfully;
}

async function main(): Promise<void> {
  log("=== Claude Usage Tracker Daemon (BLE, Node/Bun) ===");
  log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

  let backoff = 1_000;
  while (!stopping) {
    let address = loadCachedAddress();
    if (!address) {
      address = await scanForDevice();
      if (address) {
        saveAddress(address);
      } else {
        log(`Device not found, retrying in ${backoff / 1000}s...`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 60_000);
        continue;
      }
    }

    const session = await connect(address);
    if (!session) {
      log("Invalidating cached address");
      clearCachedAddress();
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000);
      continue;
    }

    const ok = await runSession(session);
    if (ok) {
      backoff = 1_000;
    } else {
      log("Invalidating cached address");
      clearCachedAddress();
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

main().catch((e) => {
  log(`Fatal: ${(e as Error).message}`);
  process.exit(1);
});
