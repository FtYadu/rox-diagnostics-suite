import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { TopBar } from "@/components/layout/top-bar";
import { BridgeProvider } from "@/features/bridge/bridge-provider";
import { useAppStore } from "@/store/app-store";
import { setLanguage } from "@/i18n";
import { useSubscription } from "@/features/billing/use-subscription";
import { useDealerProfile } from "@/features/profile/use-dealer-profile";
import { PaymentTestModeBanner } from "@/features/billing/payment-test-mode-banner";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const { loading: subscriptionLoading, userId, isActive, pastDue } = useSubscription();
  const { profile } = useDealerProfile();
  const setRole = useAppStore((s) => s.setRole);

  useEffect(() => {
    void useAppStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    setLanguage(language);
  }, [language]);

  useEffect(() => {
    if (hydrated && !user) void navigate({ to: "/" });
  }, [hydrated, user, navigate]);

  // profiles.role is authoritative: mirror it into the store the guards read.
  useEffect(() => {
    if (profile) setRole(profile.role);
  }, [profile, setRole]);

  // Diagnostics stay locked until the workshop has an active subscription.
  useEffect(() => {
    if (subscriptionLoading) return;
    if (!userId) void navigate({ to: "/" });
    else if (!isActive) void navigate({ to: "/subscribe" });
  }, [subscriptionLoading, userId, isActive, navigate]);

  if (!hydrated || !user || subscriptionLoading || !isActive) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Loading workstation…</p>
      </div>
    );
  }

  return (
    <BridgeProvider>
      <div className="flex min-h-dvh bg-background">
        <aside className="sticky top-0 hidden h-dvh lg:block">
          <SidebarNav />
        </aside>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <PaymentTestModeBanner />
          {pastDue && (
            <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs text-warning">
              Your last payment failed. Update the card in billing to keep workshop access.
            </div>
          )}
          <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </BridgeProvider>
  );
}
