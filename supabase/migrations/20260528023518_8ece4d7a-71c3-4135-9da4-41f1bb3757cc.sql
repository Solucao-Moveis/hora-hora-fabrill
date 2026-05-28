
-- 1) Collaborators per area (cadastro do líder)
CREATE TABLE public.collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX collaborators_area_name_uq
  ON public.collaborators (area_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collaborators TO authenticated;
GRANT ALL ON public.collaborators TO service_role;

ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collaborators read scoped"
  ON public.collaborators
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_area(auth.uid(), area_id));

CREATE POLICY "collaborators write scoped"
  ON public.collaborators
  FOR ALL
  TO authenticated
  USING (public.user_can_access_area(auth.uid(), area_id))
  WITH CHECK (public.user_can_access_area(auth.uid(), area_id));

-- 2) Allow multiple operators per (machine, day)
ALTER TABLE public.machine_operators
  DROP CONSTRAINT IF EXISTS machine_operators_machine_id_log_date_key;

ALTER TABLE public.machine_operators
  ADD COLUMN IF NOT EXISTS collaborator_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS machine_operators_machine_day_name_uq
  ON public.machine_operators (machine_id, log_date, lower(operator_name));
