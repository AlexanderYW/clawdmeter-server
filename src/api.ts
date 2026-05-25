import { log } from "./log.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_HEADERS: Record<string, string> = {
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "oauth-2025-04-20",
  "Content-Type": "application/json",
  "User-Agent": "claude-code/2.1.5",
};
const API_BODY = {
  model: "claude-haiku-4-5-20251001",
  max_tokens: 1,
  messages: [{ role: "user", content: "hi" }],
};

export interface UsagePayload {
  s: number;
  sr: number;
  w: number;
  wr: number;
  st: string;
  ok: boolean;
}

export function pct(util: string | null): number {
  if (!util) return 0;
  const f = Number(util);
  return Number.isFinite(f) ? Math.round(f * 100) : 0;
}

export function resetMinutes(reset: string | null, now: number): number {
  if (!reset) return 0;
  const r = Number(reset);
  if (!Number.isFinite(r)) return 0;
  const mins = (r - now) / 60;
  return mins > 0 ? Math.round(mins) : 0;
}

export async function pollApi(token: string): Promise<UsagePayload | null> {
  const headers = { ...API_HEADERS, Authorization: `Bearer ${token}` };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  let resp: Response;
  try {
    resp = await fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(API_BODY),
      signal: ctl.signal,
    });
  } catch (e) {
    log(`API call failed: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(t);
  }
  if (resp.status >= 400) {
    const txt = await resp.text().catch(() => "");
    log(`API HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    return null;
  }
  const now = Date.now() / 1000;
  const h = (name: string) => resp.headers.get(name);
  return {
    s: pct(h("anthropic-ratelimit-unified-5h-utilization")),
    sr: resetMinutes(h("anthropic-ratelimit-unified-5h-reset"), now),
    w: pct(h("anthropic-ratelimit-unified-7d-utilization")),
    wr: resetMinutes(h("anthropic-ratelimit-unified-7d-reset"), now),
    st: h("anthropic-ratelimit-unified-5h-status") ?? "unknown",
    ok: true,
  };
}
