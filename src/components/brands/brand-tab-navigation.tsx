"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  Globe,
  Settings,
  GitCompareArrows,
  Activity,
  MessageSquare,
  Link2,
} from "lucide-react";

interface BrandTabNavigationProps {
  brandId: string;
  brandName: string;
}

const tabs = [
  {
    id: "overview",
    label: "Overview",
    icon: BarChart3,
    href: (id: string) => `/brands/${id}`,
    matchExact: true,
  },
  {
    id: "prompts",
    label: "Prompts",
    icon: MessageSquare,
    href: (id: string) => `/brands/${id}/prompts`,
  },
  {
    id: "activity",
    label: "Activity",
    icon: Activity,
    href: (id: string) => `/brands/${id}/activity`,
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: TrendingUp,
    href: (id: string) => `/brands/${id}/analytics`,
  },
  {
    id: "regions",
    label: "Regions",
    icon: Globe,
    href: (id: string) => `/brands/${id}/regions`,
  },
  {
    id: "compare",
    label: "Compare",
    icon: GitCompareArrows,
    href: (id: string) => `/brands/${id}/compare`,
  },
  {
    id: "citations",
    label: "Citations",
    icon: Link2,
    href: (id: string) => `/brands/${id}/citations`,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    href: (id: string) => `/brands/${id}/edit`,
  },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BrandTabNavigation({ brandId, brandName }: BrandTabNavigationProps) {
  const pathname = usePathname();

  const isActive = (tab: typeof tabs[0]) => {
    const tabHref = tab.href(brandId);
    if (tab.matchExact) {
      return pathname === tabHref;
    }
    return pathname.startsWith(tabHref);
  };

  return (
    <div className="border-b border-border bg-card/50 px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <nav className="flex items-center gap-1 -mx-2 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab);
            
            return (
              <Link
                key={tab.id}
                href={tab.href(brandId)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-t-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
