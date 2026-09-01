import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { TopBar } from "@/components/layout/top-bar";
import { BridgeProvider } from "@/features/bridge/bridge-provider";
import { useAppStore } from "@/store/app-store";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    void useAppStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (hydrated && !user) void navigate({ to: "/" });
  }, [hydrated, user, navigate]);

  if (!hydrated || !user) {
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
          <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </BridgeProvider>
  );
}
