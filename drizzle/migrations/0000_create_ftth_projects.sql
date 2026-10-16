CREATE TABLE public.ftth_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Projeto FTTH',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ftth_projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ftth_projects TO authenticated;
GRANT ALL ON public.ftth_projects TO service_role;
ALTER TABLE public.ftth_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso público aos projetos" ON public.ftth_projects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);