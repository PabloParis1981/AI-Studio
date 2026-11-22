import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { Activity, Bot, ChevronDown, ChevronRight, Code2, Download, File, FilePlus2, Folder, FolderPlus, Github, LayoutPanelLeft, Maximize2, MessageSquare, Monitor, Play, Plus, Copy, Pencil, RefreshCw, Send, Settings2, Sparkles, Terminal, Trash2, Upload, WandSparkles, X } from "lucide-react";

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
  const [provider, setProvider] = useState("openai");
  const [modelChoice, setModelChoice] = useState("");
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
  const zipInput = useRef(null);
  const lastLoadedProject = useRef("");
  const editorSnapshot = useRef({ projectId, activeFile, code });
  editorSnapshot.current = { projectId, activeFile, code };
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
    if (editorSnapshot.current.projectId !== id) return;
    setTree(data.tree);
    const projectChanged = lastLoadedProject.current !== id;
    if (projectChanged) lastLoadedProject.current = id;
    if (projectChanged || !activeFile || !data.files.includes(activeFile)) {
      await openFile(data.files.includes("index.html") ? "index.html" : data.files[0], id);
    }
  }
  async function openFile(file, id = projectId) {
    if (!file) return;
    const data = await request(API + "/projects/" + id + "/file?path=" + encodeURIComponent(file));
    if (editorSnapshot.current.projectId !== id) return;
    setActiveFile(file); setCode(data.content); setSaved(true);
    if (file.endsWith(".html")) setPreview(data.content);
  }
  useEffect(() => { loadProjects().catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (projectId) loadTree(projectId).catch((e) => setError(e.message)); }, [projectId]);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    request(API + "/projects/" + projectId + "/conversation?provider=" + provider).then((data) => {
      if (active) { setMessages(data.messages?.length ? data.messages : [{ role: "assistant", content: "¡Hola! Elegí ChatGPT o Gemini y contame qué querés construir. Puedo crear y modificar archivos directamente en tu proyecto." }]); setModelChoice(data.model || ""); }
    }).catch((e) => { if (active) setError(e.message); });
    setTerminalHistory([]); setRunInfo({ running: false, url: "", logs: "" });
    return () => { active = false; };
  }, [projectId, provider]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    if (saved || !activeFile || !projectId) return;
    const timer = setTimeout(async () => {
      try {
        const snapshot = { projectId, activeFile, code };
        await request(API + "/projects/" + snapshot.projectId + "/file", { method: "PUT", body: JSON.stringify({ path: snapshot.activeFile, content: snapshot.code }) });
        const latest = editorSnapshot.current;
        if (latest.projectId === snapshot.projectId && latest.activeFile === snapshot.activeFile && latest.code === snapshot.code) setSaved(true);
      } catch (e) { setError("No se pudo guardar automáticamente: " + e.message); }
    }, 900);
    return () => clearTimeout(timer);
  }, [code, saved, activeFile, projectId]);
  async function runProject() {
    setBusy(true); setError(""); setTab("preview");
    try {
      if (!saved) await saveFile();
      let data = await request(API + "/projects/" + projectId + "/run", { method: "POST" });
      for (let attempt = 0; data.starting && attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        data = await request(API + "/projects/" + projectId + "/run");
      }
      setRunInfo(data);
      if (!data.running) setError(data.logs || "La vista previa no llegó a iniciar. Revisá la terminal.");
    }
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
    const snapshot = { projectId, activeFile, code };
    await request(API + "/projects/" + snapshot.projectId + "/file", { method: "PUT", body: JSON.stringify({ path: snapshot.activeFile, content: snapshot.code }) });
    const latest = editorSnapshot.current;
    if (latest.projectId === snapshot.projectId && latest.activeFile === snapshot.activeFile && latest.code === snapshot.code) setSaved(true);
    if (snapshot.activeFile.endsWith(".html")) setPreview(snapshot.code);
    await loadTree(snapshot.projectId);
  }
  async function exportProject() {
    if (!projectId) return;
    setBusy(true); setError("");
    try {
      if (!saved) await saveFile();
      const listing = await request(API + "/projects/" + projectId + "/files");
      const zip = new JSZip();
      const binaryExt = /\.(png|jpe?g|gif|webp|avif|heic|ico|woff2?|ttf|otf|mp3|mp4|mov|webm|wav|ogg|m4a|pdf|zip|wasm|glb|bin)$/i;
      for (const file of listing.files) {
        const binary = binaryExt.test(file);
        const data = await request(API + "/projects/" + projectId + "/file?path=" + encodeURIComponent(file) + (binary ? "&encoding=base64" : ""));
        zip.file(file, binary ? data.contentBase64 : data.content, binary ? { base64: true } : undefined);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = (project?.name || "proyecto").toLowerCase().replace(/[^a-z0-9-]+/g, "-") + ".zip";
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (e) { setError("No se pudo exportar el proyecto: " + e.message); }
    finally { setBusy(false); }
  }
  async function createProject() {
    const name = window.prompt("Nombre del nuevo proyecto");
    if (!name?.trim()) return;
    if (!saved) await saveFile();
    const data = await request(API + "/projects", { method: "POST", body: JSON.stringify({ name }) });
    setProjects((p) => [...p, { ...data.project, files: 2 }]); setProjectId(data.project.id);
    setMessages([{ role: "assistant", content: "Proyecto creado. ¿Qué aplicación vamos a construir?" }]);
  }
  async function renameProject() {
    if (!project) return;
    const name = window.prompt("Nuevo nombre del proyecto", project.name);
    if (!name?.trim() || name.trim() === project.name) return;
    try {
      const data = await request(API + "/projects/" + projectId, { method: "PATCH", body: JSON.stringify({ name }) });
      setProjects((items) => items.map((item) => item.id === projectId ? { ...item, name: data.project.name } : item));
    } catch (e) { setError(e.message); }
  }
  async function duplicateProject() {
    if (!project) return;
    if (!saved) await saveFile();
    const name = window.prompt("Nombre para la copia", project.name + " (copia)");
    if (!name?.trim()) return;
    try {
      const data = await request(API + "/projects/" + projectId + "/duplicate", { method: "POST", body: JSON.stringify({ name }) });
      setProjects((items) => [...items, data.project]);
      setProjectId(data.project.id);
    } catch (e) { setError(e.message); }
  }
  async function importProjectZip(file) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("El ZIP supera el límite de 50 MB.");
      const archive = await JSZip.loadAsync(file);
      let entries = Object.values(archive.files).filter((entry) => !entry.dir);
      const roots = [...new Set(entries.map((entry) => entry.name.split("/")[0]))];
      const hasRootFiles = entries.some((entry) => !entry.name.includes("/"));
      const stripRoot = roots.length === 1 && !hasRootFiles && entries.every((entry) => entry.name.startsWith(roots[0] + "/"));
      const binaryExt = /\.(png|jpe?g|gif|webp|avif|heic|ico|woff2?|ttf|otf|mp3|mp4|mov|webm|wav|ogg|m4a|pdf|zip|wasm|glb|bin)$/i;
      const files = [];
      let totalSize = 0;
      for (const entry of entries) {
        let relative = stripRoot ? entry.name.slice(roots[0].length + 1) : entry.name;
        relative = relative.replace(/\\/g, "/");
        const parts = relative.split("/");
        if (!relative || relative.startsWith("/") || parts.some((part) => !part || part === "." || part === ".." || (part.startsWith(".") && ![".gitignore", ".env.example", ".github", ".vscode", ".husky"].includes(part))) || parts.some((part) => ["node_modules", "dist", ".git"].includes(part))) continue;
        const size = Number(entry._data?.uncompressedSize || 0);
        totalSize += size;
        if (files.length >= 300 || totalSize > 50 * 1024 * 1024) throw new Error("El ZIP contiene demasiados archivos o supera 50 MB descomprimidos.");
        if (binaryExt.test(relative) ? size > 7 * 1024 * 1024 : size > 2 * 1024 * 1024) throw new Error("El archivo " + relative + " supera el límite permitido (" + (binaryExt.test(relative) ? "7 MB binario" : "2 MB texto") + ").");
        files.push({ entry, path: relative, size });
      }
      if (!files.length) throw new Error("No encontré archivos válidos para importar.");
      const name = file.name.replace(/\.zip$/i, "").slice(0, 80) || "Proyecto importado";
      if (!saved) await saveFile();
      const created = await request(API + "/projects", { method: "POST", body: JSON.stringify({ name }) });
      setProjects((p) => [...p, { ...created.project, files: files.length }]);
      setProjectId(created.project.id);
      for (const item of files) {
        if (binaryExt.test(item.path)) {
          const base64 = await item.entry.async("base64");
          await request(API + "/projects/" + created.project.id + "/file-binary", { method: "POST", body: JSON.stringify({ path: item.path, contentBase64: base64 }) });
        } else {
          const content = await item.entry.async("string");
          await request(API + "/projects/" + created.project.id + "/file", { method: "PUT", body: JSON.stringify({ path: item.path, content }) });
        }
      }
      await loadTree(created.project.id);
      setMessages([{ role: "assistant", content: "Proyecto importado desde ZIP. Ya podés pedirme que lo revise, lo modifique o lo ejecute." }]);
      setError("");
    } catch (e) { setError("No se pudo importar el ZIP: " + e.message); }
    finally { setBusy(false); if (zipInput.current) zipInput.current.value = ""; }
  }
  async function deleteActiveFile() {
    if (!activeFile || !projectId) return;
    if (!window.confirm("¿Eliminar el archivo " + activeFile + "?")) return;
    await request(API + "/projects/" + projectId + "/file", { method: "DELETE", body: JSON.stringify({ path: activeFile }) });
    setActiveFile(""); setCode(""); setSaved(true); await loadTree();
  }
  async function createFile() {
    const name = window.prompt("Ruta del archivo, por ejemplo src/App.jsx");
    if (!name?.trim()) return;
    if (!saved) await saveFile();
    await request(API + "/projects/" + projectId + "/file", { method: "POST", body: JSON.stringify({ path: name, content: "" }) });
    await loadTree(); await openFile(name);
  }
  async function sendMessage() {
    const text = prompt.trim();
    if (!text || busy || !projectId) return;
    setPrompt(""); setMessages((m) => [...m, { role: "user", content: text }]); setBusy(true); setError("");
    try {
      if (!saved) await saveFile();
      const pendingMessages = [...messages, { role: "user", content: text }];
      await request(API + "/projects/" + projectId + "/conversation", { method: "PUT", body: JSON.stringify({ messages: pendingMessages, provider, model: modelChoice }) }).catch(() => {});
      const data = await request(API + "/chat", { method: "POST", body: JSON.stringify({ projectId, message: text, provider, model: modelChoice || undefined, history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })) }) });
      if (data.model) setModelChoice(data.model);
      const updatedMessages = [...messages, { role: "user", content: text }, { role: "assistant", content: data.answer }];
      setMessages(updatedMessages);
      await request(API + "/projects/" + projectId + "/conversation", { method: "PUT", body: JSON.stringify({ messages: updatedMessages, provider, model: data.model || modelChoice }) }).catch(() => {});
      try {
        await loadTree();
        const current = activeFile || "index.html";
        try { await openFile(current); } catch {}
      } catch (refreshError) {
        setError("La respuesta se completó, pero no pude actualizar el explorador: " + refreshError.message);
      }
      setTab("preview");
    } catch (e) { const updatedMessages = [...messages, { role: "user", content: text }, { role: "assistant", content: "No pude completar el pedido: " + e.message }]; setMessages(updatedMessages); request(API + "/projects/" + projectId + "/conversation", { method: "PUT", body: JSON.stringify({ messages: updatedMessages, provider, model: modelChoice }) }).catch(() => {}); }
    finally { setBusy(false); }
  }
  const refreshPreview = async () => {
    try {
      const data = await request(API + "/projects/" + projectId + "/file?path=index.html");
      setPreview(data.content); setTab("preview");
    } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    const onShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!busy) saveFile().catch((e) => setError(e.message));
      }
      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        if (!busy && !terminalBusy) runProject();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [projectId, activeFile, code, saved, busy, terminalBusy]);
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Sparkles size={18}/></div><div><strong>AI Studio</strong><small>Tu espacio de creación</small></div></div>
      <div className="top-project"><span>PROYECTO</span><select value={projectId} disabled={busy || terminalBusy} onChange={(e) => { if (!saved && !window.confirm("Tenés cambios sin guardar. ¿Cambiar de proyecto y descartarlos?")) return; setProjectId(e.target.value); }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="icon-button" title="Renombrar proyecto" disabled={busy || terminalBusy} onClick={renameProject}><Pencil size={15}/></button><button className="icon-button" title="Duplicar proyecto" disabled={busy || terminalBusy} onClick={duplicateProject}><Copy size={15}/></button><button className="icon-button" title="Nuevo proyecto" disabled={busy || terminalBusy} onClick={createProject}><Plus size={16}/></button></div>
      <div className="top-actions"><div className="connection"><i className={health?.providers?.[provider]?.configured ? "online" : ""}/>{health?.providers?.[provider]?.configured ? "IA configurada" : "Falta configurar IA"}</div><button className="icon-button" title="Configuración" onClick={() => setShowSettings(true)}><Settings2 size={17}/></button><a className="icon-button" title="Repositorio GitHub" href="https://github.com/PabloParis1981/AI-Studio" target="_blank" rel="noreferrer"><Github size={17}/></a></div>
    </header>
    {error && <div className="error-banner">{error}<button onClick={() => setError("")}><X size={14}/></button></div>}
    <main className="workspace">
      <aside className="sidebar">
        <div className="side-heading"><span>EXPLORADOR</span><div><button className="tiny-button" title="Importar proyecto ZIP" onClick={() => zipInput.current?.click()}><Upload size={14}/></button><button className="tiny-button" title="Exportar proyecto ZIP" onClick={exportProject}><Download size={14}/></button><button className="tiny-button" title="Nuevo archivo" onClick={createFile}><FilePlus2 size={15}/></button><button className="tiny-button" title="Actualizar" onClick={() => loadTree()}><RefreshCw size={14}/></button><input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => importProjectZip(e.target.files?.[0])}/></div></div>
        <div className="project-label"><Folder size={14}/><span>{project?.name || "Proyecto"}</span></div>
        <div className="file-tree"><FileTree nodes={tree} active={activeFile} onOpen={(f) => openFile(f).catch((e) => setError(e.message))}/></div>
        <div className="sidebar-bottom"><div className="side-status"><Activity size={14}/> Espacio local del proyecto</div><div className="side-status"><Activity size={14}/> Archivos guardados en este equipo</div></div>
      </aside>
      <section className="center-panel">
        <div className="panel-tabs"><div className="editor-tab"><Code2 size={15}/><span>{activeFile || "Editor"}</span>{!saved && <i className="unsaved-dot"/>}</div><div className="editor-actions"><span className="language-tag">{activeFile.split(".").pop() || "code"}</span><button className="save-button" title="Guardar · Ctrl+S" onClick={() => saveFile().catch((e) => setError(e.message))}>Guardar</button>{activeFile && <button className="save-button danger-button" title="Eliminar archivo" onClick={() => deleteActiveFile().catch((e) => setError(e.message))}><Trash2 size={12}/></button>}<button className="save-button" title="Ejecutar · Ctrl+Shift+Enter" onClick={runProject}><Play size={12}/> Ejecutar</button></div></div>
        <div className="editor-wrap"><textarea className="code-editor" spellCheck="false" value={code} onChange={(e) => { setCode(e.target.value); setSaved(false); }} placeholder="Seleccioná un archivo para empezar a editar..."/></div>
        <div className="bottom-panel">
          <div className="bottom-tabs"><button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}><Monitor size={14}/> Vista previa</button><button className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}><Terminal size={14}/> Terminal</button></div>
          {tab === "preview" ? <div className="preview-area"><div className="preview-toolbar"><span><i/> {runInfo.running ? "Aplicación ejecutándose" : "Vista previa del proyecto"}</span><div className="preview-controls">{runInfo.running && <><a href={runInfo.url} target="_blank" rel="noreferrer">Abrir en otra pestaña ↗</a><button onClick={stopProject}>Detener</button></>}<button onClick={runProject}><Play size={12}/> Ejecutar</button><button onClick={refreshPreview}><RefreshCw size={13}/> Actualizar</button></div></div>{runInfo.running ? <iframe title="Vista previa" src={runInfo.url} /> : <iframe title="Vista previa HTML" sandbox="allow-scripts allow-forms" srcDoc={previewDoc || starterHtml}/>}</div> : <div className="terminal-output"><div className="terminal-output-head"><strong><Terminal size={14}/> Terminal · {project?.name || "Proyecto"}</strong><div className="terminal-head-actions"><button disabled={terminalBusy} onClick={() => runTerminalCommand("npm install")}>Instalar</button><button disabled={terminalBusy} onClick={() => runTerminalCommand("npm run build")}>Compilar</button><button disabled={terminalBusy} onClick={() => runTerminalCommand("npm test")}>Probar</button><button disabled={terminalBusy || !terminalHistory.length} onClick={() => setTerminalHistory([])}>Limpiar</button><button onClick={runProject}>Iniciar vista previa</button></div></div><div className="terminal-history">{terminalHistory.length ? terminalHistory.map((entry, i) => <div className="terminal-entry" key={i}><div className="terminal-command-line"><span>$</span> {entry.command}</div><pre>{entry.output || "(sin salida)"}{entry.exitCode !== null && entry.exitCode !== undefined ? "\n[código de salida: " + entry.exitCode + "]" : ""}</pre></div>) : <p className="terminal-empty">Terminal del proyecto. Ejecutá comandos npm, inspeccioná archivos y compilá tu aplicación.</p>}{runInfo.logs && <div className="terminal-entry"><div className="terminal-command-line">Salida del servidor de vista previa</div><pre>{runInfo.logs}</pre></div>}</div><form className="terminal-form" onSubmit={(e) => { e.preventDefault(); runTerminalCommand(); }}><span>$</span><input value={terminalCommand} onChange={(e) => setTerminalCommand(e.target.value)} placeholder="npm run build" disabled={terminalBusy}/><button disabled={!terminalCommand.trim() || terminalBusy}>{terminalBusy ? "Ejecutando…" : "Ejecutar"}</button></form></div>}
        </div>
      </section>
      <aside className="chat-panel">
        <div className="chat-heading"><div className="chat-heading-icon"><Bot size={17}/></div><div><strong>{provider === "gemini" ? "Gemini" : "ChatGPT"}</strong><small>Motor de desarrollo · {provider === "gemini" ? "Google" : "OpenAI"}</small></div><span className="model-pill">{modelChoice || health?.providers?.[provider]?.model || (provider === "gemini" ? "GEMINI" : "OPENAI")}</span></div>
        <div className="provider-toolbar">
          <label>Motor</label>
          <select value={provider} disabled={busy} onChange={(e) => { const next = e.target.value; setProvider(next); setModelChoice(health?.providers?.[next]?.model || ""); }}>
            <option value="openai">ChatGPT · OpenAI</option><option value="gemini">Gemini · Google</option>
          </select>
          <label>Modelo</label>
          <select value={modelChoice || health?.providers?.[provider]?.model || ""} disabled={busy} onChange={(e) => setModelChoice(e.target.value)}>
            {(provider === "gemini" ? ["gemini-3.8-flash","gemini-4-argon","gemini-4-hydrogen","gemini-4-neon","gemini-4-carbon"] : [health?.providers?.openai?.model || "gpt-6.2-astra"]).map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
          <span className={health?.providers?.[provider]?.configured ? "provider-ready" : "provider-missing"}>{health?.providers?.[provider]?.configured ? "Conectado" : "Falta API key"}</span>
        </div>
        <div className="chat-context"><WandSparkles size={14}/><span>{provider === "gemini" ? "Gemini" : "ChatGPT"} construye, edita y ejecuta tu aplicación con las mismas herramientas del proyecto</span></div>
        <div className="messages">
          {messages.map((m, i) => <div key={i} className={"message " + m.role}><div className="message-avatar">{m.role === "assistant" ? <Sparkles size={14}/> : "T"}</div><div className="message-content"><div className="message-role">{m.role === "assistant" ? (provider === "gemini" ? "GEMINI" : "CHATGPT") : "VOS"}</div><p>{m.content}</p></div></div>)}
          {busy && <div className="thinking"><span/><span/><span/> La IA está trabajando en los archivos...</div>}<div ref={chatEnd}/>
        </div>
        <div className="chat-composer"><div className="composer-hint">Describí el cambio o la aplicación que querés crear</div><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ej.: Creá una landing page moderna..." rows={3}/><div className="composer-footer"><span><Sparkles size={13}/> {provider === "gemini" ? "Gemini" : "ChatGPT"} puede escribir y ejecutar código</span><button className="send-button" disabled={!prompt.trim() || busy} onClick={sendMessage}><Send size={15}/> Enviar</button></div></div>
      </aside>
    </main>
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><div className="settings-modal" onClick={(e) => e.stopPropagation()}><div className="modal-title"><strong>Configuración</strong><button className="icon-button" onClick={() => setShowSettings(false)}><X size={17}/></button></div><div className="setting-row"><Sparkles size={18}/><div><strong>Motores de IA</strong><p>Configurá las claves en el archivo local <code>.env</code> del servidor: <code>OPENAI_API_KEY</code> para ChatGPT y <code>GEMINI_API_KEY</code> para Gemini. Copiá <code>.env.example</code> como <code>.env</code>, agregá las claves que quieras usar y reiniciá AI Studio. Nunca las guardes en el proyecto ni las subas a GitHub.</p><p>La facturación de OpenAI API y Gemini API es independiente de las suscripciones de ChatGPT y Google.</p><p>Estado: OpenAI {health?.providers?.openai?.configured ? "conectado" : "sin configurar"} · Gemini {health?.providers?.gemini?.configured ? "conectado" : "sin configurar"}.</p></div></div><div className="setting-row"><Github size={18}/><div><strong>Repositorio</strong><p>Este proyecto vive en PabloParis1981/AI-Studio. La sincronización GitHub está en desarrollo.</p><a href="https://github.com/PabloParis1981/AI-Studio" target="_blank" rel="noreferrer">Abrir repositorio ↗</a></div></div></div></div>}
  </div>;
}
