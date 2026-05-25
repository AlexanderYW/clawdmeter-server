import { describe, expect, test } from "bun:test";
import { extractAccessToken } from "../token.js";

describe("extractAccessToken", () => {
  test("returns null for empty/whitespace input", () => {
    expect(extractAccessToken("")).toBeNull();
    expect(extractAccessToken("   \n\t")).toBeNull();
  });

  test("extracts accessToken from a top-level JSON object", () => {
    const json = JSON.stringify({ accessToken: "abc.def-123", other: 1 });
    expect(extractAccessToken(json)).toBe("abc.def-123");
  });

  test("extracts accessToken from a nested JSON object", () => {
    const json = JSON.stringify({
      claudeAiOauth: { accessToken: "nested-token-xyz", refreshToken: "r" },
    });
    expect(extractAccessToken(json)).toBe("nested-token-xyz");
  });

  test("falls back to regex match on malformed JSON containing accessToken", () => {
    const broken = `{ accessToken: "no-quotes", "accessToken": "regex-tok-1234567890" ,,, `;
    expect(extractAccessToken(broken)).toBe("regex-tok-1234567890");
  });

  test("treats a bare token-like string as the token", () => {
    const bare = "A".repeat(40);
    expect(extractAccessToken(bare)).toBe(bare);
  });

  test("returns null when JSON has no accessToken anywhere", () => {
    expect(extractAccessToken(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  test("returns null for short non-JSON strings", () => {
    expect(extractAccessToken("nope")).toBeNull();
  });

  test("returns null for strings with invalid token characters", () => {
    expect(extractAccessToken("has spaces and !!! illegal chars here too")).toBeNull();
  });
});
