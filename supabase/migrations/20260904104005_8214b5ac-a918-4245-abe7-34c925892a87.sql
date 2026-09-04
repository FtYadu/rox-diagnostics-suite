-- 1. dealers -------------------------------------------------------------
CREATE TABLE public.dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dealers TO authenticated;
GRANT ALL ON public.dealers TO service_role;
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;

-- 2. profiles ------------------------------------------------------------
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'technician' CHECK (role IN ('technician','senior','admin')),
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers so policies never re-query the policed table.
CREATE OR REPLACE FUNCTION public.current_dealer_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dealer_id FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.current_dealer_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_role_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_dealer_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated, service_role;

CREATE POLICY "Dealer members can read their dealer"
  ON public.dealers FOR SELECT TO authenticated
  USING (id = public.current_dealer_id());

CREATE POLICY "Dealer members can read dealer profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (dealer_id = public.current_dealer_id());

CREATE POLICY "Users can update their own display name"
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND dealer_id = public.current_dealer_id());

CREATE POLICY "Admins manage dealer roles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (dealer_id = public.current_dealer_id() AND public.current_role_name() = 'admin')
  WITH CHECK (dealer_id = public.current_dealer_id());

-- Signup trigger: first user of a workshop gets their own dealer + admin role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_dealer uuid;
BEGIN
  INSERT INTO public.dealers (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'dealer_name', split_part(NEW.email, '@', 2), 'ROX Dealer Workshop'))
  RETURNING id INTO new_dealer;

  INSERT INTO public.profiles (user_id, dealer_id, role, display_name)
  VALUES (
    NEW.id,
    new_dealer,
    'admin',
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Technician')
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. jobs: dealer scoping ------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN dealer_id uuid REFERENCES public.dealers(id) ON DELETE RESTRICT,
  ADD COLUMN finished_at timestamptz,
  ADD COLUMN summary_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX idx_jobs_dealer_started ON public.jobs (dealer_id, started_at DESC);
CREATE INDEX idx_jobs_vin ON public.jobs (vin);

DROP POLICY IF EXISTS "Users can manage their own jobs" ON public.jobs;

CREATE POLICY "Dealer members can read dealer jobs"
  ON public.jobs FOR SELECT TO authenticated
  USING (dealer_id = public.current_dealer_id() OR user_id = auth.uid());

CREATE POLICY "Dealer members can create jobs for their dealer"
  ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND dealer_id = public.current_dealer_id()
    AND (
      kind NOT IN ('clear-dtc','io-control','routine','config-write','programming')
      OR (kind IN ('clear-dtc','io-control','routine') AND public.current_role_name() IN ('senior','admin'))
      OR (kind IN ('config-write','programming') AND public.current_role_name() = 'admin')
    )
  );

CREATE POLICY "Job owners can update their jobs"
  ON public.jobs FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND dealer_id = public.current_dealer_id())
  WITH CHECK (user_id = auth.uid() AND dealer_id = public.current_dealer_id());

-- job_events follow the same dealer scope through their parent job.
DROP POLICY IF EXISTS "Users can manage their own job events" ON public.job_events;

CREATE POLICY "Dealer members can read dealer job events"
  ON public.job_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_events.job_id
      AND (j.dealer_id = public.current_dealer_id() OR j.user_id = auth.uid())
  ));

CREATE POLICY "Job owners can append job events"
  ON public.job_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.id = job_events.job_id AND j.user_id = auth.uid()
  ));

CREATE POLICY "Job owners can update job events"
  ON public.job_events FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. job_attachments -----------------------------------------------------
CREATE TABLE public.job_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('agent-log','report-pdf','report-xlsx','trace')),
  path text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_attachments_job ON public.job_attachments (job_id);
GRANT SELECT, INSERT, DELETE ON public.job_attachments TO authenticated;
GRANT ALL ON public.job_attachments TO service_role;
ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer members can read dealer attachments"
  ON public.job_attachments FOR SELECT TO authenticated
  USING (dealer_id = public.current_dealer_id());

CREATE POLICY "Job owners can attach files"
  ON public.job_attachments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND dealer_id = public.current_dealer_id());

CREATE POLICY "Job owners can remove their attachments"
  ON public.job_attachments FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND dealer_id = public.current_dealer_id());

-- 5. storage policies for the private job-logs bucket --------------------
CREATE POLICY "Dealer members can read dealer job logs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-logs'
    AND (storage.foldername(name))[1] = public.current_dealer_id()::text
  );

CREATE POLICY "Dealer members can upload dealer job logs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-logs'
    AND (storage.foldername(name))[1] = public.current_dealer_id()::text
  );

CREATE POLICY "Dealer members can replace dealer job logs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'job-logs'
    AND (storage.foldername(name))[1] = public.current_dealer_id()::text
  );