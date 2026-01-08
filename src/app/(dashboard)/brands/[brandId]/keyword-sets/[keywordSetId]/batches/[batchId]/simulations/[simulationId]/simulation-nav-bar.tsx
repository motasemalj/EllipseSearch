"use client";

import { 
  Eye, 
  ShieldAlert, 
  MessageSquare, 
  Trophy, 
  Zap, 
  ListChecks, 
  BarChart3, 
  Globe,
  Crown,
} from "lucide-react";

interface SimulationNavBarProps {
  hasWatchdog: boolean;
  hasAIResponse: boolean;
  hasCompetitorInsights: boolean;
  hasQuickWins: boolean;
  hasActionItems: boolean;
  hasSignals: boolean;
  hasSources: boolean;
}

const navItems = [
  { id: "stats", label: "Overview", icon: Eye, always: true },
  { id: "watchdog", label: "Hallucinations", icon: ShieldAlert, isPro: true },
  { id: "response", label: "AI Response", icon: MessageSquare },
  { id: "competitors", label: "Competitors", icon: Trophy },
  { id: "quickwins", label: "Quick Wins", icon: Zap },
  { id: "actions", label: "Actions", icon: ListChecks },
  { id: "signals", label: "Signals", icon: BarChart3 },
  { id: "sources", label: "Sources", icon: Globe },
];

export function SimulationNavBar({
  hasWatchdog,
  hasAIResponse,
  hasCompetitorInsights,
  hasQuickWins,
  hasActionItems,
  hasSignals,
  hasSources,
}: SimulationNavBarProps) {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80; // Account for sticky header
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  const visibleItems = navItems.filter(item => {
    if (item.always) return true;
    if (item.id === "watchdog") return hasWatchdog;
    if (item.id === "response") return hasAIResponse;
    if (item.id === "competitors") return hasCompetitorInsights;
    if (item.id === "quickwins") return hasQuickWins;
    if (item.id === "actions") return hasActionItems;
    if (item.id === "signals") return hasSignals;
    if (item.id === "sources") return hasSources;
    return true;
  });

  return (
    <nav className="sticky top-0 z-40 -mx-4 px-4 py-3 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <span className="text-xs font-medium text-muted-foreground mr-2 flex-shrink-0">
          Jump to:
        </span>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:scale-105 flex-shrink-0 ${
                item.isPro
                  ? "bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:from-amber-500/20 hover:to-orange-500/20"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              {item.isPro && (
                <Crown className="w-3 h-3 text-amber-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}


