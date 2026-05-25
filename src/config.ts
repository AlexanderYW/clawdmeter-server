import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { log } from "./log.js";

export const SAVED_ADDR_FILE = join(homedir(), ".config", "claude-usage-monitor", "ble-address");

const MAC_RE = /^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
const UUID_RE = /^[0-9A-Fa-f]{8}-(?:[0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$/;

export function loadCachedAddress(): string | null {
  if (!existsSync(SAVED_ADDR_FILE)) return null;
  const addr = readFileSync(SAVED_ADDR_FILE, "utf8").trim();
  if (MAC_RE.test(addr) || UUID_RE.test(addr)) return addr;
  log("Cached address malformed, discarding");
  try {
    unlinkSync(SAVED_ADDR_FILE);
  } catch {}
  return null;
}

export function saveAddress(addr: string): void {
  mkdirSync(dirname(SAVED_ADDR_FILE), { recursive: true });
  writeFileSync(SAVED_ADDR_FILE, addr);
}

export function clearCachedAddress(): void {
  try {
    unlinkSync(SAVED_ADDR_FILE);
  } catch {}
}
