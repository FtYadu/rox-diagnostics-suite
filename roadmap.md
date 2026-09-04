# ROX Diagnostics — roadmap

## In progress — Payments (subscription gate)
- [x] Stripe products, checkout, portal, webhook, `subscriptions` table
- [x] Supabase email/password sign-in + sign-up on `/`
- [x] Shell gated on active subscription, billing menu in top bar
- [ ] Verify paywall end to end with a confirmed auth user

## Batch 3b — close Batch 3 stubs
- [ ] 1. Supabase: `dealers`, `profiles` (+ signup trigger), `jobs` (dealer scoped),
      `job_attachments`, private `job-logs` bucket, dealer-scoped RLS + role write policies,
      regenerate types
- [ ] 1b. Wire `job-cloud.ts` to the new tables; attachments under `<dealer_id>/<job_id>/…`
      with signed URLs; roles read from `profiles.role` (Settings selector becomes
      admin-only impersonation, hidden in production)
- [ ] 2. Offline queue replay (ordered flush, retry/backoff, "N pending" pill) + PWA
      caching of app shell, seed JSON and fonts; verify offline shell in preview
- [ ] 3. i18n: every user-visible string through `t()`, real zh translations, parity test
- [ ] 4. Tests: queue replay (order/retry/backoff), role guards; keep existing suite green;
      attempt `playwright install chromium` + E2E
- [ ] 5. CHANGELOG 0.4.1 (2026-09-04) + docs/SCOPE.md status

## Known stubs / deferred
- Seed lacks `ioControls` / `writeDids` until canonical extraction lands
- Agent refuses startup without canonical ECU mappings (`ROX_AGENT_ALLOW_OVERRIDE=1` to bypass)
- Guided runner in Simulator still uses the legacy step builder for some processes
