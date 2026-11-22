import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data", "projects");
const settingsDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-studio-settings-"));
const settingsFile = path.join(settingsDir, ".env");
const server = net.createServer();
await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), OPENAI_API_KEY: "", GEMINI_API_KEY: "", AI_STUDIO_ENV_PATH: settingsFile },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
child.stdout.on("data", (chunk) => { logs += String(chunk); });
child.stderr.on("data", (chunk) => { logs += String(chunk); });
const base = `http://127.0.0.1:${port}`;
const createdIds = [];
async function call(route, options = {}, expectedStatus = 200) {
  const response = await fetch(base + route, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${route}: ${JSON.stringify(data)}`);
  return data;
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error("El servidor terminó antes de iniciar. " + logs);
    try {
      const response = await fetch(base + "/api/health");
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "El servidor no respondió a /api/health. " + logs);
  const health = await call("/api/health");
  assert.equal(health.ok, true);
  assert.equal(health.apiKeyConfigured, false);
  assert.equal(health.providers.openai.configured, false);
  assert.equal(health.providers.gemini.configured, false);
  assert.equal(health.providers.gemini.model, "gemini-3.8-flash");
  await call("/api/chat", { method: "POST", body: JSON.stringify({ projectId: "missing-key-test", message: "Hola", provider: "openai" }) }, 503);
  await call("/api/chat", { method: "POST", body: JSON.stringify({ projectId: "missing-key-test", message: "Hola", provider: "unknown" }) }, 400);
  const geminiMissing = await call("/api/chat", { method: "POST", body: JSON.stringify({ projectId: "missing-key-test", message: "Hola", provider: "gemini" }) }, 503);
  assert.match(geminiMissing.error, /GEMINI_API_KEY/);
  await fs.writeFile(settingsFile, "KEEP_SETTING=preserve-me\nGEMINI_API_KEY=old-gemini-key-value-1234567890\n");
  const savedKey = "AIzaSyExampleTestKey1234567890";
  const keyResult = await call("/api/settings/provider-key", { method: "POST", body: JSON.stringify({ provider: "gemini", apiKey: savedKey }) });
  assert.equal(keyResult.ok, true);
  const firstSavedEnv = await fs.readFile(settingsFile, "utf8");
  assert.equal(firstSavedEnv.includes(savedKey), true);
  assert.equal(firstSavedEnv.includes("KEEP_SETTING=preserve-me"), true);
  assert.equal((firstSavedEnv.match(/^GEMINI_API_KEY=/gm) || []).length, 1);
  const geminiHealth = await call("/api/health");
  assert.equal(geminiHealth.providers.gemini.configured, true);
  assert.equal(JSON.stringify(geminiHealth).includes(savedKey), false);
  if (process.platform !== "win32") assert.equal((await fs.stat(settingsFile)).mode & 0o777, 0o600);
  const openaiKey = "sk-test-example-key-12345678901234567890";
  const openaiKeyResult = await call("/api/settings/provider-key", { method: "POST", body: JSON.stringify({ provider: "openai", apiKey: openaiKey }) });
  assert.equal(openaiKeyResult.provider, "openai");
  const savedEnv = await fs.readFile(settingsFile, "utf8");
  assert.equal(savedEnv.includes(savedKey), true);
  assert.equal(savedEnv.includes(openaiKey), true);
  const configuredHealth = await call("/api/health");
  assert.equal(configuredHealth.providers.openai.configured, true);
  assert.equal(configuredHealth.providers.gemini.configured, true);
  assert.equal(JSON.stringify(configuredHealth).includes(openaiKey), false);
  assert.equal((savedEnv.match(/^OPENAI_API_KEY=/gm) || []).length, 1);
  assert.equal(savedEnv.includes("KEEP_SETTING=preserve-me"), true);
  await call("/api/settings/provider-key", { method: "POST", body: JSON.stringify({ provider: "unknown", apiKey: openaiKey }) }, 400);
  await call("/api/settings/provider-key", { method: "POST", body: JSON.stringify({ provider: "gemini", apiKey: "short" }) }, 400);
  await call("/api/settings/provider-key", { method: "POST", body: JSON.stringify({ provider: "openai", apiKey: "valid-looking-key-12345678901234567890\\n\nMALICIOUS=value" }) }, 400);

  const created = await call("/api/projects", { method: "POST", body: JSON.stringify({ name: "Smoke Test" }) });
  const id = created.project.id;
  createdIds.push(id);
  await call(`/api/projects/${id}/file`, { method: "PUT", body: JSON.stringify({ path: "src/check.txt", content: "AI Studio smoke test" }) });
  await call(`/api/projects/${id}/file`, { method: "PUT", body: JSON.stringify({ path: ".env.example", content: "OPENAI_API_KEY=replace-me" }) });
  const textFile = await call(`/api/projects/${id}/file?path=src%2Fcheck.txt`);
  assert.equal(textFile.content, "AI Studio smoke test");

  const oversizedText = "x".repeat(2 * 1024 * 1024 + 1);
  await call(`/api/projects/${id}/file`, { method: "PUT", body: JSON.stringify({ path: "src/too-large.txt", content: oversizedText }) }, 413);
  await fs.writeFile(path.join(DATA, id, "src", "oversized-existing.txt"), oversizedText);
  await call(`/api/projects/${id}/file?path=src%2Foversized-existing.txt`, {}, 413);

  const binary = Buffer.from([0, 1, 2, 127, 255]).toString("base64");
  await call(`/api/projects/${id}/file-binary`, { method: "POST", body: JSON.stringify({ path: "assets/sample.bin", contentBase64: binary }) });
  const binaryRead = await call(`/api/projects/${id}/file?path=assets%2Fsample.bin&encoding=base64`);
  assert.equal(binaryRead.contentBase64, binary);

  const oversizedBinary = Buffer.alloc(7 * 1024 * 1024 + 1, 7).toString("base64");
  await call(`/api/projects/${id}/file-binary`, { method: "POST", body: JSON.stringify({ path: "assets/too-large.bin", contentBase64: oversizedBinary }) }, 413);

  await call(`/api/projects/${id}/conversation`, { method: "PUT", body: JSON.stringify({ messages: [{ role: "user", content: "Prueba persistente" }], provider: "gemini", model: "gemini-3.8-flash" }) });
  const conversation = await call(`/api/projects/${id}/conversation?provider=gemini`);
  assert.equal(conversation.messages[0].content, "Prueba persistente");
  assert.equal(conversation.provider, "gemini");
  assert.equal(conversation.model, "gemini-3.8-flash");
  const openaiConversation = await call(`/api/projects/${id}/conversation?provider=openai`);
  assert.equal(openaiConversation.messages.length, 0);

  await fs.writeFile(path.join(DATA, id, ".env"), "OPENAI_API_KEY=must-not-copy");
  const renamed = await call(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name: "Proyecto Renombrado" }) });
  assert.equal(renamed.project.name, "Proyecto Renombrado");

  const duplicate = await call(`/api/projects/${id}/duplicate`, { method: "POST", body: JSON.stringify({ name: "Copia de prueba" }) });
  createdIds.push(duplicate.project.id);
  const copied = await call(`/api/projects/${duplicate.project.id}/file?path=src%2Fcheck.txt`);
  assert.equal(copied.content, "AI Studio smoke test");
  const copiedExample = await call(`/api/projects/${duplicate.project.id}/file?path=.env.example`);
  assert.equal(copiedExample.content, "OPENAI_API_KEY=replace-me");
  await call(`/api/projects/${duplicate.project.id}/file?path=.env`, {}, 404);
  await call(`/api/projects/${id}/file?path=..%2F..%2Fpackage.json`, {}, 404);

  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ai-studio-outside-"));
  try {
    await fs.writeFile(path.join(outside, "secret.txt"), "outside project");
    await fs.symlink(outside, path.join(DATA, id, "linked-folder"), "dir");
    await call(`/api/projects/${id}/file?path=linked-folder%2Fsecret.txt`, {}, 404);
    await call(`/api/projects/${id}/file`, { method: "PUT", body: JSON.stringify({ path: "linked-folder/new.txt", content: "blocked" }) }, 400);
    const metadataProject = await call("/api/projects", { method: "POST", body: JSON.stringify({ name: "Metadata Symlink Test" }) });
    createdIds.push(metadataProject.project.id);
    await fs.rm(path.join(DATA, metadataProject.project.id, ".studio"), { recursive: true, force: true });
    await fs.symlink(outside, path.join(DATA, metadataProject.project.id, ".studio"), "dir");
    await call(`/api/projects/${metadataProject.project.id}/conversation`, {}, 400);
    await call(`/api/projects/${metadataProject.project.id}`, { method: "PATCH", body: JSON.stringify({ name: "No debe escribir" }) }, 400);
    await fs.symlink(outside, path.join(DATA, "linked-project-test"), "dir");
    await call("/api/projects/linked-project-test/files", {}, 400);
  } finally {
    await fs.rm(path.join(DATA, "linked-project-test"), { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }

  const listing = await call("/api/projects");
  assert.ok(listing.projects.some((project) => project.id === id && project.name === "Proyecto Renombrado"));
  console.log("Smoke tests OK: health, OpenAI/Gemini missing-key handling and secure provider-key configuration, provider persistence, projects, bounded text/binary files, conversation, rename, duplicate, secret exclusion, path traversal, project symlink and internal metadata symlink protection.");
} finally {
  child.kill();
  await Promise.all(createdIds.map((id) => fs.rm(path.join(DATA, id), { recursive: true, force: true }).catch(() => {})));
  await fs.rm(settingsDir, { recursive: true, force: true });
}
