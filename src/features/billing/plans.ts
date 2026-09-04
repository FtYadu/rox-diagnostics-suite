export type BillingInterval = "month" | "year";

export type Plan = {
  /** Human-readable Stripe price id (stable across test and live). */
  priceId: string;
  productId: string;
  tier: "workshop" | "workshop_pro";
  name: string;
  interval: BillingInterval;
  amount: number;
  currency: string;
  tagline: string;
  features: string[];
};

export const plans: Plan[] = [
  {
    priceId: "workshop_monthly",
    productId: "workshop_plan",
    tier: "workshop",
    name: "Workshop",
    interval: "month",
    amount: 149,
    currency: "USD",
    tagline: "Everything a dealer bay needs for day-to-day diagnostics.",
    features: [
      "Full-vehicle health scans across all 41 control units",
      "Fault codes with freeze frames and clear-all",
      "Live data graphing and recording",
      "IO control, routines and guided service functions",
      "PDF and XLSX job reports",
    ],
  },
  {
    priceId: "workshop_yearly",
    productId: "workshop_plan",
    tier: "workshop",
    name: "Workshop",
    interval: "year",
    amount: 1490,
    currency: "USD",
    tagline: "Two months free when you pay yearly.",
    features: [
      "Full-vehicle health scans across all 41 control units",
      "Fault codes with freeze frames and clear-all",
      "Live data graphing and recording",
      "IO control, routines and guided service functions",
      "PDF and XLSX job reports",
    ],
  },
  {
    priceId: "workshop_pro_monthly",
    productId: "workshop_pro_plan",
    tier: "workshop_pro",
    name: "Workshop Pro",
    interval: "month",
    amount: 299,
    currency: "USD",
    tagline: "For master technicians doing programming and coding work.",
    features: [
      "Everything in Workshop",
      "ECU programming flows",
      "Configuration writes (WriteDataByIdentifier)",
      "Immobiliser and security-level processes",
      "Priority technical support",
    ],
  },
  {
    priceId: "workshop_pro_yearly",
    productId: "workshop_pro_plan",
    tier: "workshop_pro",
    name: "Workshop Pro",
    interval: "year",
    amount: 2990,
    currency: "USD",
    tagline: "Two months free when you pay yearly.",
    features: [
      "Everything in Workshop",
      "ECU programming flows",
      "Configuration writes (WriteDataByIdentifier)",
      "Immobiliser and security-level processes",
      "Priority technical support",
    ],
  },
];

export const proPriceIds = new Set(["workshop_pro_monthly", "workshop_pro_yearly"]);

export const planByPriceId = (priceId: string | null | undefined): Plan | undefined =>
  plans.find((plan) => plan.priceId === priceId);

export const formatPlanPrice = (plan: Plan): string =>
  `$${plan.amount.toLocaleString("en-US")}/${plan.interval === "month" ? "mo" : "yr"}`;
