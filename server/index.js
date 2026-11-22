import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data", "projects");
const app = express();
app.use(express.json({ limit: "2mb" }));

const safeId = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 48) || "project";
const projectDir = (id) => {
  const target = path.resolve(DATA, safeId(id));
  if (!target.startsWith(DATA + path.sep)) throw new Error("Ruta de proyecto inválida");
  return target;
};
const filePath = (id, relative) => {
  const base = projectDir(id);
  const rel = String(relative || "").replace(/\\/g, "/");
  const target = path.resolve(base, rel);
  if (!rel || (!target.startsWith(base + path.sep) && target !== base)) throw new Error("Ruta de archivo inválida");
  if (rel.split("/").some((part) => !part || part === ".." || part.startsWith("."))) throw new Error("Ruta de archivo no permitida");
  return target;
};
async function ensureProject(id, name) {
  const dir = projectDir(id);
  await fs.mkdir(dir, { recursive: true });
  const marker = path.join(dir, "index.html");
  try { await fs.access(marker); }
  catch {
    await fs.writeFile(marker, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mi aplicación</title></head><body style="font-family:system-ui;padding:40px"><h1>¡Hola!</h1><p>Tu proyecto empieza aquí.</p></body></html>');
    await fs.writeFile(path.join(dir, "README.md"), "# " + (name || "Mi proyecto") + "\n\nCreado con AI Studio.\n");
  }
  return dir;
}
async function walk(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (entry.isDirectory()) out.push({ path: rel, type: "folder", children: await walk(full, base) });
    else out.push({ path: rel, type: "file" });
  }
  return out;
}
async function allFiles(id) {
  const dir = projectDir(id);
  await fs.mkdir(dir, { recursive: true });
  const tree = await walk(dir);
  const flat = [];
  const visit = (nodes) => nodes.forEach((n) => n.type === "file" ? flat.push(n.path) : visit(n.children || []));
  visit(tree);
  return flat;
}
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "ai-studio", model: process.env.OPENAI_MODEL || "gpt-5.4", apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY) }));
app.get("/api/projects", async (_req, res) => {
  try {
    await fs.mkdir(DATA, { recursive: true });
    const dirs = (await fs.readdir(DATA, { withFileTypes: true })).filter((d) => d.isDirectory());
    res.json({ projects: await Promise.all(dirs.map(async (d) => ({ id: d.name, name: d.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), files: (await allFiles(d.name)).length }))) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/projects", async (req, res) => {
  try {
    const name = String(req.body?.name || "Nuevo proyecto").trim().slice(0, 80);
    const id = safeId(name) + "-" + Date.now().toString(36).slice(-5);
    await ensureProject(id, name);
    res.json({ project: { id, name } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/projects/:id/files", async (req, res) => {
  try {
    const dir = await ensureProject(req.params.id);
    res.json({ tree: await walk(dir), files: await allFiles(req.params.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/projects/:id/file", async (req, res) => {
  try {
    const target = filePath(req.params.id, req.query.path);
    const content = await fs.readFile(target, "utf8");
    res.json({ path: req.query.path, content });
  } catch (e) { res.status(404).json({ error: e.message }); }
});
app.put("/api/projects/:id/file", async (req, res) => {
  try {
    const relative = String(req.body?.path || "");
    if (!relative || relative.length > 240) return res.status(400).json({ error: "Nombre de archivo inválido" });
    const target = filePath(req.params.id, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(req.body?.content ?? ""), "utf8");
    res.json({ ok: true, path: relative });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/projects/:id/file", async (req, res) => {
  try {
    const relative = String(req.body?.path || "");
    if (!relative || relative.length > 240) return res.status(400).json({ error: "Nombre de archivo inválido" });
    const target = filePath(req.params.id, relative);
    try { await fs.access(target); return res.status(409).json({ error: "El archivo ya existe" }); } catch {}
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(req.body?.content ?? ""), "utf8");
    res.json({ ok: true, path: relative });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/projects/:id/file", async (req, res) => {
  try {
    const target = filePath(req.params.id, req.body?.path);
    await fs.rm(target, { force: true });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

const toolDefinitions = [
  { type: "function", name: "list_project_files", description: "List all files in the current project.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
  { type: "function", name: "read_project_file", description: "Read a text file from the current project.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }, strict: true },
  { type: "function", name: "write_project_file", description: "Create or replace a text file in the current project. Use this to implement requested code changes.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false }, strict: true }
];
async function runTool(id, name, args) {
  if (name === "list_project_files") return JSON.stringify(await allFiles(id));
  if (name === "read_project_file") return await fs.readFile(filePath(id, args.path), "utf8");
  if (name === "write_project_file") {
    const target = filePath(id, args.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, args.content, "utf8");
    return JSON.stringify({ ok: true, path: args.path });
  }
  return JSON.stringify({ error: "Herramienta desconocida" });
}
app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Falta configurar OPENAI_API_KEY en el archivo .env del servidor." });
  const { projectId, message, history = [] } = req.body || {};
  if (!projectId || !String(message || "").trim()) return res.status(400).json({ error: "Falta el proyecto o el mensaje." });
  try {
    const instructions = "Sos el asistente de programación integrado en AI Studio. Ayudás a construir aplicaciones web dentro del proyecto activo. Antes de modificar, inspeccioná los archivos relevantes. Usá las herramientas para leer, listar y escribir archivos. Cuando el usuario pide construir o cambiar algo, hacé los cambios directamente, no te limites a dar instrucciones. Conservá el trabajo existente y explicá brevemente qué archivos cambiaste. No afirmes haber ejecutado pruebas si no las ejecutaste. Nunca solicites ni escribas secretos en archivos del proyecto.";
    let input = [...history.slice(-10), { role: "user", content: String(message).slice(0, 12000) }];
    let previousResponseId;
    let response;
    for (let turn = 0; turn < 6; turn++) {
      const payload = { model: process.env.OPENAI_MODEL || "gpt-5.4", instructions, input, tools: toolDefinitions, tool_choice: "auto", max_output_tokens: 5000 };
      if (previousResponseId) payload.previous_response_id = previousResponseId;
      const upstream = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await upstream.json();
      if (!upstream.ok) throw new Error(data.error?.message || "Error al consultar OpenAI");
      response = data;
      const calls = (data.output || []).filter((item) => item.type === "function_call");
      if (!calls.length) break;
      const outputs = [];
      for (const call of calls) {
        let result;
        try { result = await runTool(projectId, call.name, JSON.parse(call.arguments || "{}")); }
        catch (e) { result = JSON.stringify({ error: e.message }); }
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: String(result).slice(0, 30000) });
      }
      input = outputs;
      previousResponseId = data.id;
    }
    const answer = (response?.output || []).filter((item) => item.type === "message").flatMap((item) => item.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n");
    res.json({ answer: answer || "Terminé de procesar la solicitud.", files: await allFiles(projectId) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const dist = path.join(ROOT, "dist");
app.use(express.static(dist));
app.get("/{*splat}", async (_req, res, next) => {
  try { await fs.access(path.join(dist, "index.html")); res.sendFile(path.join(dist, "index.html")); }
  catch { next(); }
});
const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log("AI Studio API running on http://localhost:" + port));
