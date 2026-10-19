ALTER TABLE public.ftth_projects ADD COLUMN user_id UUID DEFAULT auth.uid();
UPDATE public.ftth_projects SET user_id = '216817b4-743b-4bbb-b1c3-71d8c0bd4e64' WHERE user_id IS NULL;
ALTER TABLE public.ftth_projects ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX ftth_projects_user_updated_idx ON public.ftth_projects (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() = '216817b4-743b-4bbb-b1c3-71d8c0bd4e64'::uuid
$$;
REVOKE ALL ON FUNCTION public.is_app_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated;

REVOKE ALL ON public.ftth_projects FROM anon;
DROP POLICY "Acesso público aos projetos" ON public.ftth_projects;
CREATE POLICY "Dono lê seus projetos" ON public.ftth_projects FOR SELECT TO authenticated USING (public.is_app_owner() AND user_id = auth.uid());
CREATE POLICY "Dono cria projetos" ON public.ftth_projects FOR INSERT TO authenticated WITH CHECK (public.is_app_owner() AND user_id = auth.uid());
CREATE POLICY "Dono altera seus projetos" ON public.ftth_projects FOR UPDATE TO authenticated USING (public.is_app_owner() AND user_id = auth.uid()) WITH CHECK (public.is_app_owner() AND user_id = auth.uid());
CREATE POLICY "Dono exclui seus projetos" ON public.ftth_projects FOR DELETE TO authenticated USING (public.is_app_owner() AND user_id = auth.uid());