"use client";

import { cn } from "@/lib/utils";

interface DirhamSymbolProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

/**
 * UAE Dirham (AED) currency symbol
 * A stylized 'D' with two horizontal lines through it
 * Lines extend beyond the D with sharp angled edges
 */
export function DirhamSymbol({ className, size = "md" }: DirhamSymbolProps) {
  const sizes = {
    sm: "w-3.5 h-3.5",
    md: "w-5 h-5", 
    lg: "w-7 h-7",
    xl: "w-9 h-9",
  };

  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="currentColor" 
      className={cn(sizes[size], "inline-block", className)}
      aria-label="AED"
    >
      {/* Main D shape */}
      <path d="
        M18 4 
        L18 96 
        L42 96
        C72 96 88 76 88 50
        C88 24 72 4 42 4
        L18 4
        Z
        M30 16
        L42 16
        C62 16 76 30 76 50
        C76 70 62 84 42 84
        L30 84
        L30 16
        Z
      " fillRule="evenodd" />
      
      {/* Upper dash - horizontal with sharp angled ends, extending beyond D */}
      <polygon points="2,32 8,38 98,38 92,32" />
      
      {/* Lower dash - horizontal with sharp angled ends, extending beyond D */}
      <polygon points="2,62 8,68 98,68 92,62" />
    </svg>
  );
}

/**
 * Formats a price with the Dirham symbol
 */
export function formatAED(amount: number | string) {
  const formatted = typeof amount === 'number' 
    ? amount.toLocaleString() 
    : amount;
  return formatted;
}

