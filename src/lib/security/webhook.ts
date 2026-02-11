import crypto from "node:crypto";

export type WebhookAuthResult =
  | { ok: true; mode: "bearer" | "hmac"; timestamp: number }
  | { ok: false; status: number; error: string };

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export function verifyWebhookAuth(input: {
  rawBody: string;
  authorizationHeader: string | null;
  timestampHeader: string | null;
  signatureHeader: string | null;
  bearerSecret?: string;
  hmacSecret?: string;
  maxSkewSeconds?: number;
}): WebhookAuthResult {
  const maxSkew = input.maxSkewSeconds ?? 300; // 5 minutes

  // Mode 1: Bearer secret (legacy / simplest)
  if (input.bearerSecret) {
    const bearer = (input.authorizationHeader || "").trim();
    const provided = bearer.toLowerCase().startsWith("bearer ")
      ? bearer.slice("bearer ".length).trim()
      : "";
    if (provided && provided === input.bearerSecret) {
      return { ok: true, mode: "bearer", timestamp: Date.now() };
    }
  }

  // Mode 2: HMAC signature + timestamp (replay protection)
  const secret = input.hmacSecret || input.bearerSecret;
  if (!secret) {
    return { ok: false, status: 401, error: "Webhook secret not configured" };
  }

  const tsStr = (input.timestampHeader || "").trim();
  const sig = (input.signatureHeader || "").trim();

  if (!tsStr || !sig) {
    return { ok: false, status: 401, error: "Missing webhook signature headers" };
  }

  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, status: 400, error: "Invalid webhook timestamp" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > maxSkew) {
    return { ok: false, status: 401, error: "Webhook timestamp outside allowed window" };
  }

  const payloadToSign = `${ts}.${input.rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");

  if (!timingSafeEqualHex(expected, sig)) {
    return { ok: false, status: 401, error: "Invalid webhook signature" };
  }

  return { ok: true, mode: "hmac", timestamp: ts * 1000 };
}


