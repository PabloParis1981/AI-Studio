import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-studio-production-"));
const dataDir = path.join(temp, "projects");
const probe = net.createServer();
await new Promise((resolve, reject) => probe.listen(0, "127.0.0.1", resolve).once("error", reject));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: ROOT,
  env: { ...process.env, APP_ENV: "production", NODE_ENV: "production", DATA_DIR: dataDir, PORT: String(port), HOST: "127.0.0.1", GEMINI_API_KEY: "", OPENAI_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
child.stdout.on("data", (chunk) => { logs += String(chunk); });
child.stderr.on("data", (chunk) => { logs += String(chunk); });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error("Production server exited: " + logs);
    try { const r = await fetch(base + "/api/health"); if (r.status === 200) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Production server did not start. " + logs);
  assert.equal((await fetch(base + "/api/health")).status, 200);
  const blockedKeyWrite = await fetch(base + "/api/settings/provider-key", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ provider: "gemini", apiKey: "AIzaSyExampleTestKey1234567890" })
  });
  assert.equal(blockedKeyWrite.status, 403);
  const created = await fetch(base + "/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ name: "Persistencia Producción" })
  });
  assert.equal(created.status, 200);
  const payload = await created.json();
  assert.ok(await fs.stat(path.join(dataDir, payload.project.id)));
  console.log("Production smoke tests OK: public personal access, provider keys locked to Secret Manager, and configurable persistent data directory.");
} finally {
  if (child.exitCode === null) {
    await new Promise((resolve) => { child.once("exit", resolve); child.kill(); });
  }
  await fs.rm(temp, { recursive: true, force: true });
}
