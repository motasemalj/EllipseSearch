import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/cache";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Toaster } from "@/components/ui/sonner";
import { SubscriptionBanner } from "@/components/subscription/subscription-banner";
import { RouteProgress } from "@/components/ui/route-progress";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <RouteProgress />
      
      {/* Subscription Banner */}
      <SubscriptionBanner />
      
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="lg:ml-60 min-h-screen flex flex-col">
        <Header user={{ email: user.email }} />
        
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
