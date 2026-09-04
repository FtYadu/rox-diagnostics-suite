import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Check, Cpu, Loader2, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckoutPanel } from "@/features/billing/checkout-panel";
import { PaymentTestModeBanner } from "@/features/billing/payment-test-mode-banner";
import { formatPlanPrice, plans, type BillingInterval } from "@/features/billing/plans";
import { useSubscription } from "@/features/billing/use-subscription";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [
      { title: "Workshop plans · ROX Diagnostics" },
      {
        name: "description",
        content:
          "Choose a ROX Diagnostics workshop plan — full-vehicle health scans, guided service functions and ECU programming for the ROX 01.",
      },
      { property: "og:title", content: "Workshop plans · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Subscribe to unlock dealer diagnostics for the ROX 01 (R11_Oversea).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubscribePage,
});

function SubscribePage() {
  const navigate = useNavigate();
  const { loading, userId, isActive } = useSubscription();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [priceId, setPriceId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !userId) void navigate({ to: "/" });
  }, [loading, userId, navigate]);

  useEffect(() => {
    if (isActive) void navigate({ to: "/dashboard" });
  }, [isActive, navigate]);

  const visible = plans.filter((plan) => plan.interval === interval);
  const returnUrl = `${typeof window === "undefined" ? "" : window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;

  return (
    <div className="min-h-dvh bg-background">
      <PaymentTestModeBanner />

      <header className="glass-chrome sticky top-0 z-20 flex items-center gap-3 border-b px-5 py-3">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
          <Cpu className="size-5" />
        </span>
        <p className="text-sm font-semibold tracking-tight">ROX Diagnostics</p>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-2 text-muted-foreground"
          onClick={async () => {
            await supabase.auth.signOut();
            void navigate({ to: "/" });
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking your workshop plan…
          </p>
        ) : priceId ? (
          <section className="mx-auto max-w-3xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Complete your subscription
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your workstation unlocks as soon as the payment clears.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPriceId(null)}>
                Change plan
              </Button>
            </div>
            <CheckoutPanel priceId={priceId} returnUrl={returnUrl} />
          </section>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-2xl"
            >
              <p className="text-sm font-medium text-primary">Workshop access</p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
                Pick the plan for your bay
              </h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Diagnostics stay locked until a plan is active. Every plan covers one workshop, all
                41 control units and unlimited jobs.
              </p>
            </motion.div>

            <div className="mt-8 inline-flex rounded-full bg-secondary/70 p-1 hairline">
              {(["month", "year"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInterval(value)}
                  className={cn(
                    "min-h-11 rounded-full px-5 text-sm font-medium transition-colors",
                    interval === value
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "month" ? "Monthly" : "Yearly · 2 months free"}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {visible.map((plan) => (
                <article
                  key={plan.priceId}
                  className="flex flex-col rounded-[18px] bg-card p-6 hairline"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-tight">{plan.name}</h2>
                    <p className="text-2xl font-semibold tracking-tight numerals">
                      {formatPlanPrice(plan)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-6 h-11 rounded-xl text-sm font-semibold"
                    onClick={() => setPriceId(plan.priceId)}
                  >
                    Choose {plan.name}
                  </Button>
                </article>
              ))}
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              Prices in USD, excluding tax. Cancel any time from the billing portal — access runs to
              the end of the paid period.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
