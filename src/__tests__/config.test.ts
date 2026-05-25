import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_HOME = mkdtempSync(join(tmpdir(), "clawdmeter-config-"));

// homedir() on macOS reads from getpwuid and ignores $HOME, so we mock the module
// before importing config.ts (which captures the path at module-eval time).
mock.module("node:os", () => ({
  ...os,
  homedir: () => TMP_HOME,
}));

const { loadCachedAddress, saveAddress, clearCachedAddress, SAVED_ADDR_FILE } = await import(
  "../config.js"
);

beforeAll(() => {
  if (!SAVED_ADDR_FILE.startsWith(TMP_HOME)) {
    throw new Error(`config module resolved outside temp HOME: ${SAVED_ADDR_FILE}`);
  }
});

afterAll(() => {
  rmSync(TMP_HOME, { recursive: true, force: true });
});

describe("address cache", () => {
  test("returns null when no cache file exists", () => {
    clearCachedAddress();
    expect(loadCachedAddress()).toBeNull();
  });

  test("saves and round-trips a MAC address", () => {
    saveAddress("AA:BB:CC:DD:EE:FF");
    expect(existsSync(SAVED_ADDR_FILE)).toBe(true);
    expect(readFileSync(SAVED_ADDR_FILE, "utf8")).toBe("AA:BB:CC:DD:EE:FF");
    expect(loadCachedAddress()).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("saves and round-trips a UUID address", () => {
    const uuid = "12345678-90ab-cdef-1234-567890abcdef";
    saveAddress(uuid);
    expect(loadCachedAddress()).toBe(uuid);
  });

  test("discards a malformed cached address", () => {
    saveAddress("not-a-valid-address");
    expect(existsSync(SAVED_ADDR_FILE)).toBe(true);
    expect(loadCachedAddress()).toBeNull();
    expect(existsSync(SAVED_ADDR_FILE)).toBe(false);
  });

  test("clearCachedAddress removes the file and is idempotent", () => {
    saveAddress("AA:BB:CC:DD:EE:FF");
    clearCachedAddress();
    expect(existsSync(SAVED_ADDR_FILE)).toBe(false);
    expect(() => clearCachedAddress()).not.toThrow();
  });
});
