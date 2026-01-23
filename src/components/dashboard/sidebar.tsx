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
  Sparkles,
  HelpCircle,
  KeyRound,
  BookOpen,
  TrendingUp,
  Search,
  LucideIcon,
  Clock,
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
    description: "Manage your brands",
  },
  {
    name: "Prompts",
    href: "/prompts",
    icon: Search,
    description: "All prompts",
  },
  {
    name: "Track Performance",
    href: "/track-performance",
    icon: TrendingUp,
    description: "Visibility & rank",
  },
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
    name: "Help & Support",
    href: "/support",
    icon: HelpCircle,
  },
];

// Memoized navigation item for better performance
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
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
        "group hover:bg-primary/10",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className={cn(
        "w-5 h-5 flex-shrink-0 transition-colors",
        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
      )} />
      <div className="flex-1 min-w-0">
        <div className="truncate">{item.name}</div>
      </div>
      {isActive && (
        <ChevronRight className="w-4 h-4 text-primary opacity-70" />
      )}
    </Link>
  );
});

// Memoized resource item
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
        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all",
        isActive
          ? "text-primary bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{item.name}</span>
    </Link>
  );
});

// Subscription status hook
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

// Memoized upgrade CTA - only shows for free/trial users
const UpgradeCTA = memo(function UpgradeCTA() {
  const status = useSubscriptionStatus();

  // Don't show for paid subscribers
  if (!status || status.isPaidSubscription || ['starter', 'pro', 'agency'].includes(status.tier)) {
    return null;
  }

  // Show trial status for trial users
  if (status.isTrialActive) {
    return (
      <div className="p-4 border-t border-border">
        <div className="rounded-xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent p-4 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Trial Active</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {status.trialDaysRemaining} day{status.trialDaysRemaining !== 1 ? 's' : ''} left • {status.creditsBalance} credits
          </p>
          <Link href="/billing" prefetch={true}>
            <button className="w-full py-2 px-3 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
              Upgrade Now
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // Show upgrade CTA for free users
  return (
    <div className="p-4 border-t border-border">
      <div className="rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-4 border border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Upgrade to Pro</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Get more credits and unlock all AI engines.
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

  // Memoize the isActive function result for each nav item
  const activeStates = useMemo(() => {
    const states: Record<string, boolean> = {};
    
    navigation.forEach(item => {
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
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" prefetch={true} className="flex items-center gap-3">
          <Logo size="md" showText={false} />
          <div className="flex flex-col">
            <span className="font-bold text-lg tracking-tight">Ellipse</span>
            <span className="text-[10px] text-muted-foreground -mt-1 tracking-widest uppercase">
              AEO Platform
            </span>
          </div>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {navigation.map((item) => (
            <NavItemComponent
              key={item.href}
              item={item}
              isActive={activeStates[item.href]}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-border" />

        {/* Resources */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Resources
          </p>
          {resources.map((item) => (
            <ResourceItemComponent
              key={item.href}
              item={item}
              isActive={activeStates[item.href]}
            />
          ))}
        </div>
      </nav>

      {/* Pro Upgrade CTA */}
      <UpgradeCTA />
    </aside>
  );
});
