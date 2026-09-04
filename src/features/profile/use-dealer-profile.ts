import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchDealerProfile, type DealerProfile } from "./profile";

/** Loads the signed-in technician's dealer profile and keeps it in sync with auth. */
export function useDealerProfile(): { profile: DealerProfile | null; loading: boolean } {
  const [profile, setProfile] = useState<DealerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const next = await fetchDealerProfile();
      if (!active) return;
      setProfile(next);
      setLoading(false);
    };

    void load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void load();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { profile, loading };
}
