import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let cached: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      process.env["SUPABASE_URL"] as string,
      process.env["SUPABASE_SERVICE_ROLE_KEY"] as string,
    );
  }
  return cached;
}

type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: {
    data?: Array<{
      current_period_start?: number;
      current_period_end?: number;
      price?: {
        id?: string;
        lookup_key?: string | null;
        product?: string;
        metadata?: Record<string, string>;
      };
    }>;
  };
};

const iso = (seconds?: number): string | null =>
  seconds ? new Date(seconds * 1000).toISOString() : null;

const readItem = (subscription: StripeSubscription) => {
  const item = subscription.items?.data?.[0];
  return {
    priceId:
      item?.price?.lookup_key ?? item?.price?.metadata?.["lovable_external_id"] ?? item?.price?.id,
    productId: item?.price?.product,
    periodStart: item?.current_period_start ?? subscription.current_period_start,
    periodEnd: item?.current_period_end ?? subscription.current_period_end,
  };
};

async function upsertSubscription(subscription: StripeSubscription, env: StripeEnv) {
  const userId = subscription.metadata?.["userId"];
  if (!userId) {
    console.error("Subscription webhook without userId metadata:", subscription.id);
    return;
  }
  const { priceId, productId, periodStart, periodEnd } = readItem(subscription);

  await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        product_id: productId ?? "",
        price_id: priceId ?? "",
        status: subscription.status,
        current_period_start: iso(periodStart),
        current_period_end: iso(periodEnd),
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );
}

async function updateSubscription(subscription: StripeSubscription, env: StripeEnv) {
  const { priceId, productId, periodStart, periodEnd } = readItem(subscription);
  await getSupabase()
    .from("subscriptions")
    .update({
      status: subscription.status,
      product_id: productId ?? "",
      price_id: priceId ?? "",
      current_period_start: iso(periodStart),
      current_period_end: iso(periodEnd),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function cancelSubscription(subscription: StripeSubscription, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleWebhook(request: Request, env: StripeEnv) {
  const event = await verifyWebhook(request, env);
  const object = event.data.object as unknown as StripeSubscription;

  switch (event.type) {
    case "customer.subscription.created":
      await upsertSubscription(object, env);
      break;
    case "customer.subscription.updated":
      await updateSubscription(object, env);
      break;
    case "customer.subscription.deleted":
      await cancelSubscription(object, env);
      break;
    default:
      break;
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Payments webhook with invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (error) {
          console.error("Payments webhook error:", error);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
