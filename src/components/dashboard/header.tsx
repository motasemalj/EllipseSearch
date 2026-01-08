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

// Pages where search should be shown
const SEARCH_ENABLED_PAGES = ["/brands", "/prompts", "/dashboard"];

// Debounce delay for search (ms)
const SEARCH_DEBOUNCE_MS = 400;

// Memoized search result item for better performance
const SearchResultItem = memo(function SearchResultItem({
  result,
  onClick,
}: {
  result: SearchResult;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
      onClick={onClick}
    >
      <div className="p-2 rounded-lg bg-muted">
        {result.type === "brand" ? (
          <Building2 className="w-4 h-4 text-primary" />
        ) : (
          <FileSearch className="w-4 h-4 text-primary" />
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
      <Badge variant="outline" className="text-xs capitalize">
        {result.type}
      </Badge>
    </button>
  );
});

// Memoized notification item
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
        "relative px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-0 cursor-pointer",
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
          className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
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
  
  // Create supabase client once and memoize
  const supabase = useMemo(() => createClient(), []);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Ref for debounce timer
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref for abort controller
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Notifications state
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
  
  // Check if search should be shown on current page
  const showSearch = useMemo(
    () => SEARCH_ENABLED_PAGES.some(page => pathname.startsWith(page)),
    [pathname]
  );

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [supabase, router]);

  // Optimized search with debouncing and cancellation
  const performSearch = useCallback(async (query: string) => {
    // Cancel any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Create new abort controller for this search
    abortControllerRef.current = new AbortController();
    
    setIsSearching(true);
    try {
      // Search brands and prompts in parallel for better performance
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

      // Check if this search was cancelled
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
      // Only log errors that aren't from cancellation
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error("Search error:", error);
      }
    } finally {
      setIsSearching(false);
    }
  }, [supabase]);

  // Debounced search effect with proper cleanup
  useEffect(() => {
    // Clear existing timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // Set new timer
    searchTimerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    // Cleanup on unmount or query change
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  // Cleanup abort controller on unmount
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

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowSearchResults(true);
  }, []);

  const handleSearchFocus = useCallback(() => {
    setShowSearchResults(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    // Delay to allow click events to fire
    setTimeout(() => setShowSearchResults(false), 200);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
  }, []);

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
    <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="h-full px-6 flex items-center justify-between gap-4">
        {/* Left side - Mobile menu + Search */}
        <div className="flex items-center gap-4 flex-1">
          {onMenuClick && (
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
              <Menu className="w-5 h-5" />
            </Button>
          )}
          
          {/* Search - only shown on relevant pages */}
          {showSearch && (
            <div className="hidden sm:flex items-center flex-1 max-w-md relative">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search brands, prompts..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={handleSearchFocus}
                  onBlur={handleSearchBlur}
                  className="pl-9 bg-muted/30 border-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={clearSearch}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              
              {/* Search Results Dropdown */}
              {showSearchResults && searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
                  {isSearching ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Searching...
                      </div>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto">
                      {searchResults.map((result) => (
                        <SearchResultItem
                          key={`${result.type}-${result.id}`}
                          result={result}
                          onClick={() => handleSearchResultClick(result)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No results found for &quot;{searchQuery}&quot;
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side - Credits, Notifications, User */}
        <div className="flex items-center gap-2">
          {/* Credits Display */}
          {credits !== undefined && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Coins className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary tabular-nums">
                {credits.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">credits</span>
            </div>
          )}

          {/* Notifications */}
          <DropdownMenu open={showNotifications} onOpenChange={setShowNotifications}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {unreadCount}
                    </span>
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-semibold">Notifications</span>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto py-1 px-2 text-xs text-primary hover:text-primary"
                    onClick={markAllAsRead}
                  >
                    Mark all read
                  </Button>
                )}
              </div>
              
              {notifications.length > 0 ? (
                <div className="max-h-80 overflow-y-auto">
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
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No notifications yet
                </div>
              )}
              
              <div className="px-4 py-2 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => router.push("/settings")}
                >
                  Notification settings
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
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
                      <span className="font-semibold text-foreground tabular-nums">{credits.toLocaleString()}</span>
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
