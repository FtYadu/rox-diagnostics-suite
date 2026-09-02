import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Cpu, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vehicle } from "@/data/vehicle-data";
import { VinPicker } from "@/features/vehicle/vin-picker";
import { checkVin } from "@/features/vehicle/vin";
import { useAppStore } from "@/store/app-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in · ROX Diagnostics Workstation" },
      {
        name: "description",
        content:
          "Dealer sign-in for the ROX Diagnostics workstation — ECU diagnostics, guided service functions and programming for the ROX 01 (R11_Oversea).",
      },
      { property: "og:title", content: "Sign in · ROX Diagnostics Workstation" },
      {
        property: "og:description",
        content: "ECU diagnostics, guided service functions and programming for the ROX 01.",
      },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const signIn = useAppStore((s) => s.signIn);
  const setVin = useAppStore((s) => s.setVin);
  const storedVin = useAppStore((s) => s.vin);
  const vinHistory = useAppStore((s) => s.vinHistory);
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vin, setVinDraft] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useAppStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (user) void navigate({ to: "/dashboard" });
  }, [user, navigate]);

  useEffect(() => {
    if (storedVin) setVinDraft(storedVin);
  }, [storedVin]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.includes("@") || password.length < 4) {
      setError("Enter your dealer email and a password of at least 4 characters.");
      return;
    }
    const parsedVin = checkVin(vin);
    if (!parsedVin.ok) {
      setError(`Vehicle VIN: ${parsedVin.error}.`);
      return;
    }
    setError(null);
    setVin(parsedVin.vin);
    signIn(email, false);
    void navigate({ to: "/dashboard" });
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-secondary/40 p-12 lg:flex">
        <div className="pointer-events-none absolute -left-24 top-10 size-[520px] rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 size-[420px] rounded-full bg-chart-2/15 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Cpu className="size-5" />
          </span>
          <p className="text-sm font-semibold tracking-tight">ROX Diagnostics</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-lg"
        >
          <p className="text-sm font-medium text-primary">{vehicle.code}</p>
          <h1 className="mt-3 text-5xl font-semibold leading-[1.05] tracking-tight">
            {vehicle.name}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            The dealer workstation for full-vehicle health scans, guided service processes and ECU
            programming. {vehicle.ecuCount} control units over {vehicle.bus}.
          </p>
          <div className="mt-8 flex gap-8">
            <Stat value={`${vehicle.ecuCount}`} label="Control units" />
            <Stat value="131" label="Service processes" />
            <Stat value="2" label="Programming flows" />
          </div>
        </motion.div>

        <p className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" />
          Authorised dealer personnel only · UDS ISO 14229 security access
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your dealer account to open the workstation.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Dealer email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tech@dealer.rox"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            <VinPicker
              value={vin}
              onChange={setVinDraft}
              recent={vinHistory}
              label="Vehicle VIN"
              hint="The VIN of the car on the lift — every job you run is filed against it."
            />

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                Remember me
              </label>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" />
                Local session
              </span>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold">
              Open workstation
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Diagnostic sessions run through the Simulator bridge until a local hardware agent is
            detected.
          </p>
        </motion.div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold tracking-tight numerals">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
