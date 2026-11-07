Actúa como un Ingeniero de Software Senior autónomo ejecutándose en un entorno Linux a través de CLI. Tu objetivo es construir, configurar y dejar listo para producción un sistema completo GTD (Getting Things Done) en el directorio de trabajo actual (`pwd`).

REGLAS DE EJECUCIÓN ESTRICTAS:
1. NO pidas confirmación para crear directorios, escribir archivos ni ejecutar comandos `npm`. Ejecuta todo el flujo de principio a fin de forma 100% autónoma.
2. NO abrevies ni omitas ninguna línea de código con comentarios tipo `// ... resto del código`. Escribe todos los archivos íntegros tal y como están especificados abajo.
3. Si el directorio actual ya tiene `.git` o un `README.md`, respétalos y crea/sobrescribe la estructura del proyecto directamente en la raíz actual.
4. Utiliza ES Modules (`"type": "module"`) en todo el proyecto.
5. Al terminar de escribir todos los archivos, ejecuta `npm install`, genera los iconos de la PWA y verifica que el proyecto compila sin errores ejecutando `npm run build`.

---

### PASO 1: CREAR ESTRUCTURA DE DIRECTORIOS

Ejecuta en terminal:
`mkdir -p api public src/lib src/components supabase mcp-server scripts`

---

### PASO 2: CREAR ARCHIVOS DE CONFIGURACIÓN RAÍZ

#### 2.1 Archivo `package.json`
```json
{
  "name": "gtd-workspace-spa",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "lucide-react": "^0.454.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "vite": "^5.4.8"
  }
}
```

#### 2.2 Archivo `vite.config.js`
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

#### 2.3 Archivo `tailwind.config.js`
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

#### 2.4 Archivo `postcss.config.js`
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

#### 2.5 Archivo `vercel.json`
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### 2.6 Archivo `.env.example` (y copia a `.env` si no existe `.env`)
```env
VITE_SUPABASE_URL=[https://tu-proyecto.supabase.co](https://tu-proyecto.supabase.co)
VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_de_supabase
GEMINI_API_KEY=tu_api_key_de_google_ai_studio
```

#### 2.7 Archivo `.gitignore`
```text
node_modules
dist
.env
.env.local
.vercel
.DS_Store
```

---

### PASO 3: BASE DE DATOS SUPABASE (`supabase/schema.sql`)

Escribe el archivo `supabase/schema.sql` con el esquema completo, tipos ENUM, triggers y políticas RLS:

```sql
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
```

---

### PASO 4: ENDPOINTS BACKEND SERVERLESS PARA VERCEL (`/api`)

#### 4.1 Archivo `api/gemini-tasks.js`
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_STATUSES = [
  'Inbox', 'Next Action', 'Action', 'In Progress', 'Someday', 'Waiting', 'Completado'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Falta el header x-api-key' });
  }

  const { data: keyData, error: keyError } = await supabaseAdmin
    .from('user_api_keys')
    .select('user_id')
    .eq('api_key', apiKey)
    .single();

  if (keyError || !keyData) {
    return res.status(403).json({ error: 'API Key inválida o revocada' });
  }

  const userId = keyData.user_id;

  try {
    if (req.method === 'GET') {
      const { status, context_id, project_id } = req.query;

      let query = supabaseAdmin
        .from('tasks')
        .select('*, contexts(name), projects(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (context_id) query = query.eq('context_id', context_id);
      if (project_id) query = query.eq('project_id', project_id);

      const [tasksRes, contextsRes, projectsRes] = await Promise.all([
        query,
        supabaseAdmin.from('contexts').select('id, name').eq('user_id', userId),
        supabaseAdmin.from('projects').select('id, name, active').eq('user_id', userId)
      ]);

      return res.status(200).json({
        tasks: tasksRes.data || [],
        available_contexts: contextsRes.data || [],
        available_projects: projectsRes.data || [],
        valid_statuses: VALID_STATUSES
      });
    }

    if (req.method === 'POST') {
      const { title, description = '', status = 'Inbox', context_id, context_name, project_id = null } = req.body;

      if (!title) return res.status(400).json({ error: 'El campo title es obligatorio' });
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Estado inválido. Permitidos: ${VALID_STATUSES.join(', ')}` });
      }

      let resolvedContextId = context_id;
      if (!resolvedContextId) {
        const targetName = context_name || 'Trabajo';
        const { data: ctx } = await supabaseAdmin
          .from('contexts')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', targetName)
          .single();

        if (ctx) {
          resolvedContextId = ctx.id;
        } else {
          const { data: newCtx } = await supabaseAdmin
            .from('contexts')
            .insert({ user_id: userId, name: targetName })
            .select('id')
            .single();
          resolvedContextId = newCtx.id;
        }
      }

      const { data, error } = await supabaseAdmin
        .from('tasks')
        .insert({
          user_id: userId,
          title,
          description,
          status,
          context_id: resolvedContextId,
          project_id
        })
        .select('*, contexts(name), projects(name)')
        .single();

      if (error) throw error;
      return res.status(201).json({ message: 'Tarea creada', task: data });
    }

    if (req.method === 'PATCH') {
      const { id, title, description, status, context_id, project_id } = req.body;
      if (!id) return res.status(400).json({ error: 'El campo id de la tarea es obligatorio' });

      const updates = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) {
        if (!VALID_STATUSES.includes(status)) {
          return res.status(400).json({ error: `Estado inválido. Permitidos: ${VALID_STATUSES.join(', ')}` });
        }
        updates.status = status;
      }
      if (context_id !== undefined) updates.context_id = context_id;
      if (project_id !== undefined) updates.project_id = project_id;

      const { data, error } = await supabaseAdmin
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select('*, contexts(name), projects(name)')
        .single();

      if (error) throw error;
      return res.status(200).json({ message: 'Tarea actualizada', task: data });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
```

#### 4.2 Archivo `api/gemini-voice.js`
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_STATUSES = [
  'Inbox', 'Next Action', 'Action', 'In Progress', 'Someday', 'Waiting', 'Completado'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo se permite POST' });

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'Falta el header x-api-key' });

  const { data: keyData, error: keyError } = await supabaseAdmin
    .from('user_api_keys')
    .select('user_id')
    .eq('api_key', apiKey)
    .single();

  if (keyError || !keyData) {
    return res.status(403).json({ error: 'API Key inválida' });
  }

  const userId = keyData.user_id;
  const rawPrompt = typeof req.body === 'string' ? req.body : req.body?.text;

  if (!rawPrompt || !rawPrompt.trim()) {
    return res.status(400).json({ error: 'No se recibió texto en la petición' });
  }

  try {
    const [tasksRes, contextsRes, projectsRes] = await Promise.all([
      supabaseAdmin
        .from('tasks')
        .select('id, title, description, status, context_id, project_id')
        .eq('user_id', userId)
        .neq('status', 'Completado')
        .order('created_at', { ascending: false })
        .limit(60),
      supabaseAdmin.from('contexts').select('id, name').eq('user_id', userId),
      supabaseAdmin.from('projects').select('id, name').eq('user_id', userId).eq('active', true)
    ]);

    const currentTasks = tasksRes.data || [];
    const contexts = contextsRes.data || [];
    const projects = projectsRes.data || [];

    const systemInstruction = `
Eres el motor de decisiones de un sistema GTD personal.
Recibirás una orden por voz del usuario y el estado actual de sus tareas, contextos y proyectos.

DATOS ACTUALES DEL USUARIO:
- Contextos disponibles: ${JSON.stringify(contexts)}
- Proyectos activos: ${JSON.stringify(projects)}
- Tareas actuales (no completadas): ${JSON.stringify(currentTasks)}

REGLAS DE DECISIÓN:
1. Si el usuario pide crear, anotar, recordar o añadir algo nuevo -> action = "CREATE".
   - 'title': Título claro y accionable.
   - 'description': Detalles o resumen de la nota de voz (obligatorio, nunca vacío).
   - 'status': Por defecto "Inbox", salvo que mencione otro estado válido (${VALID_STATUSES.join(', ')}).
   - 'context_name': Nombre del contexto. Prioriza "Trabajo" o "Casa" si encaja, o usa otro existente/nuevo si lo pide.
   - 'project_name': Nombre del proyecto si hace referencia a alguno existente o pide asignarlo.

2. Si el usuario pide completar, terminar, mover de estado, cambiar de contexto/proyecto o modificar una tarea existente -> action = "UPDATE".
   - Busca en 'Tareas actuales' la tarea que mejor coincida semánticamente y pon su UUID exacto en 'task_id'.
   - Rellena solo los campos que el usuario quiera cambiar ('status', 'title', 'description', 'context_name', 'project_name').
`;

    const geminiResponse = await fetch(
      `[https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$){process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: rawPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                action: { type: 'STRING', enum: ['CREATE', 'UPDATE'] },
                task_id: { type: 'STRING', nullable: true },
                title: { type: 'STRING', nullable: true },
                description: { type: 'STRING', nullable: true },
                status: { type: 'STRING', enum: VALID_STATUSES, nullable: true },
                context_name: { type: 'STRING', nullable: true },
                project_name: { type: 'STRING', nullable: true },
                summary_message: {
                  type: 'STRING',
                  description: 'Frase corta confirmando la acción para mostrar en notificación móvil'
                }
              },
              required: ['action', 'summary_message']
            }
          }
        })
      }
    );

    const geminiJson = await geminiResponse.json();
    if (!geminiResponse.ok) {
      throw new Error(geminiJson.error?.message || 'Error al invocar Gemini API');
    }

    const decision = JSON.parse(geminiJson.candidates[0].content.parts[0].text);

    const resolveContextId = async (ctxName) => {
      const target = ctxName || 'Trabajo';
      const existing = contexts.find(c => c.name.toLowerCase() === target.toLowerCase());
      if (existing) return existing.id;

      const { data: created } = await supabaseAdmin
        .from('contexts')
        .insert({ user_id: userId, name: target })
        .select('id')
        .single();
      return created.id;
    };

    const resolveProjectId = async (prjName) => {
      if (!prjName) return undefined;
      const existing = projects.find(p => p.name.toLowerCase() === prjName.toLowerCase());
      if (existing) return existing.id;

      const { data: created } = await supabaseAdmin
        .from('projects')
        .insert({ user_id: userId, name: prjName })
        .select('id')
        .single();
      return created.id;
    };

    if (decision.action === 'CREATE') {
      const context_id = await resolveContextId(decision.context_name);
      const project_id = (await resolveProjectId(decision.project_name)) || null;

      const { data: newTask, error } = await supabaseAdmin
        .from('tasks')
        .insert({
          user_id: userId,
          title: decision.title || rawPrompt,
          description: decision.description || rawPrompt,
          status: decision.status || 'Inbox',
          context_id,
          project_id
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({
        action: 'CREATE',
        message: decision.summary_message,
        task: newTask
      });
    }

    if (decision.action === 'UPDATE') {
      if (!decision.task_id) {
        return res.status(404).json({
          action: 'NONE',
          message: 'No encontré ninguna tarea activa que coincida con tu descripción.'
        });
      }

      const updates = {};
      if (decision.title) updates.title = decision.title;
      if (decision.description) updates.description = decision.description;
      if (decision.status) updates.status = decision.status;
      if (decision.context_name) {
        updates.context_id = await resolveContextId(decision.context_name);
      }
      if (decision.project_name) {
        updates.project_id = await resolveProjectId(decision.project_name);
      }

      const { data: updatedTask, error } = await supabaseAdmin
        .from('tasks')
        .update(updates)
        .eq('id', decision.task_id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({
        action: 'UPDATE',
        message: decision.summary_message,
        task: updatedTask
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
```

---

### PASO 5: ARCHIVOS PWA Y FRONTEND (`index.html`, `public/`, `src/`)

#### 5.1 Archivo `public/manifest.json`
```json
{
  "name": "GTD Workspace & Kanban",
  "short_name": "GTD Flow",
  "description": "Gestor GTD con tablero Kanban e integración por voz con Gemini AI",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#020617",
  "theme_color": "#4f46e5",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

#### 5.2 Archivo `public/sw.js`
```javascript
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
```

#### 5.3 Archivo `index.html`
```html
<!doctype html>
<html lang="es" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#020617" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="manifest" href="/manifest.json" />
    <title>GTD Workspace</title>
  </head>
  <body class="bg-slate-100 dark:bg-slate-950">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
      }
    </script>
  </body>
</html>
```

#### 5.4 Archivo `src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### 5.5 Archivo `src/main.jsx`
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>
);
```

#### 5.6 Archivo `src/lib/supabase.js`
```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '[https://placeholder.supabase.co](https://placeholder.supabase.co)',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'
);
```

#### 5.7 Archivo `src/components/VoiceCommandFAB.jsx`
```jsx
import React, { useState, useRef } from 'react';
import { Mic, MicOff, Send, Sparkles, Loader2, CheckCircle2, AlertCircle, Keyboard, X } from 'lucide-react';

export default function VoiceCommandFAB({ apiKey, onActionSuccess }) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInputBox, setShowInputBox] = useState(false);
  const [manualText, setManualText] = useState('');
  const [feedback, setFeedback] = useState(null);
  const recognitionRef = useRef(null);

  const showToast = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  const sendToGeminiVoice = async (textCommand) => {
    if (!textCommand?.trim() || !apiKey) return;
    setIsProcessing(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/gemini-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ text: textCommand.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error procesando el comando con Gemini');
      }

      showToast('success', data.message || 'Comando ejecutado correctamente');
      setManualText('');
      setShowInputBox(false);

      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setShowInputBox(true);
      showToast('error', 'Usa el dictado de tu teclado en el cuadro de texto.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setFeedback(null);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      sendToGeminiVoice(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      showToast('error', 'No se pudo capturar el audio. Prueba de nuevo.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    sendToGeminiVoice(manualText);
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {feedback && (
        <div
          className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-medium max-w-xs sm:max-w-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/95 border-rose-700 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0"/>
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0"/>
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {showInputBox && (
        <form
          onSubmit={handleManualSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-2xl w-80 sm:w-96 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1.5 font-medium text-indigo-400">
              <Sparkles className="w-3.5 h-3.5"/> Comando natural para Gemini
            </span>
            <button
              type="button"
              onClick={() => setShowInputBox(false)}
              className="hover:text-slate-200"
            >
              <X className="w-4 h-4"/>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Ej: Pasa a In Progress la tarea de..."
              className="flex-1 bg-slate-100 dark:bg-slate-800 text-sm px-3 py-2 rounded-xl outline-none focus:ring-2 ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isProcessing || !manualText.trim()}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowInputBox(!showInputBox)}
          className="p-3 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-lg hover:border-indigo-500 transition"
          title="Escribir o dictar con teclado"
        >
          <Keyboard className="w-5 h-5"/>
        </button>

        <button
          onClick={toggleListening}
          disabled={isProcessing}
          className={`flex items-center gap-2 px-5 py-3.5 rounded-full font-medium text-sm text-white shadow-xl transition-all ${
            isListening
              ? 'bg-rose-600 hover:bg-rose-500 animate-pulse ring-4 ring-rose-500/30'
              : isProcessing
              ? 'bg-indigo-800 cursor-wait'
              : 'bg-indigo-600 hover:bg-indigo-500'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin"/>
              <span>Procesando...</span>
            </>
          ) : isListening ? (
            <>
              <MicOff className="w-5 h-5"/>
              <span>Escuchando...</span>
            </>
          ) : (
            <>
              <Mic className="w-5 h-5"/>
              <span>Dictar a Gemini</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

#### 5.8 Archivo `src/App.jsx`
```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import VoiceCommandFAB from './components/VoiceCommandFAB';
import {
  Inbox, Kanban, CheckCircle2, Plus, Search, Filter, ArrowUpDown,
  Moon, Sun, LogOut, Key, FolderPlus, Tag, Calendar, Trash2, Edit3, Check, X
} from 'lucide-react';

const ALL_STATUSES = [
  'Inbox', 'Next Action', 'Action', 'In Progress', 'Someday', 'Waiting', 'Completado'
];

const KANBAN_COLUMNS = [
  { id: 'Next Action', label: 'Next Action', color: 'border-amber-500' },
  { id: 'Action', label: 'Action', color: 'border-blue-500' },
  { id: 'In Progress', label: 'In Progress', color: 'border-purple-500' },
  { id: 'Waiting', label: 'Waiting', color: 'border-orange-500' },
  { id: 'Someday', label: 'Someday', color: 'border-slate-400' }
];

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem('theme') ? localStorage.getItem('theme') === 'dark' : true
  );

  const [tasks, setTasks] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [apiKey, setApiKey] = useState('');

  const [activeView, setActiveView] = useState('kanban');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterContext, setFilterContext] = useState('ALL');
  const [filterProject, setFilterProject] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at_desc');

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    status: 'Inbox',
    context_id: '',
    project_id: ''
  });

  const [newContextName, setNewContextName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchAllData();
    }
  }, [session]);

  const fetchAllData = async () => {
    setLoading(true);
    const userId = session.user.id;

    let [ctxRes, prjRes, tskRes, keyRes] = await Promise.all([
      supabase.from('contexts').select('*').order('name'),
      supabase.from('projects').select('*').order('name'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('user_api_keys').select('api_key').eq('user_id', userId).single()
    ]);

    if (!ctxRes.data || ctxRes.data.length === 0) {
      const { data: insertedCtx } = await supabase
        .from('contexts')
        .insert([
          { user_id: userId, name: 'Trabajo' },
          { user_id: userId, name: 'Casa' }
        ])
        .select();
      ctxRes.data = insertedCtx || [];
    }

    setContexts(ctxRes.data || []);
    setProjects(prjRes.data || []);
    setTasks(tskRes.data || []);
    if (keyRes.data) setApiKey(keyRes.data.api_key);
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const openTaskModal = (task = null, defaultStatus = null) => {
    const defaultCtx = contexts.find(c => c.name.toLowerCase() === 'trabajo') || contexts[0];
    if (task) {
      setEditingTask(task);
      setTaskForm({
        title: task.title,
        description: task.description,
        status: task.status,
        context_id: task.context_id,
        project_id: task.project_id || ''
      });
    } else {
      setEditingTask(null);
      setTaskForm({
        title: '',
        description: '',
        status: defaultStatus || (activeView === 'inbox' ? 'Inbox' : 'Next Action'),
        context_id: defaultCtx?.id || '',
        project_id: ''
      });
    }
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !taskForm.context_id) return;

    const payload = {
      user_id: session.user.id,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      status: taskForm.status,
      context_id: taskForm.context_id,
      project_id: taskForm.project_id || null
    };

    if (editingTask) {
      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', editingTask.id)
        .select()
        .single();
      if (!error && data) {
        setTasks(prev => prev.map(t => (t.id === data.id ? data : t)));
      }
    } else {
      const { data, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        setTasks(prev => [data, ...prev]);
      }
    }
    setIsTaskModalOpen(false);
  };

  const handleStatusChange = async (taskId, newStatus) => {
    const previousTasks = [...tasks];
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              completed_at: newStatus === 'Completado' ? new Date().toISOString() : null
            }
          : t
      )
    );

    const { data, error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      setTasks(previousTasks);
    } else {
      setTasks(prev => prev.map(t => (t.id === data.id ? data : t)));
    }
  };

  const handleDeleteTask = async (taskId) => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  };

  const handleAddContext = async (e) => {
    e.preventDefault();
    if (!newContextName.trim()) return;
    const { data, error } = await supabase
      .from('contexts')
      .insert({ user_id: session.user.id, name: newContextName.trim() })
      .select()
      .single();
    if (!error && data) {
      setContexts(prev => [...prev, data]);
      setNewContextName('');
    }
  };

  const handleAddProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: session.user.id, name: newProjectName.trim() })
      .select()
      .single();
    if (!error && data) {
      setProjects(prev => [...prev, data]);
      setNewProjectName('');
    }
  };

  const contextMap = useMemo(() => Object.fromEntries(contexts.map(c => [c.id, c.name])), [contexts]);
  const projectMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);

  const filteredAndSortedTasks = useMemo(() => {
    return tasks
      .filter(task => {
        const matchesSearch =
          task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || task.status === filterStatus;
        const matchesContext = filterContext === 'ALL' || task.context_id === filterContext;
        const matchesProject =
          filterProject === 'ALL'
            ? true
            : filterProject === 'NONE'
            ? !task.project_id
            : task.project_id === filterProject;

        return matchesSearch && matchesStatus && matchesContext && matchesProject;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'created_at_desc':
            return new Date(b.created_at) - new Date(a.created_at);
          case 'created_at_asc':
            return new Date(a.created_at) - new Date(b.created_at);
          case 'name_asc':
            return a.title.localeCompare(b.title);
          case 'name_desc':
            return b.title.localeCompare(a.title);
          case 'status':
            return a.status.localeCompare(b.status);
          case 'context':
            return (contextMap[a.context_id] || '').localeCompare(contextMap[b.context_id] || '');
          case 'project':
            return (projectMap[a.project_id] || 'zzz').localeCompare(projectMap[b.project_id] || 'zzz');
          default:
            return 0;
        }
      });
  }, [tasks, searchQuery, filterStatus, filterContext, filterProject, sortBy, contextMap, projectMap]);

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDrop = (e, targetStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      handleStatusChange(taskId, targetStatus);
    }
  };

  const inboxCount = tasks.filter(t => t.status === 'Inbox').length;
  const completedCount = tasks.filter(t => t.status === 'Completado').length;

  if (!session && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
            GTD
          </div>
          <h1 className="text-2xl font-bold mb-2">Flujo GTD & Kanban</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Organiza tus tareas por contextos y proyectos con integración directa para Gemini AI.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
          >
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm">
              GTD
            </span>
            <span>Workspace</span>
          </div>

          <nav className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveView('inbox')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                activeView === 'inbox'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Inbox className="w-4 h-4"/>
              <span>Inbox</span>
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300">
                {inboxCount}
              </span>
            </button>

            <button
              onClick={() => setActiveView('kanban')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                activeView === 'kanban'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-4 h-4"/>
              <span>Tablero Activo</span>
            </button>

            <button
              onClick={() => setActiveView('completed')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                activeView === 'completed'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4"/>
              <span>Completado</span>
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300">
                {completedCount}
              </span>
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => openTaskModal()}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-sm font-medium transition shadow-sm"
          >
            <Plus className="w-4 h-4"/>
            <span>Nueva Tarea</span>
          </button>

          <button
            onClick={() => setIsMetaModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-xl text-sm font-medium transition"
            title="Gestionar Proyectos y Contextos"
          >
            <FolderPlus className="w-4 h-4"/>
            <span className="hidden sm:inline">Proyectos / Contextos</span>
          </button>

          <button
            onClick={() => setShowApiModal(true)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="API Key para Gemini"
          >
            <Key className="w-4 h-4 text-amber-500"/>
          </button>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="Cambiar tema"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400"/> : <Moon className="w-4 h-4"/>}
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-slate-600 dark:text-slate-400 hover:text-rose-600 transition"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4"/>
          </button>
        </div>
      </header>

      <section className="bg-white/70 dark:bg-slate-900/70 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            type="text"
            placeholder="Filtrar por nombre o descripción..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-indigo-500 rounded-lg outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Tag className="w-3.5 h-3.5 text-slate-400"/>
          <select
            value={filterContext}
            onChange={e => setFilterContext(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-sm outline-none"
          >
            <option value="ALL">Todos los contextos</option>
            {contexts.map(c => (
              <option key={c.id} value={c.id}>@{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400"/>
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-sm outline-none"
          >
            <option value="ALL">Todos los proyectos</option>
            <option value="NONE">Sin proyecto asignado</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {activeView === 'kanban' && (
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-sm outline-none"
          >
            <option value="ALL">Todos los estados activos</option>
            {KANBAN_COLUMNS.map(col => (
              <option key={col.id} value={col.id}>{col.label}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1.5 text-xs ml-auto">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400"/>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-sm outline-none"
          >
            <option value="created_at_desc">Fecha creación (Recientes)</option>
            <option value="created_at_asc">Fecha creación (Antiguas)</option>
            <option value="name_asc">Nombre (A - Z)</option>
            <option value="name_desc">Nombre (Z - A)</option>
            <option value="context">Contexto</option>
            <option value="project">Proyecto</option>
            <option value="status">Estado</option>
          </select>
        </div>
      </section>

      <main className="flex-1 p-6 overflow-x-auto pb-24">
        {activeView === 'inbox' && (
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Bandeja de Entrada (Inbox)</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Clarifica tus capturas y muévelas libremente a cualquier estado de tu flujo.
                </p>
              </div>
              <button
                onClick={() => openTaskModal(null, 'Inbox')}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500"
              >
                + Captura rápida
              </button>
            </div>

            {filteredAndSortedTasks.filter(t => t.status === 'Inbox').length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                Inbox Zero. No tienes tareas pendientes de procesar.
              </div>
            ) : (
              filteredAndSortedTasks
                .filter(t => t.status === 'Inbox')
                .map(task => (
                  <TaskRowCard contextName="{contextMap[task.context_id]}" key="{task.id}" onEdit="{()" onStatusChange="{handleStatusChange}" projectName="{projectMap[task.project_id]}" task="{task}"> openTaskModal(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))
            )}
          </div>
        )}

        {activeView === 'kanban' && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 min-w-[980px]">
            {KANBAN_COLUMNS.filter(col => filterStatus === 'ALL' || col.id === filterStatus).map(col => {
              const colTasks = filteredAndSortedTasks.filter(t => t.status === col.id);
              return (
                <div
                  key={col.id}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleDrop(e, col.id)}
                  className="bg-slate-200/60 dark:bg-slate-900/60 rounded-2xl p-3 flex flex-col min-h-[70vh] border border-slate-200/80 dark:border-slate-800/80"
                >
                  <div className={`flex items-center justify-between pb-2.5 mb-3 border-b-2 ${col.color}`}>
                    <span className="font-semibold text-sm">{col.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-medium">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="space-y-2.5 flex-1">
                    {colTasks.map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => handleDragStart(e, task.id)}
                        className="bg-white dark:bg-slate-900 p-3.5 rounded-xl shadow-sm border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/60 transition cursor-grab active:cursor-grabbing flex flex-col justify-between gap-2.5"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-medium text-sm leading-snug">{task.title}</h3>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => openTaskModal(task)}
                                className="p-1 text-slate-400 hover:text-indigo-500 rounded"
                              >
                                <Edit3 className="w-3.5 h-3.5"/>
                              </button>
                              <button
                                onClick={() => handleStatusChange(task.id, 'Completado')}
                                className="p-1 text-slate-400 hover:text-emerald-500 rounded"
                                title="Marcar como Completado"
                              >
                                <Check className="w-3.5 h-3.5"/>
                              </button>
                            </div>
                          </div>

                          {task.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-medium">
                              @{contextMap[task.context_id] || 'General'}
                            </span>
                            {task.project_id && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 font-medium truncate max-w-[130px]">
                                📁 {projectMap[task.project_id]}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>{new Date(task.created_at).toLocaleDateString()}</span>
                            <select
                              value={task.status}
                              onChange={e => handleStatusChange(task.id, e.target.value)}
                              className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none"
                            >
                              {ALL_STATUSES.map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeView === 'completed' && (
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Archivo de Tareas Completadas</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Registro automático de fechas de creación y finalización. Puedes reabrir cualquier tarea cambiando su estado.
              </p>
            </div>

            {filteredAndSortedTasks.filter(t => t.status === 'Completado').length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                No hay tareas completadas que coincidan con los filtros.
              </div>
            ) : (
              filteredAndSortedTasks
                .filter(t => t.status === 'Completado')
                .map(task => (
                  <TaskRowCard contextName="{contextMap[task.context_id]}" key="{task.id}" onEdit="{()" onStatusChange="{handleStatusChange}" projectName="{projectMap[task.project_id]}" task="{task}"> openTaskModal(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))
            )}
          </div>
        )}
      </main>

      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">
                {editingTask ? 'Editar Tarea' : 'Nueva Tarea GTD'}
              </h3>
              <button onClick={() => setIsTaskModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Título *</label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 ring-indigo-500"
                  placeholder="Ej: Revisar informe de planificación"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Descripción *</label>
                <textarea
                  rows="3"
                  required
                  value={taskForm.description}
                  onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 ring-indigo-500"
                  placeholder="Detalles, pasos siguientes o notas de contexto..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Estado *</label>
                  <select
                    value={taskForm.status}
                    onChange={e => setTaskForm({ ...taskForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                  >
                    {ALL_STATUSES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Contexto *</label>
                  <select
                    required
                    value={taskForm.context_id}
                    onChange={e => setTaskForm({ ...taskForm, context_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                  >
                    {contexts.map(c => (
                      <option key={c.id} value={c.id}>@{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Proyecto</label>
                  <select
                    value={taskForm.project_id}
                    onChange={e => setTaskForm({ ...taskForm, project_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                  >
                    <option value="">Ninguno</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm bg-slate-100 dark:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMetaModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Contextos y Proyectos</h3>
              <button onClick={() => setIsMetaModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Contextos Dinámicos (Por defecto: Trabajo y Casa)
              </h4>
              <form onSubmit={handleAddContext} className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newContextName}
                  onChange={e => setNewContextName(e.target.value)}
                  placeholder="Nuevo contexto (ej. Hospital, Ordenador, Recados)..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                />
                <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-sm">
                  Añadir
                </button>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {contexts.map(c => (
                  <span key={c.id} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                    @{c.name}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Proyectos Activos
              </h4>
              <form onSubmit={handleAddProject} className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="Nombre del nuevo proyecto..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none"
                />
                <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-sm">
                  Añadir
                </button>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {projects.map(p => (
                  <span key={p.id} className="px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-400 text-xs">
                    📁 {p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showApiModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Integración Externa con Gemini AI</h3>
              <button onClick={() => setShowApiModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Utiliza esta clave en el header <code className="text-indigo-400">x-api-key</code> para que Gemini consulte, cree o mueva tareas hacia <code className="text-indigo-400">/api/gemini-tasks</code> o <code className="text-indigo-400">/api/gemini-voice</code>.
            </p>
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs break-all select-all">
              {apiKey || 'Generando clave...'}
            </div>
          </div>
        </div>
      )}

      <VoiceCommandFAB apiKey="{apiKey}" onActionSuccess="{fetchAllData}"/>
    </div>
  );
}

function TaskRowCard({ task, contextName, projectName, onStatusChange, onEdit, onDelete }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-500/50 transition">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`font-medium text-sm ${task.status === 'Completado' ? 'line-through text-slate-400' : ''}`}>
            {task.title}
          </h3>
          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 text-xs font-medium">
            @{contextName}
          </span>
          {projectName && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 text-xs font-medium">
              📁 {projectName}
            </span>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{task.description}</p>
        )}
        <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3"/> Creada: {new Date(task.created_at).toLocaleString()}
          </span>
          {task.completed_at && (
            <span className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="w-3 h-3"/> Finalizada: {new Date(task.completed_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <select
          value={task.status}
          onChange={e => onStatusChange(task.id, e.target.value)}
          className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg text-xs font-medium outline-none"
        >
          {ALL_STATUSES.map(st => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
        <button onClick={onEdit} className="p-2 text-slate-400 hover:text-indigo-500 rounded-lg">
          <Edit3 className="w-4 h-4"/>
        </button>
        <button onClick={onDelete} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg">
          <Trash2 className="w-4 h-4"/>
        </button>
      </div>
    </div>
  );
}
```

---

### PASO 6: SERVIDOR MCP PARA GEMINI CLI / ANTIGRAVITY (`mcp-server/`)

#### 6.1 Archivo `mcp-server/package.json`
```json
{
  "name": "gtd-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.1",
    "zod": "^3.23.8"
  }
}
```

#### 6.2 Archivo `mcp-server/gtd-mcp-server.mjs`
```javascript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.GTD_API_URL;
const API_KEY = process.env.GTD_API_KEY;

if (!API_URL || !API_KEY) {
  console.error("Error: Faltan las variables de entorno GTD_API_URL o GTD_API_KEY");
  process.exit(1);
}

const VALID_STATUSES = [
  "Inbox", "Next Action", "Action", "In Progress", "Someday", "Waiting", "Completado"
];

async function callGtdApi(method, params = {}, body = null) {
  const url = new URL(API_URL);
  if (method === "GET" && params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.append(k, v);
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Error HTTP ${response.status}`);
  }
  return data;
}

const server = new McpServer({
  name: "gtd-supabase-connector",
  version: "1.0.0"
});

server.tool(
  "listar_tareas_gtd",
  "Obtiene la lista de tareas del sistema GTD del usuario, además de los contextos y proyectos disponibles.",
  {
    status: z.enum(VALID_STATUSES).optional().describe("Filtrar por estado GTD específico"),
    context_id: z.string().uuid().optional().describe("Filtrar por UUID de contexto"),
    project_id: z.string().uuid().optional().describe("Filtrar por UUID de proyecto")
  },
  async ({ status, context_id, project_id }) => {
    const data = await callGtdApi("GET", { status, context_id, project_id });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  }
);

server.tool(
  "crear_tarea_gtd",
  "Crea una nueva tarea en el flujo GTD. Si no se indica contexto, usa 'Trabajo' por defecto o crea uno nuevo si se pasa context_name.",
  {
    title: z.string().min(1).describe("Título claro y accionable de la tarea"),
    description: z.string().describe("Descripción obligatoria, detalles o siguientes pasos"),
    status: z.enum(VALID_STATUSES).default("Inbox").describe("Estado inicial de la tarea"),
    context_name: z.string().optional().describe("Nombre del contexto (ej. 'Trabajo', 'Casa'). Se crea si no existe."),
    context_id: z.string().uuid().optional().describe("UUID del contexto si ya se conoce"),
    project_id: z.string().uuid().nullable().optional().describe("UUID del proyecto asociado (opcional)")
  },
  async (payload) => {
    const data = await callGtdApi("POST", {}, payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  }
);

server.tool(
  "actualizar_tarea_gtd",
  "Modifica el título, descripción, contexto, proyecto o cambia libremente el estado de una tarea existente.",
  {
    id: z.string().uuid().describe("UUID de la tarea a modificar"),
    title: z.string().optional().describe("Nuevo título"),
    description: z.string().optional().describe("Nueva descripción"),
    status: z.enum(VALID_STATUSES).optional().describe("Nuevo estado (transición libre permitida)"),
    context_id: z.string().uuid().optional().describe("Nuevo UUID de contexto"),
    project_id: z.string().uuid().nullable().optional().describe("Nuevo UUID de proyecto (o null para desasignar)")
  },
  async (payload) => {
    const data = await callGtdApi("PATCH", {}, payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

### PASO 7: GENERADOR DE ICONOS PNG PARA LA PWA (`scripts/generate-icons.mjs`)

Crea y ejecuta este script en Node puro (usa `zlib` nativo sin dependencias externas) para generar los iconos `public/icon-192.png` y `public/icon-512.png` en color índigo (`#4f46e5`):

```javascript
import fs from 'fs';
import zlib from 'zlib';

function createSolidPng(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
    }
    return (c ^ -1) >>> 0;
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    rawData[rowStart] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }

  const idat = zlib.deflateSync(rawData);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

fs.writeFileSync('public/icon-192.png', createSolidPng(192, 192, 79, 70, 229));
fs.writeFileSync('public/icon-512.png', createSolidPng(512, 512, 79, 70, 229));
console.log('Iconos PWA generados en public/icon-192.png y public/icon-512.png');
```

---

### PASO 8: INSTALACIÓN, COMPILACIÓN Y RESUMEN FINAL

Ejecuta secuencialmente en la terminal:
1. `node scripts/generate-icons.mjs`
2. `chmod +x mcp-server/gtd-mcp-server.mjs`
3. `npm install`
4. `cd mcp-server && npm install && cd ..`
5. `npm run build`

Si `npm run build` devuelve algún error, corrígelo inmediatamente hasta que el build de Vite termine con éxito (`dist/` generado).

Al finalizar, muéstrame por pantalla un resumen de verificación con:
1. La confirmación de que todos los archivos y el `dist/` se han compilado sin errores.
2. El bloque JSON exacto con la ruta absoluta real (`pwd` + `/mcp-server/gtd-mcp-server.mjs`) listo para pegar en mi `~/.gemini/settings.json`.
3. Los 3 pasos manuales finales que debo hacer: pegar `supabase/schema.sql` en el SQL Editor de Supabase, rellenar `.env` y desplegar en Vercel.