
CREATE TABLE public.meta_justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL,
  justification_date date NOT NULL,
  justification text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, justification_date)
);

ALTER TABLE public.meta_justifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "justif read scoped" ON public.meta_justifications
  FOR SELECT TO authenticated
  USING (public.user_can_access_machine(auth.uid(), machine_id));

CREATE POLICY "justif write scoped" ON public.meta_justifications
  FOR ALL TO authenticated
  USING (public.user_can_access_machine(auth.uid(), machine_id))
  WITH CHECK (public.user_can_access_machine(auth.uid(), machine_id));
