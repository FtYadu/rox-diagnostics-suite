import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/roles";

/**
 * Dealer profile. `role` is the authoritative access level for the signed-in
 * technician — it comes from `profiles.role` and is enforced again by RLS.
 */
export type DealerProfile = {
  userId: string;
  dealerId: string;
  role: Role;
  displayName: string;
  dealerName: string;
};

const asRole = (value: string): Role =>
  value === "admin" || value === "senior" ? value : "technician";

export const fetchDealerProfile = async (): Promise<DealerProfile | null> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, dealer_id, role, display_name, dealers(name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;

  const dealer = data.dealers as { name: string } | null;
  return {
    userId: data.user_id,
    dealerId: data.dealer_id,
    role: asRole(data.role),
    displayName: data.display_name,
    dealerName: dealer?.name ?? "ROX Dealer Workshop",
  };
};
