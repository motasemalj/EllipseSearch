"use client";

import { useEffect, useState } from "react";
import { DirhamSymbol } from "@/components/ui/dirham-symbol";

type PricingCurrency = "USD" | "AED" | "SAR";

interface PriceDisplayProps {
  prices: Record<PricingCurrency, number>;
  serverCurrency: PricingCurrency;
  period?: string;
  isCustom?: boolean;
  className?: string;
}

const TZ_TO_COUNTRY: Record<string, string> = {
  "Asia/Dubai": "AE",
  "Asia/Muscat": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Bahrain": "BH",
  "Asia/Qatar": "QA",
  "Asia/Kuwait": "KW",
  "Africa/Cairo": "EG",
};

function detectCurrency(): PricingCurrency {
  // First try the cookie (set by the inline script or middleware)
  const cookieMatch = document.cookie.match(/user-country=([A-Z]{2})/);
  const country = cookieMatch ? cookieMatch[1] : null;

  if (country === "AE") return "AED";
  if (country === "SA") return "SAR";

  // Fallback: detect from timezone
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzCountry = TZ_TO_COUNTRY[tz];
    if (tzCountry === "AE") return "AED";
    if (tzCountry === "SA") return "SAR";
  } catch {
    // ignore
  }

  return "USD";
}

export function PriceDisplay({ prices, serverCurrency, period = "/month", isCustom, className }: PriceDisplayProps) {
  const [currency, setCurrency] = useState<PricingCurrency>(serverCurrency);

  useEffect(() => {
    const detected = detectCurrency();
    if (detected !== serverCurrency) {
      setCurrency(detected);
    }
  }, [serverCurrency]);

  if (isCustom) {
    return <span className={className || "text-4xl font-bold"}>Custom</span>;
  }

  const amount = prices[currency];

  return (
    <>
      <span className={className || "text-4xl font-bold flex items-center gap-1"}>
        {currency === "AED" ? (
          <DirhamSymbol size="lg" />
        ) : (
          <span>{currency === "SAR" ? "SAR" : "$"}</span>
        )}
        {amount.toLocaleString()}
      </span>
      {period && <span className="text-muted-foreground">{period}</span>}
    </>
  );
}
