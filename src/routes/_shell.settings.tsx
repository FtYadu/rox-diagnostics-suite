import { createFileRoute } from "@tanstack/react-router";
import { Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { vehicle } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { useAppStore } from "@/store/app-store";

export const Route = createFileRoute("/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Switch between the built-in simulator and a local VCI bridge, manage appearance and review workstation connection details.",
      },
      { property: "og:title", content: "Settings · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Bridge selection, appearance and connection settings for ROX Diagnostics.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const bridgeMode = useAppStore((s) => s.bridgeMode);
  const setBridgeMode = useAppStore((s) => s.setBridgeMode);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const user = useAppStore((s) => s.user);
  const signOut = useAppStore((s) => s.signOut);
  const { connection, status, reconnect } = useBridge();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Workstation configuration and hardware bridge" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Diagnostic bridge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                mode: "simulator" as const,
                title: "Simulator",
                description: "In-browser simulation of the full R11_Oversea bus. No hardware.",
              },
              {
                mode: "local" as const,
                title: "Local VCI bridge",
                description: "Connects to the local agent on ws://127.0.0.1:9097.",
              },
            ].map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => {
                  setBridgeMode(option.mode);
                  toast.success(`Bridge switched to ${option.title}`);
                }}
                className={`w-full rounded-xl px-4 py-3 text-left transition-colors hairline ${
                  bridgeMode === option.mode
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary/40 hover:bg-accent/40"
                }`}
              >
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
            <Button
              variant="secondary"
              className="w-full rounded-full"
              onClick={() => void reconnect()}
            >
              <RefreshCw className="size-4" />
              Reconnect bridge
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Status" value={status} />
            <Row label="VCI" value={connection?.vciName ?? "—"} />
            <Row label="Serial" value={connection?.vciSerial ?? "—"} />
            <Row label="Protocol" value={connection?.protocol ?? vehicle.bus} />
            <Row
              label="Battery"
              value={connection ? `${connection.batteryVoltage.toFixed(1)} V` : "—"}
            />
            <Row label="Ignition" value={connection?.ignitionOn ? "On" : "Off"} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-xl bg-secondary/40 px-4 py-3 hairline">
              <Label htmlFor="dark-mode" className="text-sm">
                Dark appearance
              </Label>
              <Switch id="dark-mode" checked={theme === "dark"} onCheckedChange={toggleTheme} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Technician</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Name" value={user?.name ?? "—"} />
            <Row label="Account" value={user?.email ?? "—"} />
            <Button variant="secondary" className="w-full rounded-full" onClick={signOut}>
              <Plug className="size-4" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 px-4 py-2.5 hairline">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}
