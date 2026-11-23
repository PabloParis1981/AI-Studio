import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const WINDOWS = process.platform === "win32";
const MAX_OUTPUT = 5 * 1024 * 1024;
const TIMEOUT_MS = 6 * 60 * 1000;

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || safeEnvironment(),
      windowsHide: true,
      shell: WINDOWS,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      finish({ ok: false, code: null, stdout, stderr, error: "El asistente superó el límite de 6 minutos." });
    }, options.timeout || TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.slice(-MAX_OUTPUT);
        try { child.kill("SIGTERM"); } catch {}
        finish({ ok: false, code: null, stdout, stderr, error: "La salida del asistente superó el límite permitido." });
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(-MAX_OUTPUT);
    });
    child.once("error", (error) => finish({ ok: false, code: null, stdout, stderr, error: error.code === "ENOENT" ? "No encuentro el comando " + command + ". Instalalo y reiniciá AI Studio." : error.message }));
    child.once("close", (code) => finish({ ok: code === 0, code, stdout, stderr, error: code === 0 ? "" : (stderr.trim() || stdout.trim() || "El asistente terminó con código " + code) }));
    child.stdin.on("error", () => {});
    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

function safeEnvironment() {
  const blocked = /(API.?KEY|ACCESS.?TOKEN|REFRESH.?TOKEN|SECRET|PASSWORD|PRIVATE.?KEY)/i;
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !blocked.test(name)));
}

function parseCodexOutput(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
  let answer = "";
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === "item.completed" && event.item?.type === "agent_message") answer = event.item.text || answer;
      if (event.type === "turn.completed" && event.result) answer = event.result;
    } catch {}
  }
  return answer || lines.filter((line) => !line.trim().startsWith("{")).join("\n").trim();
}

function parseGeminiOutput(stdout) {
  const raw = String(stdout || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return parsed.response || parsed.result || parsed.message || raw;
  } catch {
    return raw;
  }
}

export async function getLocalAgentStatus() {
  const [codexVersion, geminiVersion, codexAuth] = await Promise.all([
    runCommand("codex", ["--version"], { timeout: 8000 }),
    runCommand("gemini", ["--version"], { timeout: 8000 }),
    runCommand("codex", ["login", "status"], { timeout: 8000 })
  ]);
  let geminiAuth = false;
  try {
    await fs.access(path.join(os.homedir(), ".gemini", "oauth_creds.json"));
    geminiAuth = true;
  } catch {}
  return {
    codex: {
      installed: codexVersion.ok,
      authenticated: codexAuth.ok,
      version: codexVersion.stdout.trim().split(/\r?\n/)[0] || "",
      message: codexVersion.ok ? (codexAuth.ok ? "Conectado con tu cuenta ChatGPT" : "Falta iniciar sesión en ChatGPT") : "Codex CLI no está instalado"
    },
    gemini: {
      installed: geminiVersion.ok,
      authenticated: geminiAuth,
      version: geminiVersion.stdout.trim().split(/\r?\n/)[0] || "",
      message: geminiVersion.ok ? (geminiAuth ? "Sesión Google encontrada" : "Falta iniciar sesión con Google") : "Gemini CLI no está instalado"
    }
  };
}

export async function runLocalAgent({ provider, projectDir, message, history = [] }) {
  if (!["codex", "gemini"].includes(provider)) throw new Error("Elegí ChatGPT o Gemini.");
  const transcript = history.slice(-12).map((item) =>
    (item.role === "assistant" ? "ASISTENTE: " : "USUARIO: ") + String(item.content || "").slice(0, 10000)
  ).join("\n\n");
  const instructions = [
    "Sos el asistente de desarrollo de AI Studio Personal.",
    "Trabajás DIRECTAMENTE en el proyecto que está abierto como directorio de trabajo.",
    "Inspeccioná primero los archivos relevantes. Cuando el usuario pide cambios, editá los archivos reales; no respondas solamente con instrucciones o bloques de código.",
    "Conservá las funciones existentes y evitá reescribir archivos que no hagan falta.",
    "No leas, muestres, copies ni modifiques archivos de credenciales, .env, tokens, claves o secretos.",
    "No hagas operaciones destructivas fuera del proyecto. No borres el proyecto ni sus archivos salvo pedido explícito.",
    "No ejecutes comandos de instalación ni scripts. AI Studio iniciará la vista previa desde su propio servidor después de tu respuesta.",
    "Al terminar, resumí qué cambiaste y mencioná cualquier cosa que no hayas podido verificar.",
    "Respondé siempre en español rioplatense, claro y directo."
  ].join(" ");
  const prompt = instructions + "\n\nHISTORIAL RECIENTE:\n" + (transcript || "(sin historial)") + "\n\nPEDIDO ACTUAL:\n" + String(message).slice(0, 12000);
  const result = provider === "codex"
    ? await runCommand("codex", ["exec", "--json", "--sandbox", "workspace-write", "--ask-for-approval", "never", "--skip-git-repo-check", "-"], { cwd: projectDir, input: prompt })
    : await runCommand("gemini", ["--output-format", "json", "--approval-mode", "auto_edit"], { cwd: projectDir, input: prompt });
  if (!result.ok) throw new Error(result.error || "No se pudo ejecutar el asistente.");
  const answer = provider === "codex" ? parseCodexOutput(result.stdout) : parseGeminiOutput(result.stdout);
  if (!answer) throw new Error("El asistente terminó sin devolver una respuesta. Revisá su instalación y sesión.");
  return answer;
}
