"use client";

import Image from "next/image";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface BrandFaviconProps {
  domain: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { container: "w-5 h-5", icon: "w-3 h-3", imgSize: 20 },
  md: { container: "w-8 h-8", icon: "w-4 h-4", imgSize: 32 },
  lg: { container: "w-10 h-10", icon: "w-5 h-5", imgSize: 40 },
};

/**
 * Displays a website's favicon using Google's favicon service
 * Falls back to a Globe icon if the favicon fails to load
 */
export function BrandFavicon({ domain, size = "md", className }: BrandFaviconProps) {
  const [hasError, setHasError] = useState(false);
  const { container, icon, imgSize } = sizeMap[size];
  
  // Clean the domain (remove protocol, www, paths)
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
  
  // Google's favicon service - reliable and fast
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=${imgSize * 2}`;

  if (hasError || !cleanDomain) {
    return (
      <div className={cn(
        "rounded-lg bg-muted flex items-center justify-center flex-shrink-0",
        container,
        className
      )}>
        <Globe className={cn("text-muted-foreground", icon)} />
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-lg bg-white dark:bg-muted overflow-hidden flex items-center justify-center flex-shrink-0 ring-1 ring-border/50",
      container,
      className
    )}>
      <Image
        src={faviconUrl}
        alt={`${cleanDomain} logo`}
        width={imgSize}
        height={imgSize}
        className="object-contain"
        onError={() => setHasError(true)}
        unoptimized // Google's service handles optimization
      />
    </div>
  );
}

/**
 * Brand name with favicon inline
 */
export function BrandWithFavicon({ 
  name, 
  domain, 
  size = "md",
  className 
}: { 
  name: string; 
  domain: string; 
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <BrandFavicon domain={domain} size={size} />
      <span className="font-medium truncate">{name}</span>
    </div>
  );
}

