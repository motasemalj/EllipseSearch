import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { 
  User, 
  Building2, 
  Shield,
  Bell,
  Palette,
} from "lucide-react";
import { PreferencesPanel, SecurityPanel, NotificationsPanel } from "@/components/settings/settings-panels";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, organizations(*)")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  const organization = profile.organizations as { name: string; tier: string } | null;
  const organizationSettings =
    ((profile.organizations as { settings?: unknown } | null)?.settings as Record<string, unknown> | undefined) || {};

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Account Section */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Account</h2>
              <p className="text-sm text-muted-foreground">Your personal information</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">Role</p>
              <p className="text-sm text-muted-foreground capitalize">{profile.role || "member"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Organization Section */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Organization</h2>
              <p className="text-sm text-muted-foreground">Your workspace settings</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="font-medium">Organization Name</p>
              <p className="text-sm text-muted-foreground">{organization?.name || "—"}</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">Plan</p>
              <p className="text-sm text-muted-foreground capitalize">{organization?.tier || "free"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences Section */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Palette className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">Preferences</h2>
              <p className="text-sm text-muted-foreground">Customize your experience</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <PreferencesPanel organizationId={profile.organization_id} initialSettings={organizationSettings} />
        </div>
      </div>

      {/* Security Section */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">Security</h2>
              <p className="text-sm text-muted-foreground">Account security settings</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <SecurityPanel email={user.email || ""} />
        </div>
      </div>

      {/* Notifications Section */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Bell className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">Notifications</h2>
              <p className="text-sm text-muted-foreground">Email and alert preferences</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <NotificationsPanel organizationId={profile.organization_id} initialSettings={organizationSettings} />
        </div>
      </div>
    </div>
  );
}
