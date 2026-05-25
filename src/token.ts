import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { log } from "./log.js";

const KEYCHAIN_SERVICE = "Claude Code-credentials";
const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");

export function extractAccessToken(blob: string): string | null {
  const trimmed = blob.trim();
  if (!trimmed) return null;
  let data: unknown = null;
  try {
    data = JSON.parse(trimmed);
  } catch {}
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.accessToken === "string") return obj.accessToken;
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).accessToken === "string") {
        return (v as Record<string, string>).accessToken;
      }
    }
  }
  const m = trimmed.match(/"accessToken"\s*:\s*"([^"]+)"/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_\-.~+/=]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

function readTokenKeychain(): string | null {
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", userInfo().username, "-w"],
      { encoding: "utf8", timeout: 10_000 },
    );
    return extractAccessToken(out);
  } catch (e) {
    log(`Keychain read failed: ${(e as Error).message}`);
    return null;
  }
}

function readTokenFile(): string | null {
  try {
    return extractAccessToken(readFileSync(CREDENTIALS_PATH, "utf8"));
  } catch (e) {
    log(`Error reading credentials: ${(e as Error).message}`);
    return null;
  }
}

export function readToken(): string | null {
  if (process.platform === "darwin") {
    return readTokenKeychain() ?? readTokenFile();
  }
  return readTokenFile();
}
