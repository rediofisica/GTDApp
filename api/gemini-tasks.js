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
