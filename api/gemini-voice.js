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
  const modelName = (typeof req.body === 'object' && req.body?.model?.trim()) || 'gemini-3.8-flash';

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
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
