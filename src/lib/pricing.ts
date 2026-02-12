export type PricingCurrency = "USD" | "AED" | "SAR";

export interface PricingTier {
  id: "starter" | "pro" | "agency";
  price: number | null;
  currency: PricingCurrency;
  isCustom: boolean;
}

const PRICING_BY_CURRENCY: Record<
  PricingCurrency,
  { starter: number; pro: number }
> = {
  USD: { starter: 70, pro: 300 },
  AED: { starter: 250, pro: 1100 },
  SAR: { starter: 260, pro: 1200 },
};

export function getCurrencyFromHeaders(headers: Headers): PricingCurrency {
  // First check: infrastructure geo headers (set by Vercel, Cloudflare, etc.)
  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country-code") ||
    headers.get("x-geo-country") ||
    getCountryFromCookie(headers);

  switch ((country || "").toUpperCase()) {
    case "AE":
      return "AED";
    case "SA":
      return "SAR";
    default:
      return "USD";
  }
}

function getCountryFromCookie(headers: Headers): string | null {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/user-country=([A-Z]{2})/i);
  return match ? match[1] : null;
}

export function getPricingTiers(currency: PricingCurrency): PricingTier[] {
  const prices = PRICING_BY_CURRENCY[currency];

  return [
    { id: "starter", price: prices.starter, currency, isCustom: false },
    { id: "pro", price: prices.pro, currency, isCustom: false },
    { id: "agency", price: null, currency, isCustom: true },
  ];
}

export function formatCurrencyAmount(amount: number): string {
  return amount.toLocaleString();
}

