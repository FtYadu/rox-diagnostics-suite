import { createFileRoute } from "@tanstack/react-router";
import { Plug, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ROLE_LABEL, ROLE_ORDER } from "@/lib/roles";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { vehicle } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { useAppStore } from "@/store/app-store";
import { useDealerProfile } from "@/features/profile/use-dealer-profile";

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
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const workstation = useAppStore((s) => s.workstation);
  const setWorkstation = useAppStore((s) => s.setWorkstation);
  const features = useAppStore((s) => s.features);
  const setFeature = useAppStore((s) => s.setFeature);
  const { profile } = useDealerProfile();
  const isAdmin = (profile?.role ?? role) === "admin";
  // Role impersonation is a preview-only debugging aid for workshop admins.
  const canImpersonate = import.meta.env.DEV && profile?.role === "admin";

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
            <CardTitle className="text-base">Local agent &amp; vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="agent-url" className="text-xs">
                Agent URL
              </Label>
              <Input
                id="agent-url"
                value={workstation.agentUrl}
                onChange={(event) => setWorkstation({ agentUrl: event.target.value })}
                className="mt-1 h-11 rounded-xl font-mono"
              />
            </div>
            <div>
              <Label htmlFor="dealer-name" className="text-xs">
                Dealer name (report header)
              </Label>
              <Input
                id="dealer-name"
                value={workstation.dealerName}
                onChange={(event) => setWorkstation({ dealerName: event.target.value })}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div>
              <Label htmlFor="dealer-logo" className="text-xs">
                Dealer logo URL
              </Label>
              <Input
                id="dealer-logo"
                value={workstation.dealerLogo}
                onChange={(event) => setWorkstation({ dealerLogo: event.target.value })}
                placeholder="https://…"
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["R11", "R11EN", "R11h"] as const).map((variant) => (
                <Button
                  key={variant}
                  variant={workstation.variant === variant ? "default" : "secondary"}
                  className="h-11 rounded-full"
                  onClick={() => setWorkstation({ variant })}
                >
                  {variant}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Language &amp; access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["en", "zh"] as const).map((code) => (
                <Button
                  key={code}
                  variant={language === code ? "default" : "secondary"}
                  className="h-11 rounded-full"
                  onClick={() => setLanguage(code)}
                >
                  {code === "en" ? "English" : "中文"}
                </Button>
              ))}
            </div>
            <div className="rounded-xl bg-secondary/40 px-4 py-3 hairline">
              <p className="text-sm font-medium">
                {profile ? ROLE_LABEL[profile.role] : ROLE_LABEL[role]}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {profile
                  ? `Granted to ${profile.displayName || profile.dealerName} by your workshop admin.`
                  : "Sign in to load your dealer role."}
              </p>
            </div>
            {canImpersonate && (
              <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/10 p-3">
                <p className="text-xs font-medium text-warning">
                  Impersonate a role (preview builds only — the database still enforces your real
                  role).
                </p>
                <div className="flex flex-wrap gap-2">
                  {ROLE_ORDER.map((option) => (
                    <Button
                      key={option}
                      variant={role === option ? "default" : "secondary"}
                      className="h-11 rounded-full"
                      onClick={() => setRole(option)}
                    >
                      {ROLE_LABEL[option]}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Clearing faults, IO control and routines need Senior technician. Configuration writes
              and programming need Workshop admin.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-hairline shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feature flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-4 py-3 hairline">
              <div>
                <Label htmlFor="config-write" className="text-sm">
                  Configuration write (v2)
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isAdmin
                    ? "Enables UDS 0x2E writes with double confirmation."
                    : "Only a Workshop admin can enable this."}
                </p>
              </div>
              <Switch
                id="config-write"
                disabled={!isAdmin}
                checked={features.configurationWrite}
                onCheckedChange={(checked) => setFeature("configurationWrite", checked)}
              />
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
