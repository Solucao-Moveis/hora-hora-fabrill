-- Adiciona modo de operação em cada área: 'production' (padrão) ou 'tasks'
ALTER TABLE public.areas
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'production'
  CHECK (mode IN ('production', 'tasks'));

-- Seta Prototipagem como área de tarefas
UPDATE public.areas SET mode = 'tasks' WHERE slug = 'prototipagem';

-- Tabela de tarefas da Prototipagem
CREATE TABLE IF NOT EXISTS public.prototype_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  task_date   date NOT NULL,
  hour_slot   smallint NOT NULL CHECK (hour_slot BETWEEN 0 AND 9),
  description text NOT NULL,
  status      text NOT NULL DEFAULT 'nao_feito'
              CHECK (status IN ('nao_feito', 'incompleto', 'feito')),
  observation text,
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prototype_tasks ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado lê
CREATE POLICY "proto_tasks read" ON public.prototype_tasks
  FOR SELECT TO authenticated USING (true);

-- Líder da área ou PCP cria
CREATE POLICY "proto_tasks insert" ON public.prototype_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_pcp(auth.uid())
    OR public.user_can_access_area(auth.uid(), area_id)
  );

-- Qualquer autenticado atualiza status/observação
CREATE POLICY "proto_tasks update" ON public.prototype_tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Líder da área ou PCP exclui
CREATE POLICY "proto_tasks delete" ON public.prototype_tasks
  FOR DELETE TO authenticated
  USING (
    public.is_pcp(auth.uid())
    OR public.user_can_access_area(auth.uid(), area_id)
  );
