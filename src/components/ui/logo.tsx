"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ className, size = "md", showText = true }: LogoProps) {
  const sizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const textSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Ellipse Icon - Stylized search/visibility concept */}
      <div className={cn("relative", sizes[size])}>
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Outer ellipse ring */}
          <ellipse
            cx="20"
            cy="20"
            rx="16"
            ry="12"
            stroke="url(#logoGradient)"
            strokeWidth="3"
            fill="none"
            className="opacity-90"
          />
          {/* Inner focused point */}
          <circle
            cx="20"
            cy="20"
            r="5"
            fill="url(#logoGradient)"
          />
          {/* Visibility rays */}
          <path
            d="M8 20 L4 20 M32 20 L36 20 M20 10 L20 6 M20 30 L20 34"
            stroke="url(#logoGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            className="opacity-60"
          />
          <defs>
            <linearGradient
              id="logoGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="hsl(210 100% 50%)" />
              <stop offset="100%" stopColor="hsl(188 78% 45%)" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      {showText && (
        <span
          className={cn(
            "font-bold tracking-tight",
            textSizes[size]
          )}
        >
          <span className="text-foreground">Ellipse</span>
        </span>
      )}
    </div>
  );
}
