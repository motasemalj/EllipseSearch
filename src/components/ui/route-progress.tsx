"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    // Only trigger on actual navigation
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    // Start progress
    setVisible(true);
    setProgress(0);

    // Quick jump to ~30%
    const t1 = setTimeout(() => setProgress(30), 50);
    // Slow climb to ~70%
    const t2 = setTimeout(() => setProgress(70), 300);
    // Jump to 90%
    const t3 = setTimeout(() => setProgress(90), 600);
    // Complete
    const t4 = setTimeout(() => setProgress(100), 800);
    // Hide
    const t5 = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 1100);

    timeoutRef.current = t5;

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5">
      <div
        className={cn(
          "h-full bg-primary transition-all duration-300 ease-out",
          progress === 100 && "opacity-0 transition-opacity duration-300"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
