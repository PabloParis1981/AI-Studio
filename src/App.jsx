import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bot, ChevronDown, ChevronRight, Code2, File, FilePlus2, Folder, FolderPlus, Github, LayoutPanelLeft, Maximize2, MessageSquare, Monitor, Play, Plus, RefreshCw, Send, Settings2, Sparkles, Terminal, WandSparkles, X } from "lucide-react";

const API = "/api";
const starterHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mi aplicación</title></head><body style="font-family:system-ui;padding:40px"><h1>¡Hola!</h1><p>Tu proyecto empieza aquí.</p></body></html>';
async function request(url, options) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options?.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}
function FileTree({ nodes, active, onOpen, level = 0 }) {
  const [closed, setClosed] = useState({});
  return nodes.map((node) => node.type === "folder" ? <div key={node.path}>
    <button className="tree-row folder-row" style={{ paddingLeft: 12 + level * 14 }} onClick={() => setClosed((s) => ({ ...s, [node.path]: !s[node.path] }))}>
      {closed[node.path] ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<Folder size={15}/><span>{node.path.split("/").pop()}</span>
    </button>
    {!closed[node.path] && <FileTree nodes={node.children || []} active={active} onOpen={onOpen} level={level + 1}/>}
  </div> : <button key={node.path} className={"tree-row file-row " + (active === node.path ? "selected" : "")} style={{ paddingLeft: 31 + level * 14 }} onClick={() => onOpen(node.path)}><File size={14}/><span>{node.path.split("/").pop()}</span></button>);
}
export default function App() {
  const [health, setHealth] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [tree, setTree] = useState([]);
  const [activeFile, setActiveFile] = useState("");
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(true);
  const [messages, setMessages] = useState([{ role: "assistant", content: "¡Hola! Soy ChatGPT, tu asistente de desarrollo. Contame qué querés construir y puedo crear o modificar archivos directamente en tu proyecto." }]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("preview");
  const [preview, setPreview] = useState(starterHtml);
  const [runInfo, setRunInfo] = useState({ running: false, url: "", logs: "" });
  const [terminalCommand, setTerminalCommand] = useState("");
  const [terminalHistory, setTerminalHistory] = useState([]);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const chatEnd = useRef(null);
  const project = projects.find((p) => p.id === projectId);
  const previewDoc = useMemo(() => {
    if (activeFile.endsWith(".html")) return code;
    return preview;
  }, [activeFile, code, preview]);

  async function loadProjects() {
    const [p, h] = await Promise.all([request(API + "/projects"), request(API + "/health")]);
    setProjects(p.projects); setHealth(h);
    if (!projectId && p.projects[0]) setProjectId(p.projects[0].id);
    if (!p.projects.length) {
      const created = await request(API + "/projects", { method: "POST", body: JSON.stringify({ name: "Mi primera app" }) });
      setProjects([{ ...created.project, files: 2 }]); setProjectId(created.project.id);
    }
  }
  async function loadTree(id = projectId) {
    if (!id) return;
    const data = await request(API + "/projects/" + id + "/files");
    setTree(data.tree);
    if (!activeFile || !data.files.includes(activeFile)) await openFile(data.files.includes("index.html") ? "index.html" : data.files[0], id);
  }
  async function openFile(file, id = projectId) {
    if (!file) return;
    const data = await request(API + "/projects/" + id + "/file?path=" + encodeURIComponent(file));
    setActiveFile(file); setCode(data.content); setSaved(true);
    if (file.endsWith(".html")) setPreview(data.content);
  }
  useEffect(() => { loadProjects().catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (projectId) loadTree(projectId).catch((e) => setError(e.message)); }, [projectId]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  async function runProject() {
    setBusy(true); setError(""); setTab("preview");
    try { const data = await request(API + "/projects/" + projectId + "/run", { method: "POST" }); setRunInfo(data); if (!data.running) setError(data.logs || "No se pudo iniciar la vista previa."); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function runTerminalCommand(command = terminalCommand) {
    const value = command.trim(); if (!value || terminalBusy) return;
    setTerminalBusy(true); setTerminalCommand("");
    setTerminalHistory((items) => [...items, { command: value, output: "Ejecutando...", exitCode: null }]);
    try {
      const data = await request(API + "/projects/" + projectId + "/terminal", { method: "POST", body: JSON.stringify({ command: value }) });
      setTerminalHistory((items) => [...items.slice(0, -1), data]);
    } catch (e) { setTerminalHistory((items) => [...items.slice(0, -1), { command: value, output: e.message, exitCode: 1 }]); }
    finally { setTerminalBusy(false); }
  }
  async function stopProject() { try { await request(API + "/projects/" + projectId + "/stop", { method: "POST" }); setRunInfo({ running: false, url: "", logs: "" }); } catch (e) { setError(e.message); } }
  async function saveFile() {
    if (!activeFile || !projectId) return;
    await request(API + "/projects/" + projectId + "/file", { method: "PUT", body: JSON.stringify({ path: activeFile, content: code }) });
    setSaved(true);
    if (activeFile.endsWith(".html")) setPreview(code);
    await loadTree();
  }
  async function createProject() {
    const name = window.prompt("Nombre del nuevo proyecto");
    if (!name?.trim()) return;
    const data = await request(API + "/projects", { method: "POST", body: JSON.stringify({ name }) });
    setProjects((p) => [...p, { ...data.project, files: 2 }]); setProjectId(data.project.id);
    setMessages([{ role: "assistant", content: "Proyecto creado. ¿Qué aplicación vamos a construir?" }]);
  }
  async function createFile() {
    const name = window.prompt("Ruta del archivo, por ejemplo src/App.jsx");
    if (!name?.trim()) return;
    await request(API + "/projects/" + projectId + "/file", { method: "POST", body: JSON.stringify({ path: name, content: "" }) });
    await loadTree(); await openFile(name);
  }
  async function sendMessage() {
    const text = prompt.trim();
    if (!text || busy || !projectId) return;
    setPrompt(""); setMessages((m) => [...m, { role: "user", content: text }]); setBusy(true); setError("");
    try {
      const data = await request(API + "/chat", { method: "POST", body: JSON.stringify({ projectId, message: text, history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })) }) });
      setMessages((m) => [...m, { role: "assistant", content: data.answer }]);
      await loadTree();
      const current = activeFile || "index.html";
      try { await openFile(current); } catch {}
      setTab("preview");
    } catch (e) { setMessages((m) => [...m, { role: "assistant", content: "No pude completar el pedido: " + e.message }]); }
    finally { setBusy(false); }
  }
  const refreshPreview = async () => {
    try {
      const data = await request(API + "/projects/" + projectId + "/file?path=index.html");
      setPreview(data.content); setTab("preview");
    } catch (e) { setError(e.message); }
  };
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Sparkles size={18}/></div><div><strong>AI Studio</strong><small>Tu espacio de creación</small></div></div>
      <div className="top-project"><span>PROYECTO</span><select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="icon-button" title="Nuevo proyecto" onClick={createProject}><Plus size={16}/></button></div>
      <div className="top-actions"><div className="connection"><i className={health?.apiKeyConfigured ? "online" : ""}/>{health?.apiKeyConfigured ? "IA configurada" : "Falta configurar IA"}</div><button className="icon-button" title="Configuración" onClick={() => setShowSettings(true)}><Settings2 size={17}/></button><a className="icon-button" title="Repositorio GitHub" href="https://github.com/PabloParis1981/AI-Studio" target="_blank" rel="noreferrer"><Github size={17}/></a></div>
    </header>
    {error && <div className="error-banner">{error}<button onClick={() => setError("")}><X size={14}/></button></div>}
    <main className="workspace">
      <aside className="sidebar">
        <div className="side-heading"><span>EXPLORADOR</span><div><button className="tiny-button" title="Nuevo archivo" onClick={createFile}><FilePlus2 size={15}/></button><button className="tiny-button" title="Actualizar" onClick={() => loadTree()}><RefreshCw size={14}/></button></div></div>
        <div className="project-label"><Folder size={14}/><span>{project?.name || "Proyecto"}</span></div>
        <div className="file-tree"><FileTree nodes={tree} active={activeFile} onOpen={(f) => openFile(f).catch((e) => setError(e.message))}/></div>
        <div className="sidebar-bottom"><div className="side-status"><Activity size={14}/> Espacio local del proyecto</div><div className="side-status"><Activity size={14}/> Archivos guardados en este equipo</div></div>
      </aside>
      <section className="center-panel">
        <div className="panel-tabs"><div className="editor-tab"><Code2 size={15}/><span>{activeFile || "Editor"}</span>{!saved && <i className="unsaved-dot"/>}</div><div className="editor-actions"><span className="language-tag">{activeFile.split(".").pop() || "code"}</span><button className="save-button" onClick={() => saveFile().catch((e) => setError(e.message))}>Guardar</button><button className="save-button" onClick={runProject}><Play size={12}/> Ejecutar</button></div></div>
        <div className="editor-wrap"><textarea className="code-editor" spellCheck="false" value={code} onChange={(e) => { setCode(e.target.value); setSaved(false); }} placeholder="Seleccioná un archivo para empezar a editar..."/></div>
        <div className="bottom-panel">
          <div className="bottom-tabs"><button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}><Monitor size={14}/> Vista previa</button><button className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}><Terminal size={14}/> Terminal</button></div>
          {tab === "preview" ? <div className="preview-area"><div className="preview-toolbar"><span><i/> {runInfo.running ? "Aplicación ejecutándose" : "Vista previa del proyecto"}</span><div className="preview-controls">{runInfo.running && <><a href={runInfo.url} target="_blank" rel="noreferrer">Abrir en otra pestaña ↗</a><button onClick={stopProject}>Detener</button></>}<button onClick={runProject}><Play size={12}/> Ejecutar</button><button onClick={refreshPreview}><RefreshCw size={13}/> Actualizar</button></div></div>{runInfo.running ? <iframe title="Vista previa" src={runInfo.url} /> : <iframe title="Vista previa HTML" sandbox="allow-scripts allow-forms" srcDoc={previewDoc || starterHtml}/>}</div> : <div className="terminal-output"><div className="terminal-output-head"><strong><Terminal size={14}/> Terminal · {project?.name || "Proyecto"}</strong><button onClick={runProject}>Iniciar vista previa</button></div><div className="terminal-history">{terminalHistory.length ? terminalHistory.map((entry, i) => <div className="terminal-entry" key={i}><div className="terminal-command-line"><span>$</span> {entry.command}</div><pre>{entry.output || "(sin salida)"}{entry.exitCode !== null && entry.exitCode !== undefined ? "\n[código de salida: " + entry.exitCode + "]" : ""}</pre></div>) : <p className="terminal-empty">Terminal del proyecto. Ejecutá comandos npm, inspeccioná archivos y compilá tu aplicación.</p>}{runInfo.logs && <div className="terminal-entry"><div className="terminal-command-line">Salida del servidor de vista previa</div><pre>{runInfo.logs}</pre></div>}</div><form className="terminal-form" onSubmit={(e) => { e.preventDefault(); runTerminalCommand(); }}><span>$</span><input value={terminalCommand} onChange={(e) => setTerminalCommand(e.target.value)} placeholder="npm run build" disabled={terminalBusy}/><button disabled={!terminalCommand.trim() || terminalBusy}>{terminalBusy ? "Ejecutando…" : "Ejecutar"}</button></form></div>}
        </div>
      </section>
      <aside className="chat-panel">
        <div className="chat-heading"><div className="chat-heading-icon"><Bot size={17}/></div><div><strong>ChatGPT</strong><small>Motor de desarrollo de OpenAI</small></div><span className="model-pill">OPENAI</span></div>
        <div className="chat-context"><WandSparkles size={14}/><span>ChatGPT construye, edita y ejecuta tu aplicación</span></div>
        <div className="messages">
          {messages.map((m, i) => <div key={i} className={"message " + m.role}><div className="message-avatar">{m.role === "assistant" ? <Sparkles size={14}/> : "T"}</div><div className="message-content"><div className="message-role">{m.role === "assistant" ? "CHATGPT" : "VOS"}</div><p>{m.content}</p></div></div>)}
          {busy && <div className="thinking"><span/><span/><span/> La IA está trabajando en los archivos...</div>}<div ref={chatEnd}/>
        </div>
        <div className="chat-composer"><div className="composer-hint">Describí el cambio o la aplicación que querés crear</div><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ej.: Creá una landing page moderna..." rows={3}/><div className="composer-footer"><span><Sparkles size={13}/> ChatGPT puede escribir y ejecutar código</span><button className="send-button" disabled={!prompt.trim() || busy} onClick={sendMessage}><Send size={15}/> Enviar</button></div></div>
      </aside>
    </main>
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><div className="settings-modal" onClick={(e) => e.stopPropagation()}><div className="modal-title"><strong>Configuración</strong><button className="icon-button" onClick={() => setShowSettings(false)}><X size={17}/></button></div><div className="setting-row"><Sparkles size={18}/><div><strong>Motor de IA</strong><p>La API key se configura en el servidor mediante la variable OPENAI_API_KEY. Nunca se guarda en el navegador ni en GitHub.</p></div></div><div className="setting-row"><Github size={18}/><div><strong>Repositorio</strong><p>Este proyecto vive en PabloParis1981/AI-Studio. La sincronización GitHub está en desarrollo.</p><a href="https://github.com/PabloParis1981/AI-Studio" target="_blank" rel="noreferrer">Abrir repositorio ↗</a></div></div></div></div>}
  </div>;
}
