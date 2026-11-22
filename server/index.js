import "dotenv/config";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data", "projects"));
const IS_AI_STUDIO = process.env.AI_STUDIO_RUNTIME === "1";
const IS_PRODUCTION = IS_AI_STUDIO || process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
const app = express();
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BINARY_FILE_BYTES = 7 * 1024 * 1024;
const runningProjects = new Map();
const projectPorts = new Map();
let nextPort = 5180;
async function terminateProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      killer.once("error", () => { try { child.kill(); } catch {} resolve(); });
      killer.once("close", resolve);
    });
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
  const forceTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 1800);
  forceTimer.unref?.();
}
async function freePort() {
  while (nextPort < 6200) {
    const port = nextPort++;
    const available = await new Promise((resolve) => { const server = net.createServer(); server.once("error", () => resolve(false)); server.listen(port, "127.0.0.1", () => server.close(() => resolve(true))); });
    if (available) return port;
  }
  throw new Error("No hay puertos disponibles para la vista previa");
}
async function startProject(id) {
  const dir = await ensureProject(id);
  const pkgPath = path.join(dir, "package.json");
  try { await fs.access(pkgPath); } catch { throw new Error("Este proyecto no tiene package.json. Pedile al asistente que lo prepare como aplicación web."); }
  const modulesPath = path.join(dir, "node_modules");
  try { await fs.access(modulesPath); } catch {
    await new Promise((resolve, reject) => {
      const install = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], { cwd: dir, shell: process.platform === "win32", windowsHide: true, detached: process.platform !== "win32" });
      let output = "";
      const timer = setTimeout(() => { terminateProcessTree(install); reject(new Error("npm install superó el límite de 180 segundos.")); }, 180000);
      install.stdout.on("data", (d) => { output += d; if (output.length > 12000) output = output.slice(-12000); });
      install.stderr.on("data", (d) => { output += d; if (output.length > 12000) output = output.slice(-12000); });
      install.on("error", (error) => { clearTimeout(timer); reject(error); });
      install.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("Falló npm install: " + output.slice(-2500))); });
    });
  }
  const existing = runningProjects.get(id);
  if (existing && existing.process.exitCode === null) return { port: existing.port, url: IS_PRODUCTION ? `/api/projects/${id}/preview/` : `http://localhost:${existing.port}`, running: Boolean(existing.ready), starting: !existing.ready, logs: existing.logs.join("").slice(-5000) };
  const port = projectPorts.get(id) || await freePort();
  projectPorts.set(id, port);
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--cors", ...(IS_PRODUCTION ? ["--base", `/api/projects/${id}/preview/`] : [])], { cwd: dir, shell: process.platform === "win32", windowsHide: true, detached: process.platform !== "win32", env: { ...safeProjectEnv(), BROWSER: "none" } });
  const state = { process: child, port, logs: [], startedAt: Date.now(), ready: false };
  runningProjects.set(id, state);
  const collect = (chunk) => { state.logs.push(String(chunk)); if (state.logs.length > 100) state.logs.shift(); };
  child.stdout.on("data", collect); child.stderr.on("data", collect);
  child.on("exit", () => { if (runningProjects.get(id) === state) runningProjects.delete(id); });
  let ready = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(900) });
      if (response.ok) { ready = true; state.ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return { port, url: IS_PRODUCTION ? `/api/projects/${id}/preview/` : `http://localhost:${port}`, running: child.exitCode === null && ready, starting: child.exitCode === null && !ready, logs: state.logs.join("").slice(-5000) };
}

// This IDE executes project commands and stores provider keys, so its API is loopback-only.
function isLoopbackAddress(address) {
  const value = String(address || "").toLowerCase().replace(/^::ffff:/, "");
  return value === "::1" || value === "127.0.0.1" || /^127\\./.test(value);
}
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function safeProjectEnv() {
  const sensitiveName = /(API.?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|DATABASE_URL|CONNECTION_STRING|PRIVATE_KEY)/i;
  return Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    name !== "AI_STUDIO_ENV_PATH" && !sensitiveName.test(name)
  ));
}
app.use((req, res, next) => {
  if (IS_PRODUCTION) {
    const expected = Buffer.from(String(process.env.APP_PASSWORD || ""));
    if (expected.length < 16) return res.status(503).json({ error: "Falta configurar APP_PASSWORD (mínimo 16 caracteres) en el servicio." });
    const match = String(req.headers.authorization || "").match(/^Basic\\s+(.+)$/i);
    let supplied = Buffer.alloc(0);
    try {
      const decoded = match ? Buffer.from(match[1], "base64").toString("utf8") : "";
      supplied = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
    } catch {}
    const valid = supplied.length === expected.length && timingSafeEqual(supplied, expected);
    if (!valid) {
      res.setHeader("WWW-Authenticate", 'Basic realm="AI Studio privado", charset="UTF-8"');
      return res.status(401).json({ error: "Ingresá la contraseña privada de AI Studio." });
    }
  } else {
    const remoteAddress = req.socket?.remoteAddress;
    const hostHeader = String(req.headers.host || "");
    let parsedHost;
    try { parsedHost = new URL("http://" + hostHeader); } catch {}
    const hostname = parsedHost?.hostname?.toLowerCase();
    if (!IS_AI_STUDIO && (!isLoopbackAddress(remoteAddress) || !LOCAL_HOSTS.has(hostname))) {
      return res.status(403).json({ error: "Este servidor solo acepta conexiones locales." });
    }
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
    if (fetchSite === "cross-site") return res.status(403).json({ error: "Solicitud entre sitios bloqueada." });
    const origin = req.headers.origin;
    if (origin) {
      let parsedOrigin;
      try { parsedOrigin = new URL(origin); } catch {}
      const hostHeader = String(req.headers.host || "").toLowerCase();
      const originAllowed = parsedOrigin && ["http:", "https:"].includes(parsedOrigin.protocol) &&
        (IS_PRODUCTION ? parsedOrigin.host.toLowerCase() === hostHeader : LOCAL_HOSTS.has(parsedOrigin.hostname.toLowerCase()) && parsedOrigin.host.toLowerCase() === hostHeader);
      if (!originAllowed) return res.status(403).json({ error: "Origen no permitido." });
    }
  }
  next();
});

app.use(express.json({ limit: "12mb" }));

const safeId = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 48) || "project";
const projectDir = (id) => {
  const target = path.resolve(DATA, safeId(id));
  if (!target.startsWith(DATA + path.sep)) throw new Error("Ruta de proyecto inválida");
  return target;
};
const filePath = async (id, relative) => {
  const base = projectDir(id);
  const rel = String(relative || "").replace(/\\/g, "/");
  const parts = rel.split("/");
  const target = path.resolve(base, rel);
  if (!rel || (!target.startsWith(base + path.sep) && target !== base)) throw new Error("Ruta de archivo inválida");
  if (parts.some((part) => !part || part === ".." || (part.startsWith(".") && ![".gitignore", ".env.example", ".github", ".vscode", ".husky"].includes(part)))) throw new Error("Ruta de archivo no permitida");
  let cursor = base;
  try {
    const rootStat = await fs.lstat(base);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("La carpeta del proyecto no es segura.");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error("No se permiten enlaces simbólicos dentro del proyecto.");
    } catch (error) { if (error.code === "ENOENT") break; throw error; }
  }
  return target;
};
async function ensureProject(id, name) {
  const dir = projectDir(id);
  try {
    const stat = await fs.lstat(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("La carpeta del proyecto no es segura.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(dir, { recursive: true });
  }
  const marker = path.join(dir, "index.html");
  try { await fs.access(marker); }
  catch {
    await fs.writeFile(marker, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mi aplicación</title></head><body style="font-family:system-ui;padding:40px"><h1>¡Hola!</h1><p>Tu proyecto empieza aquí.</p></body></html>');
    await fs.writeFile(path.join(dir, "README.md"), "# " + (name || "Mi proyecto") + "\n\nCreado con AI Studio.\n");
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: safeId(name), version: "1.0.0", private: true, type: "module", scripts: { dev: "vite", build: "vite build", preview: "vite preview" }, dependencies: { "@vitejs/plugin-react": "^4.3.4", vite: "^6.0.7", react: "^19.0.0", "react-dom": "^19.0.0", "lucide-react": "^0.468.0" }, devDependencies: {} }, null, 2));
    await fs.writeFile(path.join(dir, "vite.config.js"), `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });\n`);
    await fs.writeFile(path.join(dir, "src", "main.jsx"), `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./style.css";\ncreateRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);\n`);
    await fs.writeFile(path.join(dir, "src", "App.jsx"), `export default function App(){return <main style={{fontFamily:"system-ui",padding:40}}><h1>${String(name || "Mi aplicación").replace(/[<>&"]/g,"")}</h1><p>Empezá a crear con tu asistente.</p></main>}\n`);
    await fs.writeFile(path.join(dir, "src", "style.css"), `:root{font-family:system-ui;color:#1f2937;background:#f8fafc}body{margin:0}\n`);
    await fs.writeFile(marker, `<!doctype html>\n<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${String(name || "Mi aplicación").replace(/[<>&"]/g,"")}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`);
  }
  return dir;
}
async function walk(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if ((entry.name.startsWith(".") && ![".gitignore", ".env.example", ".github", ".vscode", ".husky"].includes(entry.name)) || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push({ path: rel, type: "folder", children: await walk(full, base) });
    else if (entry.isFile()) out.push({ path: rel, type: "file" });
  }
  return out;
}
async function allFiles(id) {
  const dir = await ensureProject(id);
  const tree = await walk(dir);
  const flat = [];
  const visit = (nodes) => nodes.forEach((n) => n.type === "file" ? flat.push(n.path) : visit(n.children || []));
  visit(tree);
  return flat;
}
const ENV_FILE = process.env.AI_STUDIO_ENV_PATH || path.join(ROOT, ".env");
app.post("/api/settings/provider-key", async (req, res) => {
  const { provider, apiKey } = req.body || {};
  if (IS_PRODUCTION && provider !== "openai") return res.status(403).json({ error: "Gemini se administra desde Google AI Studio Secrets." });
  const envName = provider === "gemini" ? "GEMINI_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : "";
  if (!envName) return res.status(400).json({ error: "Proveedor no admitido para esta configuración." });
  const key = String(apiKey || "").trim();
  if (key.length < 20 || key.length > 500 || /[\r\n\0]/.test(key)) return res.status(400).json({ error: "La clave no parece válida. Revisá que hayas copiado la clave completa." });
  try {
    let existing = "";
    try { existing = await fs.readFile(ENV_FILE, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const lines = existing.split(/\r?\n/).filter((line) => {
      const name = line.trim().replace(/^export\s+/, "").split("=")[0].trim();
      return name !== envName;
    });
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push(envName + "=" + JSON.stringify(key));
    const contents = lines.join("\n") + "\n";
    const tempFile = ENV_FILE + ".tmp-" + process.pid + "-" + randomUUID();
    await fs.writeFile(tempFile, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(tempFile, ENV_FILE);
    try { await fs.chmod(ENV_FILE, 0o600); } catch {}
    process.env[envName] = key;
    res.json({ ok: true, configured: true, provider });
  } catch (error) {
    res.status(500).json({ error: "No pude guardar la clave localmente: " + error.message });
  }
});
app.get("/api/health", (_req, res) => res.json({
  ok: true, service: "ai-studio",
  providers: {
    openai: { configured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || "gpt-6.2-astra" },
    gemini: { configured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || "gemini-3.8-flash" }
  },
  model: process.env.OPENAI_MODEL || "gpt-6.2-astra",
  apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY)
}));
async function studioFilePath(id, filename) {
  const project = projectDir(id);
  const projectStat = await fs.lstat(project);
  if (projectStat.isSymbolicLink() || !projectStat.isDirectory()) throw new Error("La carpeta del proyecto no es segura.");
  const dir = path.join(project, ".studio");
  try {
    const dirStat = await fs.lstat(dir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) throw new Error("La carpeta interna del proyecto no es segura.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(dir);
  }
  const target = path.join(dir, filename);
  try {
    const targetStat = await fs.lstat(target);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) throw new Error("El archivo interno del proyecto no es seguro.");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return target;
}
async function readProjectName(id) {
  try {
    const target = await studioFilePath(id, "project.json");
    const meta = JSON.parse(await fs.readFile(target, "utf8"));
    if (typeof meta.name === "string" && meta.name.trim()) return meta.name;
  } catch {}
  return id.replace(/-/g, " ").replace(/\\b\\w/g, (c) => c.toUpperCase());
}
async function writeProjectName(id, name) {
  const target = await studioFilePath(id, "project.json");
  await fs.writeFile(target, JSON.stringify({ name, updatedAt: new Date().toISOString() }, null, 2));
}

app.get("/api/projects", async (_req, res) => {
  try {
    await fs.mkdir(DATA, { recursive: true });
    const dirs = (await fs.readdir(DATA, { withFileTypes: true })).filter((d) => d.isDirectory());
    res.json({ projects: await Promise.all(dirs.map(async (d) => ({ id: d.name, name: await readProjectName(d.name), files: (await allFiles(d.name)).length }))) });
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
app.patch("/api/projects/:id", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "El nombre no puede estar vacío." });
    await ensureProject(req.params.id);
    await writeProjectName(req.params.id, name);
    res.json({ project: { id: safeId(req.params.id), name } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/projects/:id/duplicate", async (req, res) => {
  try {
    const source = projectDir(req.params.id);
    const sourceStat = await fs.lstat(source);
    if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) throw new Error("La carpeta del proyecto no es segura.");
    const sourceName = await readProjectName(req.params.id);
    const name = String(req.body?.name || (sourceName + " (copia)")).trim().slice(0, 80);
    const id = safeId(name) + "-" + Date.now().toString(36).slice(-5);
    const target = projectDir(id);
    await fs.cp(source, target, { recursive: true, filter: async (item) => {
      const rel = path.relative(source, item).split(path.sep).join("/");
      if (rel && rel.split("/").some((part) => ["node_modules", "dist", ".git", ".studio"].includes(part) || (part.startsWith(".env") && part !== ".env.example"))) return false;
      try { if ((await fs.lstat(item)).isSymbolicLink()) return false; } catch {}
      return true;
    }});
    await writeProjectName(id, name);
    res.json({ project: { id, name, files: (await allFiles(id)).length } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/projects/:id/run", async (req, res) => { try { res.json(await startProject(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); } });
// Reverse proxy for project previews: the IDE and preview stay on the same Cloud Run port.
app.use("/api/projects/:id/preview", (req, res) => {
  const state = runningProjects.get(req.params.id);
  if (!state || state.process.exitCode !== null || !state.ready) return res.status(404).send("La vista previa no está iniciada.");
  const prefix = "/api/projects/" + req.params.id + "/preview";
  const suffix = req.originalUrl.slice(prefix.length) || "/";
  const target = http.request({
    hostname: "127.0.0.1",
    port: state.port,
    path: suffix.startsWith("?") ? "/" + suffix : suffix,
    method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:" + state.port, authorization: undefined, cookie: undefined }
  }, (upstream) => {
    res.status(upstream.statusCode || 502);
    for (const [name, value] of Object.entries(upstream.headers)) {
      if (value !== undefined && !["connection", "transfer-encoding"].includes(name.toLowerCase())) res.setHeader(name, value);
    }
    upstream.pipe(res);
  });
  target.on("error", () => { if (!res.headersSent) res.status(502); res.end("No se pudo cargar la vista previa."); });
  req.pipe(target);
});
app.get("/api/projects/:id/run", (req, res) => { const state = runningProjects.get(req.params.id); const alive = Boolean(state && state.process.exitCode === null); res.json(state ? { running: alive && Boolean(state.ready), starting: alive && !state.ready, port: state.port, url: IS_PRODUCTION ? `/api/projects/${req.params.id}/preview/` : `http://localhost:${state.port}`, logs: state.logs.join("").slice(-8000) } : { running: false, starting: false, logs: "" }); });
app.post("/api/projects/:id/stop", async (req, res) => { const state = runningProjects.get(req.params.id); if (state) { await terminateProcessTree(state.process); runningProjects.delete(req.params.id); } res.json({ ok: true }); });
app.get("/api/projects/:id/conversation", async (req, res) => {
  try {
    await ensureProject(req.params.id);
    const provider = req.query.provider === "gemini" ? "gemini" : "openai";
    const target = await studioFilePath(req.params.id, "conversation-" + provider + ".json");
    try {
      const saved = JSON.parse(await fs.readFile(target, "utf8"));
      res.json({ messages: Array.isArray(saved.messages) ? saved.messages.slice(-80) : [], provider, model: typeof saved.model === "string" ? saved.model : "" });
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      if (provider === "openai") {
        try {
          const legacy = JSON.parse(await fs.readFile(await studioFilePath(req.params.id, "conversation.json"), "utf8"));
          return res.json({ messages: Array.isArray(legacy.messages) ? legacy.messages.slice(-80) : [], provider, model: typeof legacy.model === "string" ? legacy.model : "" });
        } catch (legacyError) { if (legacyError.code !== "ENOENT") throw legacyError; }
      }
      return res.json({ messages: [], provider, model: "" });
    }
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put("/api/projects/:id/conversation", async (req, res) => {
  try {
    const dir = await ensureProject(req.params.id);
    const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-80).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content || "").slice(0, 20000) })) : [];
    const provider = req.body?.provider === "gemini" ? "gemini" : "openai";
    const model = String(req.body?.model || "").slice(0, 100);
    const target = await studioFilePath(req.params.id, "conversation-" + provider + ".json");
    await fs.writeFile(target, JSON.stringify({ messages, provider, model, updatedAt: new Date().toISOString() }, null, 2));
    res.json({ ok: true, count: messages.length, provider, model });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
async function executeTerminal(id, command) {
  const cwd = await ensureProject(id);
  const shell = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : process.env.SHELL || "/bin/bash";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];
  return await new Promise((resolve, reject) => {
    const child = spawn(shell, args, { cwd, windowsHide: true, detached: process.platform !== "win32", env: { ...safeProjectEnv(), BROWSER: "none", FORCE_COLOR: "0" } });
    let output = "";
    let timedOut = false;
    const append = (chunk) => { output += String(chunk); if (output.length > 24000) output = output.slice(-24000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    const timer = setTimeout(() => { timedOut = true; terminateProcessTree(child); }, 180000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ command, output, exitCode: code, timedOut }); });
  });
}
app.post("/api/projects/:id/terminal", async (req, res) => {
  const command = String(req.body?.command || "").trim();
  if (!command || command.length > 2000) return res.status(400).json({ error: "Escribí un comando válido (máximo 2000 caracteres)." });
  try { res.json(await executeTerminal(req.params.id, command)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/projects/:id/files", async (req, res) => {
  try {
    const dir = await ensureProject(req.params.id);
    res.json({ tree: await walk(dir), files: await allFiles(req.params.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/projects/:id/file", async (req, res) => {
  try {
    const target = await filePath(req.params.id, req.query.path);
    const stat = await fs.stat(target);
    if (req.query.encoding === "base64") {
      if (stat.size > MAX_BINARY_FILE_BYTES) return res.status(413).json({ error: "El archivo supera el límite de 7 MB para lectura binaria." });
      const contentBase64 = (await fs.readFile(target)).toString("base64");
      return res.json({ path: req.query.path, contentBase64 });
    }
    if (stat.size > MAX_TEXT_FILE_BYTES) return res.status(413).json({ error: "El archivo supera el límite de 2 MB para abrirlo como texto." });
    const content = await fs.readFile(target, "utf8");
    res.json({ path: req.query.path, content });
  } catch (e) { res.status(404).json({ error: e.message }); }
});
app.put("/api/projects/:id/file", async (req, res) => {
  try {
    const relative = String(req.body?.path || "");
    if (!relative || relative.length > 240) return res.status(400).json({ error: "Nombre de archivo inválido" });
    const content = String(req.body?.content ?? "");
    if (Buffer.byteLength(content, "utf8") > MAX_TEXT_FILE_BYTES) return res.status(413).json({ error: "Los archivos de texto no pueden superar 2 MB." });
    const target = await filePath(req.params.id, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    res.json({ ok: true, path: relative });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/projects/:id/file", async (req, res) => {
  try {
    const relative = String(req.body?.path || "");
    if (!relative || relative.length > 240) return res.status(400).json({ error: "Nombre de archivo inválido" });
    const content = String(req.body?.content ?? "");
    if (Buffer.byteLength(content, "utf8") > MAX_TEXT_FILE_BYTES) return res.status(413).json({ error: "Los archivos de texto no pueden superar 2 MB." });
    const target = await filePath(req.params.id, relative);
    try { await fs.access(target); return res.status(409).json({ error: "El archivo ya existe" }); } catch {}
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    res.json({ ok: true, path: relative });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/projects/:id/file-binary", async (req, res) => {
  try {
    const relative = String(req.body?.path || "");
    const encoded = String(req.body?.contentBase64 || "");
    if (!relative || relative.length > 240 || encoded.length > 10_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return res.status(400).json({ error: "Archivo binario inválido o demasiado grande." });
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length > MAX_BINARY_FILE_BYTES) return res.status(413).json({ error: "Los archivos binarios no pueden superar 7 MB." });
    const target = await filePath(req.params.id, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    res.json({ ok: true, path: relative });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/projects/:id/file", async (req, res) => {
  try {
    const target = await filePath(req.params.id, req.body?.path);
    await fs.rm(target, { force: true });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

const toolDefinitions = [
  { type: "function", name: "run_terminal_command", description: "Execute a shell command in the current project directory. Use npm install, npm run build, tests and diagnostics. Commands have a 180 second limit.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"], additionalProperties: false }, strict: true },
  { type: "function", name: "delete_project_file", description: "Delete a file from the current project when the user requests removal or a generated file is no longer needed.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }, strict: true },
  { type: "function", name: "run_project", description: "Install project dependencies if needed and start its Vite development server for a live preview. Use after building or changing a web app.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
  { type: "function", name: "list_project_files", description: "List all files in the current project.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
  { type: "function", name: "read_project_file", description: "Read a text file from the current project.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }, strict: true },
  { type: "function", name: "write_project_file", description: "Create or replace a text file in the current project. Use this to implement requested code changes.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false }, strict: true }
];
async function runTool(id, name, args) {
  if (name === "list_project_files") return JSON.stringify(await allFiles(id));
  if (name === "run_terminal_command") return JSON.stringify(await executeTerminal(id, String(args.command || "").slice(0, 2000)));
  if (name === "delete_project_file") { const target = await filePath(id, args.path); await fs.rm(target, { force: true }); return JSON.stringify({ ok: true, deleted: args.path }); }
  if (name === "run_project") return JSON.stringify(await startProject(id));
  if (name === "read_project_file") { const target = await filePath(id, args.path); const stat = await fs.stat(target); if (stat.size > MAX_TEXT_FILE_BYTES) throw new Error("El archivo supera el límite de 2 MB para lectura."); return await fs.readFile(target, "utf8"); }
  if (name === "write_project_file") {
    const target = await filePath(id, args.path);
    if (Buffer.byteLength(String(args.content ?? ""), "utf8") > MAX_TEXT_FILE_BYTES) throw new Error("Los archivos de texto no pueden superar 2 MB.");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(args.content ?? ""), "utf8");
    return JSON.stringify({ ok: true, path: args.path });
  }
  return JSON.stringify({ error: "Herramienta desconocida" });
}
const assistantInstructions = "Sos el motor de desarrollo de AI Studio, un entorno equivalente a Google AI Studio. Construís aplicaciones web completas dentro del proyecto activo, no simples ejemplos. Prepará proyectos React + Vite, implementá pantallas funcionales, lógica, estilos y persistencia cuando corresponda. Después de cambios importantes, usá run_terminal_command para instalar dependencias, ejecutar compilaciones y pruebas; corregí los errores que aparezcan. Cuando la aplicación compile, iniciá el proyecto con run_project para habilitar una vista previa real. Antes de modificar, inspeccioná los archivos relevantes. Usá las herramientas para leer, listar y escribir archivos. Cuando el usuario pide construir o cambiar algo, hacé los cambios directamente, no te limites a dar instrucciones. Conservá el trabajo existente y explicá brevemente qué archivos cambiaste. No afirmes haber ejecutado pruebas si no las ejecutaste. Nunca solicites ni escribas secretos en archivos del proyecto.";
function outputText(outputs = []) {
  return outputs.filter((item) => item.type === "message" || item.type === "text" || item.type === "model_output").flatMap((item) => item.content || []).filter((part) => part.type === "output_text" || part.type === "text").map((part) => part.text || "").join("\n");
}
async function runOpenAI({ apiKey, model, projectId, message, history }) {
  let input = [...history.slice(-10), { role: "user", content: message }];
  let previousResponseId;
  let response;
  for (let turn = 0; turn < 8; turn++) {
    const payload = { model, instructions: assistantInstructions, input, tools: toolDefinitions, tool_choice: "auto", max_output_tokens: 6000 };
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
  return outputText(response?.output || []) || "Terminé de procesar la solicitud.";
}
async function runGemini({ apiKey, model, projectId, message, history }) {
  const ai = new GoogleGenAI({ apiKey });
  const transcript = [...history.slice(-10), { role: "user", content: message }]
    .map((item) => (item.role === "assistant" ? "ASISTENTE: " : "USUARIO: ") + String(item.content || "").slice(0, 12000))
    .join("\n\n");
  const tools = toolDefinitions.map(({ name, description, parameters }) => ({ type: "function", name, description, parameters }));
  let interaction = await ai.interactions.create({ model, input: transcript, system_instruction: assistantInstructions, tools });
  for (let turn = 0; turn < 8; turn++) {
    const steps = interaction.steps || interaction.outputs || [];
    const calls = steps.filter((item) => item.type === "function_call");
    if (!calls.length) break;
    const results = [];
    for (const call of calls) {
      let result;
      try { result = await runTool(projectId, call.name, call.arguments || {}); }
      catch (e) { result = JSON.stringify({ error: e.message }); }
      results.push({ type: "function_result", name: call.name, call_id: call.id, result: String(result).slice(0, 30000) });
    }
    interaction = await ai.interactions.create({ model, previous_interaction_id: interaction.id, input: results, tools });
  }
  const outputs = interaction.steps || interaction.outputs || [];
  const answer = interaction.output_text || outputs.filter((item) => item.type === "model_output" || item.type === "message" || item.type === "text").flatMap((item) => item.content || []).map((part) => part.text || "").filter(Boolean).join("\n");
  return answer || outputs.map((item) => item.text || "").filter(Boolean).join("\n") || "Terminé de procesar la solicitud.";
}
app.post("/api/chat", async (req, res) => {
  const { projectId, message, history = [] } = req.body || {};
  const requestedProvider = req.body?.provider ?? "openai";
  if (!["openai", "gemini"].includes(requestedProvider)) return res.status(400).json({ error: "Proveedor de IA inválido. Elegí openai o gemini." });
  const provider = requestedProvider;
  const configuredKey = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  if (!configuredKey) return res.status(503).json({ error: provider === "gemini" ? "Falta configurar GEMINI_API_KEY en el archivo .env del servidor." : "Falta configurar OPENAI_API_KEY en el archivo .env del servidor." });
  if (!projectId || !String(message || "").trim()) return res.status(400).json({ error: "Falta el proyecto o el mensaje." });
  const defaultModel = provider === "gemini" ? (process.env.GEMINI_MODEL || "gemini-3.8-flash") : (process.env.OPENAI_MODEL || "gpt-6.2-astra");
  const requestedModel = String(req.body?.model || defaultModel).trim();
  const model = requestedModel.slice(0, 100);
  try {
    const safeHistory = Array.isArray(history) ? history.filter((item) => ["user", "assistant"].includes(item?.role)).slice(-10).map((item) => ({ role: item.role, content: String(item.content || "").slice(0, 12000) })) : [];
    const answer = provider === "gemini"
      ? await runGemini({ apiKey: configuredKey, model, projectId, message: String(message).slice(0, 12000), history: safeHistory })
      : await runOpenAI({ apiKey: configuredKey, model, projectId, message: String(message).slice(0, 12000), history: safeHistory });
    res.json({ answer, provider, model, files: await allFiles(projectId) });
  } catch (error) {
    let message = error?.message || error?.error?.message || error?.response?.data?.error?.message;
    if (!message && typeof error === "string") message = error;
    if (!message) {
      try { message = JSON.stringify(error); } catch {}
    }
    if (!message || message === "{}") message = "Gemini no devolvió un mensaje de error legible. Revisá la configuración de la API y los permisos de la clave.";
    const safeMessage = String(message).replaceAll(configuredKey, "[API key oculta]");
    const status = error?.status || error?.statusCode || error?.response?.status || "sin estado";
    console.error(`[AI Studio] Error en proveedor ${provider} (HTTP ${status}): ${safeMessage}`);
    res.status(500).json({ error: safeMessage });
  }
});

const dist = path.join(ROOT, "dist");
const indexFile = path.join(dist, "index.html");

// Serve the application entry point explicitly. Some hosted preview routers
// forward the root request differently from static-file middleware.
app.get("/", async (_req, res, next) => {
  try {
    await fs.access(indexFile);
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(indexFile);
  } catch {
    return next();
  }
});
app.use(express.static(dist, { index: false }));
app.get("/{*splat}", async (_req, res, next) => {
  try {
    await fs.access(indexFile);
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(indexFile);
  } catch {
    return next();
  }
});
app.use((req, res) => {
  res.status(404).type("text").send("Ruta no encontrada en AI Studio. Volvé a abrir la dirección principal de la aplicación.");
});
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (IS_PRODUCTION ? "0.0.0.0" : "127.0.0.1");
const httpServer = app.listen(port, host, () => console.log("AI Studio API running on http://" + host + ":" + port));
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all([...runningProjects.entries()].map(async ([id, state]) => {
    await terminateProcessTree(state.process);
    runningProjects.delete(id);
  }));
  httpServer.close(() => process.exit(0));
  const forceExit = setTimeout(() => process.exit(1), 5000);
  forceExit.unref?.();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
