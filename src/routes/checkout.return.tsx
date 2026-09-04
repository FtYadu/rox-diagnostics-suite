import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/features/billing/use-subscription";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({
    meta: [
      { title: "Subscription confirmed · ROX Diagnostics" },
      {
        name: "description",
        content: "Your ROX Diagnostics workshop plan is being activated for this dealer account.",
      },
      { property: "og:title", content: "Subscription confirmed · ROX Diagnostics" },
      {
        property: "og:description",
        content: "Workshop access is activating for your ROX Diagnostics account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : undefined,
  }),
  component: CheckoutReturnPage,
});

function CheckoutReturnPage() {
  const navigate = useNavigate();
  const { isActive, loading, refresh } = useSubscription();

  useEffect(() => {
    if (isActive) void navigate({ to: "/dashboard" });
  }, [isActive, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5">
      <div className="w-full max-w-sm rounded-[18px] bg-card p-7 text-center hairline">
        {isActive ? (
          <CheckCircle2 className="mx-auto size-8 text-success" />
        ) : (
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
        )}
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          {isActive ? "Workshop access unlocked" : "Confirming your payment"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isActive
            ? "Opening the workstation…"
            : "This usually takes a few seconds. Keep this page open."}
        </p>
        <Button
          variant="ghost"
          className="mt-5 w-full rounded-xl"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Check again
        </Button>
      </div>
    </div>
  );
}
