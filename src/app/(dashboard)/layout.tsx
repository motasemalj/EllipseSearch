import { redirect } from "next/navigation";
import { getCurrentUser, getUserProfile } from "@/lib/cache";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use cached user fetching - this is deduplicated across all server components in the request
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Use cached profile fetching - deduplicated and reused
  const profile = await getUserProfile(user.id);
  const organization = profile?.organizations as { credits_balance?: number } | null;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content - with left margin for sidebar */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        <Header 
          user={{ email: user.email }} 
          credits={organization?.credits_balance ?? 0}
        />
        
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
