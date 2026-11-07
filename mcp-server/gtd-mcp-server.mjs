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
