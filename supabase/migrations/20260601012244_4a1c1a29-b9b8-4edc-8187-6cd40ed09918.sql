
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'administrador') $$;

-- Replace goals write policy with granular ones
DROP POLICY IF EXISTS "goals write pcp" ON public.production_goals;

CREATE POLICY "goals insert pcp or admin"
ON public.production_goals FOR INSERT TO authenticated
WITH CHECK (public.is_pcp(auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "goals update admin only"
ON public.production_goals FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "goals delete admin only"
ON public.production_goals FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- Grant admin role to João Santana
INSERT INTO public.user_roles (user_id, role)
VALUES ('b13a425d-af91-40f8-b3f0-d40696e92ad1', 'administrador')
ON CONFLICT DO NOTHING;
