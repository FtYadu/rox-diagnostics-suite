import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Cpu, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OAuthResult = {
  redirect_url?: string;
  redirect_to?: string;
  client?: { name?: string } | null;
};

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthResult | null; error: unknown }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: unknown }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: unknown }>;
};

const oauth = (): OAuthNamespace =>
  (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

const errorMessage = (error: unknown): string =>
  error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error);

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search['authorization_id'] === "string" ? search['authorization_id'] : "",
  }),
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Missing authorization_id");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(errorMessage(error));
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <Shell>
      <p className="text-sm text-danger">
        Could not load this authorization request: {errorMessage(error)}
      </p>
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-md space-y-5 rounded-[18px] border border-hairline bg-card p-7 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <Cpu className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">ROX Diagnostics</p>
            <p className="text-[11px] text-muted-foreground">Agent integration access</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id: authorizationId } = Route.useSearch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    void router.invalidate();
  };

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    const { data, error: decideError } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(errorMessage(decideError));
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  };

  if (!details) {
    return (
      <Shell>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Sign in to continue</h1>
          <p className="text-xs text-muted-foreground">
            Use your dealer account so the connecting app acts as you.
          </p>
        </div>
        <form className="space-y-3" onSubmit={signIn}>
          <div className="space-y-1.5">
            <Label htmlFor="consent-email">Dealer email</Label>
            <Input
              id="consent-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="consent-password">Password</Label>
            <Input
              id="consent-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="min-h-11 w-full rounded-full">
            <Lock className="size-4" />
            Sign in
          </Button>
        </form>
      </Shell>
    );
  }

  const clientName = details.client?.name ?? "an app";

  return (
    <Shell>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Connect {clientName}</h1>
        <p className="text-sm text-muted-foreground">
          {clientName} will read your ECU reference data and your diagnostic jobs, and can add notes
          to them — acting as your account.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          disabled={busy}
          onClick={() => void decide(true)}
          className="min-h-11 flex-1 rounded-full"
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void decide(false)}
          className="min-h-11 flex-1 rounded-full"
        >
          Deny
        </Button>
      </div>
    </Shell>
  );
}
