/* eslint-disable @typescript-eslint/no-explicit-any */
import type OpenAI from "openai";
import { LLM_TIMEOUTS_MS } from "@/lib/ai/openai-timeouts";

export function extractOpenAIResponsesText(resp: any): string {
  if (!resp) return "";

  // If the API returned an error object in-band, surface it.
  const errMsg =
    typeof resp?.error?.message === "string"
      ? resp.error.message
      : typeof resp?.error === "string"
        ? resp.error
        : "";
  if (errMsg) {
    throw new Error(`OpenAI Responses API returned error: ${errMsg}`);
  }

  const outputText = typeof resp?.output_text === "string" ? resp.output_text : "";
  if (outputText.trim().length > 0) return outputText;

  // Fallback: derive text from output items (covers edge cases where output_text isn't populated).
  const out = Array.isArray(resp?.output) ? resp.output : [];
  const parts: string[] = [];

  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") {
        parts.push(c.text);
      }
    }
  }

  const joined = parts.join("").trim();
  if (joined.length > 0) return joined;

  // Last resort: if the response is incomplete, provide a useful error.
  const incompleteReason =
    typeof resp?.incomplete_details?.reason === "string" ? resp.incomplete_details.reason : undefined;
  if (incompleteReason) {
    // Avoid throwing here: callers already implement their own retry/fallback logic on empty content.
    // Throwing causes noisy logs like:
    //   "OpenAI Responses API returned empty output (incomplete: max_output_tokens)"
    // which is typically recoverable by retrying with smaller inputs / higher max_output_tokens.
    return "";
  }

  return "";
}

type RetryOpts = {
  maxAttempts: number;
  minDelayMs: number;
  maxDelayMs: number;
  jitter: number; // 0-1
};

type BreakerState = {
  openedUntilMs: number;
  failures: Array<{ at: number }>;
};

const breakers = new Map<string, BreakerState>();

function now() {
  return Date.now();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(err: unknown): { retryable: boolean; status?: number; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const anyErr = err as any;
  const status = typeof anyErr?.status === "number" ? anyErr.status : typeof anyErr?.statusCode === "number" ? anyErr.statusCode : undefined;
  const errName = err instanceof Error ? err.name : "";

  const msg = message.toLowerCase();
  const retryable =
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("temporarily") ||
    msg.includes("gateway") ||
    msg.includes("aborted") ||
    errName.includes("Abort");

  return { retryable, status, message };
}

function breakerKey(provider: string, model: string) {
  return `${provider}:${model}`;
}

function checkBreaker(key: string): void {
  const state = breakers.get(key);
  if (!state) return;
  if (state.openedUntilMs > now()) {
    throw new Error(`Circuit breaker open for ${key}`);
  }
}

function recordFailure(key: string, windowMs: number, openAfter: number, openForMs: number) {
  const t = now();
  const state = breakers.get(key) || { openedUntilMs: 0, failures: [] };
  state.failures.push({ at: t });
  state.failures = state.failures.filter((f) => t - f.at <= windowMs);
  if (state.failures.length >= openAfter) {
    state.openedUntilMs = t + openForMs;
  }
  breakers.set(key, state);
}

function recordSuccess(key: string) {
  const state = breakers.get(key);
  if (!state) return;
  // On success, clear failures and close breaker.
  state.failures = [];
  state.openedUntilMs = 0;
  breakers.set(key, state);
}

function computeBackoff(attempt: number, retry: RetryOpts) {
  const exp = Math.min(retry.maxDelayMs, retry.minDelayMs * Math.pow(2, attempt - 1));
  const jitterFactor = 1 + (Math.random() * 2 - 1) * retry.jitter; // ± jitter
  const delay = Math.max(0, Math.floor(exp * jitterFactor));
  return delay;
}

export async function callOpenAIResponses<T = any>(input: {
  client: OpenAI;
  provider: "openai";
  model: string;
  request: any;
  timeoutMs?: number;
  retry?: Partial<RetryOpts>;
  breaker?: { windowMs: number; openAfter: number; openForMs: number };
}): Promise<{ response: T; usage?: any }> {
  const timeoutMs = input.timeoutMs ?? LLM_TIMEOUTS_MS.selectionSignals;
  const retry: RetryOpts = {
    maxAttempts: input.retry?.maxAttempts ?? 3,
    minDelayMs: input.retry?.minDelayMs ?? 500,
    maxDelayMs: input.retry?.maxDelayMs ?? 8_000,
    jitter: input.retry?.jitter ?? 0.25,
  };
  const breaker = input.breaker ?? { windowMs: 30_000, openAfter: 6, openForMs: 60_000 };

  const key = breakerKey(input.provider, input.model);
  checkBreaker(key);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    try {
      // OpenAI SDK supports request options as 2nd arg; keep typing loose.
      const resp = await (input.client.responses.create as any)(input.request, {
        timeout: timeoutMs,
        signal: (AbortSignal as any)?.timeout?.(timeoutMs),
      });
      recordSuccess(key);
      const usage = (resp as any)?.usage;
      return { response: resp as T, usage };
    } catch (err) {
      lastErr = err;
      const { retryable } = isRetryableError(err);
      recordFailure(key, breaker.windowMs, breaker.openAfter, breaker.openForMs);
      if (!retryable || attempt === retry.maxAttempts) break;
      await sleep(computeBackoff(attempt, retry));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function callOpenAIChat<T = any>(input: {
  client: OpenAI;
  provider: "openai";
  model: string;
  request: any;
  timeoutMs?: number;
  retry?: Partial<RetryOpts>;
  breaker?: { windowMs: number; openAfter: number; openForMs: number };
}): Promise<{ response: T; usage?: any }> {
  const timeoutMs = input.timeoutMs ?? LLM_TIMEOUTS_MS.sentiment;
  const retry: RetryOpts = {
    maxAttempts: input.retry?.maxAttempts ?? 3,
    minDelayMs: input.retry?.minDelayMs ?? 500,
    maxDelayMs: input.retry?.maxDelayMs ?? 8_000,
    jitter: input.retry?.jitter ?? 0.25,
  };
  const breaker = input.breaker ?? { windowMs: 30_000, openAfter: 6, openForMs: 60_000 };

  const key = breakerKey(input.provider, input.model);
  checkBreaker(key);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    try {
      const resp = await (input.client.chat.completions.create as any)(input.request, {
        timeout: timeoutMs,
        signal: (AbortSignal as any)?.timeout?.(timeoutMs),
      });
      recordSuccess(key);
      const usage = (resp as any)?.usage;
      return { response: resp as T, usage };
    } catch (err) {
      lastErr = err;
      const { retryable } = isRetryableError(err);
      recordFailure(key, breaker.windowMs, breaker.openAfter, breaker.openForMs);
      if (!retryable || attempt === retry.maxAttempts) break;
      await sleep(computeBackoff(attempt, retry));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}


