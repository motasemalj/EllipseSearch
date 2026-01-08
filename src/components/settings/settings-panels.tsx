"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type OrgSettings = Record<string, unknown>;

function mergeSettings(base: OrgSettings, patch: OrgSettings): OrgSettings {
  return { ...(base || {}), ...(patch || {}) };
}

export function PreferencesPanel({
  organizationId,
  initialSettings,
}: {
  organizationId: string;
  initialSettings: OrgSettings;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);

  const currentTheme = (theme || initialSettings?.theme || "system") as "light" | "dark" | "system";

  const save = async (patch: OrgSettings) => {
    setSaving(true);
    try {
      const next = mergeSettings(initialSettings, patch);
      const { error } = await supabase
        .from("organizations")
        .update({ settings: next })
        .eq("id", organizationId);
      if (error) throw error;
      toast.success("Saved");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error("Save failed", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const onThemeChange = async (nextTheme: "light" | "dark" | "system") => {
    setTheme(nextTheme);
    await save({ theme: nextTheme });
  };

  const themeOptions = [
    {
      value: "system",
      label: "System",
      description: "Match your OS setting",
      icon: Monitor,
    },
    {
      value: "light",
      label: "Light",
      description: "Great for screenshots and daylight",
      icon: Sun,
    },
    {
      value: "dark",
      label: "Dark",
      description: "Best for focus and long sessions",
      icon: Moon,
    },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="font-medium">Theme</p>
        <p className="text-sm text-muted-foreground">Choose the look that works best for you.</p>
      </div>

      <RadioGroup
        value={currentTheme}
        onValueChange={(v) => {
          if (v === "light" || v === "dark" || v === "system") return onThemeChange(v);
        }}
        className="grid gap-3"
      >
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = currentTheme === option.value;
          
          return (
            <label
              key={option.value}
              htmlFor={`theme-${option.value}`}
              className={cn(
                "flex items-center gap-4 rounded-xl border-2 p-4 cursor-pointer transition-all",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-muted/50"
              )}
            >
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                isSelected ? "bg-primary/10" : "bg-muted"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-colors",
                  isSelected ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              
              <div className="flex-1 space-y-0.5">
                <p className={cn(
                  "font-medium transition-colors",
                  isSelected && "text-primary"
                )}>
                  {option.label}
                </p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              
              <RadioGroupItem value={option.value} id={`theme-${option.value}`} />
            </label>
          );
        })}
      </RadioGroup>

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Compact spacing</p>
          <p className="text-sm text-muted-foreground">Denser tables and lists (coming next).</p>
        </div>
        <Button variant="outline" size="sm" disabled>
          Enabled
        </Button>
      </div>

      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}

export function SecurityPanel({ email }: { email: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);

  const sendReset = async () => {
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      toast.success("Password reset email sent", { description: "Check your inbox for the recovery link." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error("Could not send reset email", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium">Password</p>
        <p className="text-sm text-muted-foreground">
          Use a secure password and rotate it regularly.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={sendReset} disabled={loading} className="sm:w-fit">
          Send password reset email
        </Button>
        <Button variant="outline" onClick={signOut} disabled={loading} className="sm:w-fit">
          Sign out
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        The reset link will open a secure page where you can set a new password.
      </p>
    </div>
  );
}

export function NotificationsPanel({
  organizationId,
  initialSettings,
}: {
  organizationId: string;
  initialSettings: OrgSettings;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);

  const notifications = (initialSettings?.notifications || {}) as {
    batchCompleted?: boolean;
    batchFailed?: boolean;
    weeklyDigest?: boolean;
  };

  const setPref = async (key: keyof typeof notifications, value: boolean) => {
    setSaving(true);
    try {
      const next = mergeSettings(initialSettings, {
        notifications: { ...(notifications || {}), [key]: value },
      });
      const { error } = await supabase
        .from("organizations")
        .update({ settings: next })
        .eq("id", organizationId);
      if (error) throw error;
      toast.success("Saved");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error("Save failed", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium">Email notifications</p>
        <p className="text-sm text-muted-foreground">
          Preferences are saved now; automated emails will be wired up next.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-4 rounded-xl border-2 border-border p-4 cursor-pointer hover:border-primary/30 hover:bg-muted/50 transition-all">
          <div className="flex-1 space-y-0.5">
            <p className="font-medium">Batch completed</p>
            <p className="text-sm text-muted-foreground">Get notified when a run finishes successfully.</p>
          </div>
          <Checkbox
            checked={Boolean(notifications.batchCompleted)}
            onCheckedChange={(v) => setPref("batchCompleted", Boolean(v))}
          />
        </label>

        <label className="flex items-center gap-4 rounded-xl border-2 border-border p-4 cursor-pointer hover:border-primary/30 hover:bg-muted/50 transition-all">
          <div className="flex-1 space-y-0.5">
            <p className="font-medium">Batch failed</p>
            <p className="text-sm text-muted-foreground">Get notified when a run fails.</p>
          </div>
          <Checkbox
            checked={Boolean(notifications.batchFailed)}
            onCheckedChange={(v) => setPref("batchFailed", Boolean(v))}
          />
        </label>

        <label className="flex items-center gap-4 rounded-xl border-2 border-border p-4 cursor-pointer hover:border-primary/30 hover:bg-muted/50 transition-all">
          <div className="flex-1 space-y-0.5">
            <p className="font-medium">Weekly digest</p>
            <p className="text-sm text-muted-foreground">Summary of changes in visibility and sources.</p>
          </div>
          <Checkbox
            checked={Boolean(notifications.weeklyDigest)}
            onCheckedChange={(v) => setPref("weeklyDigest", Boolean(v))}
          />
        </label>
      </div>

      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}
