
-- Helper: is_qualidade
CREATE OR REPLACE FUNCTION public.is_qualidade(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'qualidade')
$$;

-- Table
CREATE TABLE public.production_deviations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deviation_date date NOT NULL,
  deviation_time time NOT NULL,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  item_code text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  piece_weight numeric NOT NULL DEFAULT 0,
  total_weight numeric GENERATED ALWAYS AS (quantity * piece_weight) STORED,
  deviation text NOT NULL,
  operator_name text,
  action_plan text,
  action_responsible text,
  photos text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_deviations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deviations read pcp or qualidade"
  ON public.production_deviations FOR SELECT
  TO authenticated
  USING (public.is_pcp(auth.uid()) OR public.is_qualidade(auth.uid()));

CREATE POLICY "deviations insert qualidade"
  ON public.production_deviations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_qualidade(auth.uid()));

CREATE POLICY "deviations update qualidade"
  ON public.production_deviations FOR UPDATE
  TO authenticated
  USING (public.is_qualidade(auth.uid()))
  WITH CHECK (public.is_qualidade(auth.uid()));

CREATE POLICY "deviations delete qualidade"
  ON public.production_deviations FOR DELETE
  TO authenticated
  USING (public.is_qualidade(auth.uid()));

CREATE INDEX idx_deviations_date ON public.production_deviations(deviation_date DESC);
CREATE INDEX idx_deviations_area ON public.production_deviations(area_id);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('deviation-photos', 'deviation-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "deviation-photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'deviation-photos');

CREATE POLICY "deviation-photos qualidade insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'deviation-photos' AND public.is_qualidade(auth.uid()));

CREATE POLICY "deviation-photos qualidade update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'deviation-photos' AND public.is_qualidade(auth.uid()));

CREATE POLICY "deviation-photos qualidade delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'deviation-photos' AND public.is_qualidade(auth.uid()));
