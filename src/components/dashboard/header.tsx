"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  User, 
  LogOut, 
  Settings, 
  Search,
  Bell,
  Coins,
  Menu,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Building2,
  FileSearch,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HeaderProps {
  user?: { email?: string };
  credits?: number;
  onMenuClick?: () => void;
}

interface Notification {
  id: string;
  type: "success" | "warning" | "info";
  title: string;
  message: string;
  time: string;
  read: boolean;
}

interface SearchResult {
  type: "brand" | "prompt";
  id: string;
  name: string;
  description?: string;
}

const SEARCH_ENABLED_PAGES = ["/brands", "/prompts", "/dashboard"];
const SEARCH_DEBOUNCE_MS = 400;

const SearchResultItem = memo(function SearchResultItem({
  result,
  onClick,
}: {
  result: SearchResult;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
      onClick={onClick}
    >
      <div className="p-1.5 rounded bg-muted">
        {result.type === "brand" ? (
          <Building2 className="w-3.5 h-3.5 text-primary" />
        ) : (
          <FileSearch className="w-3.5 h-3.5 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.name}</p>
        {result.description && (
          <p className="text-xs text-muted-foreground truncate">
            {result.description}
          </p>
        )}
      </div>
      <Badge variant="outline" className="text-[10px] capitalize">
        {result.type}
      </Badge>
    </button>
  );
});

const NotificationItem = memo(function NotificationItem({
  notification,
  onRead,
  onDismiss,
}: {
  notification: Notification;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "warning":
        return <AlertCircle className="w-4 h-4 text-warning" />;
      case "info":
        return <Info className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div
      className={cn(
        "relative px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-0 cursor-pointer group",
        !notification.read && "bg-primary/5"
      )}
      onClick={onRead}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {getNotificationIcon(notification.type)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{notification.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {notification.time}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      {!notification.read && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
      )}
    </div>
  );
});

export function Header({ user, credits, onMenuClick }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  const supabase = useMemo(() => createClient(), []);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      type: "success",
      title: "Analysis Complete",
      message: "Your keyword set analysis has finished.",
      time: "5 min ago",
      read: false,
    },
    {
      id: "2",
      type: "info",
      title: "Welcome to Ellipse",
      message: "Get started by adding your first brand.",
      time: "1 hour ago",
      read: false,
    },
  ]);
  const [showNotifications, setShowNotifications] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  );
  
  const showSearch = useMemo(
    () => SEARCH_ENABLED_PAGES.some(page => pathname.startsWith(page)),
    [pathname]
  );

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [supabase, router]);

  const performSearch = useCallback(async (query: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    abortControllerRef.current = new AbortController();
    
    setIsSearching(true);
    try {
      const [brandsResult, promptsResult] = await Promise.all([
        supabase
          .from("brands")
          .select("id, name, domain")
          .ilike("name", `%${query}%`)
          .limit(5),
        supabase
          .from("prompts")
          .select("id, text, brands(name)")
          .ilike("text", `%${query}%`)
          .limit(5),
      ]);

      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const results: SearchResult[] = [
        ...(brandsResult.data || []).map(b => ({
          type: "brand" as const,
          id: b.id,
          name: b.name,
          description: b.domain,
        })),
        ...(promptsResult.data || []).map(p => {
          const brands = p.brands as { name: string }[] | { name: string } | null;
          const brandName = Array.isArray(brands) ? brands[0]?.name : brands?.name;
          return {
            type: "prompt" as const,
            id: p.id,
            name: p.text.substring(0, 50) + (p.text.length > 50 ? "..." : ""),
            description: brandName,
          };
        }),
      ];

      setSearchResults(results);
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error("Search error:", error);
      }
    } finally {
      setIsSearching(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    if (result.type === "brand") {
      router.push(`/brands/${result.id}`);
    } else {
      router.push(`/prompts`);
    }
    setSearchQuery("");
    setShowSearchResults(false);
  }, [router]);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return (
    <header className="sticky top-0 z-30 h-14 bg-card/80 backdrop-blur-sm border-b border-border">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Left - Mobile menu + Search */}
        <div className="flex items-center gap-3 flex-1">
          {onMenuClick && (
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
              <Menu className="w-5 h-5" />
            </Button>
          )}
          
          {showSearch && (
            <div className="hidden sm:flex items-center flex-1 max-w-md relative">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                  className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              
              {showSearchResults && searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
                  {isSearching ? (
                    <div className="p-3 text-center text-muted-foreground text-sm">
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto">
                      {searchResults.map((result) => (
                        <SearchResultItem
                          key={`${result.type}-${result.id}`}
                          result={result}
                          onClick={() => handleSearchResultClick(result)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-muted-foreground text-sm">
                      No results found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right - Credits, Notifications, User */}
        <div className="flex items-center gap-1.5">
          {/* Credits */}
          {credits !== undefined && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50">
              <Coins className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold tabular-nums">
                {credits.toLocaleString()}
              </span>
            </div>
          )}

          {/* Notifications */}
          <DropdownMenu open={showNotifications} onOpenChange={setShowNotifications}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                      {unreadCount}
                    </span>
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="font-semibold text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto py-0.5 px-1.5 text-xs text-primary hover:text-primary"
                    onClick={markAllAsRead}
                  >
                    Mark all read
                  </Button>
                )}
              </div>
              
              {notifications.length > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onRead={() => markAsRead(notification.id)}
                      onDismiss={() => dismissNotification(notification.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                  No notifications
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">My Account</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {user?.email || "user@example.com"}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {credits !== undefined && (
                <>
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Credits</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {credits.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
