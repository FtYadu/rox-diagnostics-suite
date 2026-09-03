import { Link } from "@tanstack/react-router";
import {
  BatteryCharging,
  Car,
  Cable,
  LogOut,
  Menu,
  Moon,
  Radio,
  Sun,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { vehicle } from "@/data/vehicle-data";
import { useBridge } from "@/features/bridge/bridge-provider";
import { VinDialog } from "@/features/vehicle/vin-dialog";
import { useAppStore } from "@/store/app-store";

export function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { bridge, status, connection, usingFallback } = useBridge();
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const signOut = useAppStore((s) => s.signOut);
  const user = useAppStore((s) => s.user);
  const vin = useAppStore((s) => s.vin);
  const [vinOpen, setVinOpen] = useState(false);

  const bridgeLabel =
    usingFallback || status === "offline"
      ? "Bridge offline — using Simulator"
      : status === "connecting"
        ? "Connecting…"
        : bridge.mode === "local" && status === "connected"
          ? "Hardware connected"
          : "Simulator";

  const bridgeTone =
    usingFallback || status === "offline"
      ? "bg-warning/15 text-warning"
      : status === "connected"
        ? "bg-success/15 text-success"
        : "bg-muted text-muted-foreground";

  return (
    <header className="glass-chrome sticky top-0 z-30 flex items-center gap-3 border-b px-3 py-2.5 sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        onClick={onOpenMobileNav}
        className="min-h-11 min-w-11 lg:hidden"
      >
        <Menu className="size-5" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={() => setVinOpen(true)}
          aria-label={vin ? `Change VIN, currently ${vin}` : "Set the vehicle VIN"}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-secondary/70 px-3 py-1.5 transition-colors hairline hover:bg-accent/50"
        >
          <Car className="size-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium">{vehicle.name}</span>
          {vin ? (
            <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline numerals">
              {vin}
            </span>
          ) : (
            <span className="hidden text-[11px] font-medium text-warning sm:inline">Set VIN</span>
          )}
        </button>
      </div>

      <span
        className={cn(
          "hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium md:flex",
          bridgeTone,
        )}
      >
        <Radio className="size-3.5" />
        {bridgeLabel}
      </span>

      <span className="hidden items-center gap-2 rounded-full bg-secondary/70 px-3 py-1.5 text-xs text-muted-foreground lg:flex hairline">
        <Cable className="size-3.5" />
        {connection?.vciName ?? "No VCI"}
      </span>

      <span className="hidden items-center gap-1.5 rounded-full bg-secondary/70 px-3 py-1.5 text-xs font-medium lg:flex hairline numerals">
        <BatteryCharging className="size-3.5 text-success" />
        {connection ? `${connection.batteryVoltage.toFixed(1)} V` : "—"}
      </span>

      <Button
        variant="ghost"
        size="icon"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        onClick={toggleTheme}
        className="min-h-11 min-w-11"
      >
        {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="User menu" className="min-h-11 min-w-11">
            <UserRound className="size-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuLabel>
            <p className="text-sm font-medium">{user?.name ?? "Technician"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email ?? "—"}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VinDialog open={vinOpen} onOpenChange={setVinOpen} />
    </header>
  );
}
