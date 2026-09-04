import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { planByPriceId, proPriceIds, type Plan } from "./plans";

export type SubscriptionRow = {
  price_id: string;
  product_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type SubscriptionState = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  subscription: SubscriptionRow | null;
  plan: Plan | undefined;
  isActive: boolean;
  isPro: boolean;
  pastDue: boolean;
  refresh: () => Promise<void>;
};

const activeStatuses = new Set(["active", "trialing", "past_due"]);

const hasAccess = (row: SubscriptionRow | null): boolean => {
  if (!row) return false;
  const future = !row.current_period_end || new Date(row.current_period_end) > new Date();
  if (activeStatuses.has(row.status)) return future;
  return row.status === "canceled" && future;
};

/** Reads the signed-in workshop's subscription for the current payments environment. */
export function useSubscription(): SubscriptionState {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    setUserId(user?.id ?? null);
    setEmail(user?.email ?? null);

    if (!user || !isPaymentsConfigured()) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("subscriptions")
      .select("price_id, product_id, status, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .eq("environment", getStripeEnvironment())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setSubscription((data as SubscriptionRow | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void load();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`subscriptions:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return {
    loading,
    userId,
    email,
    subscription,
    plan: planByPriceId(subscription?.price_id),
    isActive: hasAccess(subscription),
    isPro: hasAccess(subscription) && proPriceIds.has(subscription?.price_id ?? ""),
    pastDue: subscription?.status === "past_due",
    refresh: load,
  };
}
