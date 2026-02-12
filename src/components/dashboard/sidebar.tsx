"use client";

import { memo, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  ChevronRight,
  HelpCircle,
  KeyRound,
  BookOpen,
  TrendingUp,
  Search,
  LucideIcon,
  Clock,
  Zap,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

interface ResourceItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Overview & insights",
  },
  {
    name: "Brands",
    href: "/brands",
    icon: Building2,
    description: "Manage brands",
  },
  {
    name: "Prompts",
    href: "/prompts",
    icon: Search,
    description: "All prompts",
  },
  {
    name: "Performance",
    href: "/track-performance",
    icon: TrendingUp,
    description: "Analytics",
  },
];

const accountNav: NavItem[] = [
  {
    name: "Billing",
    href: "/billing",
    icon: CreditCard,
    description: "Plans & credits",
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Preferences",
  },
];

const resources: ResourceItem[] = [
  {
    name: "Documentation",
    href: "/docs",
    icon: BookOpen,
  },
  {
    name: "API Access",
    href: "/api-access",
    icon: KeyRound,
  },
  {
    name: "Support",
    href: "/support",
    icon: HelpCircle,
  },
];

const NavItemComponent = memo(function NavItemComponent({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  const Icon = item.icon;
  
  return (
    <Link
      href={item.href}
      prefetch={true}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <Icon className={cn(
        "w-4 h-4 flex-shrink-0",
        isActive ? "text-primary" : "text-muted-foreground"
      )} />
      <span className="flex-1">{item.name}</span>
      {isActive && (
        <ChevronRight className="w-4 h-4 text-primary/70" />
      )}
    </Link>
  );
});

const ResourceItemComponent = memo(function ResourceItemComponent({
  item,
  isActive,
}: {
  item: ResourceItem;
  isActive: boolean;
}) {
  const Icon = item.icon;
  
  return (
    <Link
      href={item.href}
      prefetch={true}
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
        isActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{item.name}</span>
    </Link>
  );
});

function useSubscriptionStatus() {
  const [status, setStatus] = useState<{
    tier: string;
    isTrialActive: boolean;
    trialDaysRemaining: number;
    isPaidSubscription: boolean;
    creditsBalance: number;
  } | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/subscription/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (error) {
        console.error("Failed to fetch subscription status:", error);
      }
    }
    fetchStatus();
  }, []);

  return status;
}

const UpgradeCTA = memo(function UpgradeCTA() {
  const status = useSubscriptionStatus();

  if (!status || status.isPaidSubscription || ['starter', 'pro', 'agency'].includes(status.tier)) {
    return null;
  }

  if (status.isTrialActive) {
    return (
      <div className="p-4 border-t border-border">
        <div className="rounded-lg bg-muted/50 p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-warning" />
            <span className="text-sm font-medium">Trial Active</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {status.trialDaysRemaining} day{status.trialDaysRemaining !== 1 ? 's' : ''} left
          </p>
          <Link href="/billing" prefetch={true}>
            <button className="w-full py-2 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Upgrade Now
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-border">
      <div className="rounded-lg bg-muted/50 p-4 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Upgrade</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Get more credits and features.
        </p>
        <Link href="/billing" prefetch={true}>
          <button className="w-full py-2 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            View Plans
          </button>
        </Link>
      </div>
    </div>
  );
});

export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname();

  const activeStates = useMemo(() => {
    const states: Record<string, boolean> = {};
    
    [...navigation, ...accountNav].forEach(item => {
      if (item.href === "/dashboard") {
        states[item.href] = pathname === "/dashboard";
      } else {
        states[item.href] = pathname.startsWith(item.href);
      }
    });
    
    resources.forEach(item => {
      states[item.href] = pathname.startsWith(item.href);
    });
    
    return states;
  }, [pathname]);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-card border-r border-border flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 px-5 flex items-center border-b border-border">
        <Link href="/dashboard" prefetch={true} className="flex items-center gap-2.5">
          <Logo size="sm" showText={false} />
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight">Ellipse</span>
            <span className="text-[9px] text-muted-foreground -mt-0.5 tracking-widest uppercase">
              AEO Platform
            </span>
          </div>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {navigation.map((item) => (
            <NavItemComponent
              key={item.href}
              item={item}
              isActive={activeStates[item.href]}
            />
          ))}
        </div>

        {/* Account Section */}
        <div className="mt-6 pt-4 border-t border-border">
          <p className="px-3 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Account
          </p>
          <div className="space-y-1">
            {accountNav.map((item) => (
              <NavItemComponent
                key={item.href}
                item={item}
                isActive={activeStates[item.href]}
              />
            ))}
          </div>
        </div>

        {/* Resources */}
        <div className="mt-6 pt-4 border-t border-border">
          <p className="px-3 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Resources
          </p>
          <div className="space-y-0.5">
            {resources.map((item) => (
              <ResourceItemComponent
                key={item.href}
                item={item}
                isActive={activeStates[item.href]}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Upgrade CTA */}
      <UpgradeCTA />
    </aside>
  );
});
