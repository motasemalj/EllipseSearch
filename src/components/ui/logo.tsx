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

  // Single blade path, rotated 4 times for perfect symmetry.
  // Creates the swirling vortex / pinwheel shape.
  const blade = "M 21 17 C 22 10 28 5 34 10 C 38 14 34 20 25 21 C 23 21 21 20 21 17 Z";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("relative", sizes[size])}>
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <g fill="currentColor">
            <path d={blade} />
            <path d={blade} transform="rotate(90 20 20)" />
            <path d={blade} transform="rotate(180 20 20)" />
            <path d={blade} transform="rotate(270 20 20)" />
          </g>
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
