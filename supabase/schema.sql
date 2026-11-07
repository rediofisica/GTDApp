-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enum estricto para los estados GTD
DO $$ BEGIN
  CREATE TYPE gtd_status AS ENUM (
    'Inbox',
    'Next Action',
    'Action',
    'In Progress',
    'Someday',
    'Waiting',
    'Completado'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Tabla de Contextos Dinámicos
CREATE TABLE IF NOT EXISTS public.contexts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 4. Tabla de Proyectos
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabla Principal de Tareas
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  status gtd_status NOT NULL DEFAULT 'Inbox',
  context_id UUID NOT NULL REFERENCES public.contexts(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 6. Tabla de API Keys para acceso externo de Gemini
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL UNIQUE DEFAULT ('gtd_' || encode(gen_random_bytes(24), 'hex')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Trigger: Gestión automática de fechas de creación y finalización
CREATE OR REPLACE FUNCTION public.handle_task_completion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Completado' AND (OLD.status IS NULL OR OLD.status != 'Completado') THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'Completado' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_completion ON public.tasks;
CREATE TRIGGER trg_task_completion
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_completion_timestamp();

-- 8. Trigger: Inicializar contextos ("Trabajo", "Casa") y API Key al crear usuario
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.contexts (user_id, name)
  VALUES (NEW.id, 'Trabajo'), (NEW.id, 'Casa')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_api_keys (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_setup();

-- 9. Políticas RLS (Row Level Security)
ALTER TABLE public.contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento de contextos por usuario" ON public.contexts;
CREATE POLICY "Aislamiento de contextos por usuario" ON public.contexts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Aislamiento de proyectos por usuario" ON public.projects;
CREATE POLICY "Aislamiento de proyectos por usuario" ON public.projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Aislamiento de tareas por usuario" ON public.tasks;
CREATE POLICY "Aislamiento de tareas por usuario" ON public.tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Lectura y regeneración de API Key propia" ON public.user_api_keys;
CREATE POLICY "Lectura y regeneración de API Key propia" ON public.user_api_keys
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
