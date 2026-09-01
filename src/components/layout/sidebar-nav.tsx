import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Activity,
  Cpu,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Stethoscope,
  Upload,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { vehicle } from "@/data/vehicle-data";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vehicle", label: "Vehicle", icon: Gauge },
  { to: "/health-scan", label: "Health Scan", icon: Stethoscope },
  { to: "/ecus", label: "ECUs", icon: Cpu },
  { to: "/service-functions", label: "Service Functions", icon: Wrench },
  { to: "/programming", label: "Programming", icon: Upload },
  { to: "/live-data", label: "Live Data", icon: Activity },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/job-history", label: "Job History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "glass-chrome flex h-full flex-col gap-1 border-r p-3 transition-[width] duration-300",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div className="mb-3 flex items-center gap-2 px-1.5 py-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <Cpu className="size-5" />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">ROX Diagnostics</p>
            <p className="truncate text-[11px] text-muted-foreground">{vehicle.code}</p>
          </div>
        )}
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              activeProps={{ "data-active": "true" }}
              className={cn(
                "group flex min-h-11 items-center gap-3 rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                "data-[active=true]:bg-primary/12 data-[active=true]:text-primary",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost"
        size="sm"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="mt-2 justify-start gap-3 text-muted-foreground"
      >
        {collapsed ? (
          <PanelLeftOpen className="size-[18px]" />
        ) : (
          <motion.span initial={false} className="flex items-center gap-3">
            <PanelLeftClose className="size-[18px]" />
            <span>Collapse</span>
          </motion.span>
        )}
      </Button>
    </nav>
  );
}
