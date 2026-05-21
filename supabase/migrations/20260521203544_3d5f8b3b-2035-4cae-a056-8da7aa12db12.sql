CREATE TABLE public.overtime_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.overtime_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overtime read auth"
ON public.overtime_days FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "overtime write pcp"
ON public.overtime_days FOR ALL
TO authenticated
USING (public.is_pcp(auth.uid()))
WITH CHECK (public.is_pcp(auth.uid()));