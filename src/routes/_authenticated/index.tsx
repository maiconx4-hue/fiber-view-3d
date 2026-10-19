import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Map as MapIcon, GitBranch, Move, Triangle, Box, Eye, Trash2, RotateCcw, Save, Upload, FilePlus, Copy } from "lucide-react";
import type { MapMode } from "@/components/NetworkMap";
import { Timeline } from "@/components/Timeline";
import { BoxViewer } from "@/components/BoxViewer";
import { childrenOf, distanceTo, newId, nodeCode, seedProject, type FNode, type NodeType, type Project } from "@/lib/ftth";
import { importExcel, importKmz } from "@/lib/importers";
import { supabase } from "@/integrations/supabase/client";
import { AccountControl } from "@/components/AccountControl";
import { draftKey, LAST_KEY, readDraft, type ProjectRow } from "@/lib/project-store";

const NetworkMap = lazy(() => import("@/components/NetworkMap"));

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "FTTH Vision — Projeto de rede óptica 3D" },
      { name: "description", content: "Visualize e edite projetos FTTH: POP, OLT, DGO, CEO e CTO no mapa 3D com cores ABNT." },
      { property: "og:title", content: "FTTH Vision — Projeto de rede óptica 3D" },
      { property: "og:description", content: "Mapa 3D, linha do tempo e caixas CTO/CEO ilustradas com cores ABNT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Status = "loading" | "saved" | "dirty" | "unsaved-new" | "error";

function Index() {
  const { user } = Route.useRouteContext();
  const [project, setProjectRaw] = useState<Project>(seedProject);
  const [view, setView] = useState<"map" | "timeline">("map");
  const [mode, setMode] = useState<MapMode>("view");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; ts: number } | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Projeto FTTH");
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadSeq = useRef(0);

  // Toda edição do usuário passa por aqui: marca como não salvo.
  const setProject: typeof setProjectRaw = useCallback((v) => {
    setProjectRaw(v);
    setStatus((s) => (s === "loading" ? s : projectIdRef.current ? "dirty" : "unsaved-new"));
  }, []);
  const projectIdRef = useRef<string | null>(null);
  projectIdRef.current = projectId;

  const refreshList = useCallback(async () => {
    const { data, error } = await supabase.from("ftth_projects").select("id,name,updated_at").order("updated_at", { ascending: false });
    if (error) throw error;
    setProjects(data ?? []);
    return data ?? [];
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const seq = ++loadSeq.current;
    setStatus("loading");
    const { data, error } = await supabase.from("ftth_projects").select("id,name,data,updated_at").eq("id", id).maybeSingle();
    if (seq !== loadSeq.current) return; // outra carga começou depois: descarta esta resposta
    if (error || !data) { setStatus("error"); setNotice("Erro ao carregar projeto: " + (error?.message ?? "não encontrado")); return; }
    setProjectId(data.id); setProjectName(data.name); setBaseUpdatedAt(data.updated_at);
    setSelected(null); setOpen(null);
    localStorage.setItem(LAST_KEY, data.id);
    // Rascunho local só é aplicado se foi feito sobre esta mesma versão do banco.
    const draft = readDraft(data.id);
    if (draft && draft.baseUpdatedAt === data.updated_at) {
      setProjectRaw(draft.data); setStatus("dirty");
      setNotice("Rascunho local restaurado — ainda NÃO salvo no banco.");
    } else {
      if (draft) localStorage.removeItem(draftKey(data.id));
      setProjectRaw(data.data as unknown as Project); setStatus("saved");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await refreshList();
        const last = localStorage.getItem(LAST_KEY);
        const target = list.find((p) => p.id === last) ?? list[0];
        if (target) await loadProject(target.id);
        else { setProjectRaw(seedProject()); setStatus("unsaved-new"); }
      } catch (e) { setStatus("error"); setNotice("Erro ao listar projetos: " + (e as Error).message); }
    })();
  }, [refreshList, loadProject]);

  // Rascunho local apenas para alterações ainda não salvas.
  useEffect(() => {
    if (status !== "dirty" && status !== "unsaved-new") return;
    localStorage.setItem(draftKey(projectId), JSON.stringify({ data: project, baseUpdatedAt }));
  }, [project, status, projectId, baseUpdatedAt]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(t); }, [notice]);

  const confirmDiscard = () => (status !== "dirty" && status !== "unsaved-new") || confirm("Há alterações não salvas. Descartar?");

  const save = async (asNew = false) => {
    if (saving || status === "loading") return;
    let name = projectName;
    if (asNew || !projectId) {
      const n = prompt("Nome do projeto:", asNew ? `${projectName} (cópia)` : `${project.city}.${project.pop}`);
      if (!n?.trim()) return;
      name = n.trim();
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      let row: { id: string; name: string; updated_at: string } | null;
      if (projectId && !asNew) {
        // Concorrência otimista: só grava se ninguém alterou depois da última leitura.
        let q = supabase.from("ftth_projects").update({ name, data: project as never, updated_at: now }).eq("id", projectId);
        if (baseUpdatedAt) q = q.eq("updated_at", baseUpdatedAt);
        const { data, error } = await q.select("id,name,updated_at").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("o projeto foi alterado em outra sessão ou não existe mais. Recarregue antes de salvar.");
        row = data;
      } else {
        const { data, error } = await supabase.from("ftth_projects").insert({ name, data: project as never, user_id: user.id }).select("id,name,updated_at").single();
        if (error) throw error;
        row = data;
      }
      localStorage.removeItem(draftKey(asNew ? projectId : projectId ?? null));
      localStorage.removeItem(draftKey(null));
      setProjectId(row.id); setProjectName(row.name); setBaseUpdatedAt(row.updated_at); setStatus("saved");
      localStorage.setItem(LAST_KEY, row.id);
      await refreshList();
      setNotice("Projeto salvo no banco de dados ✓");
    } catch (e) {
      setNotice("Erro ao salvar: " + (e as Error).message);
    } finally { setSaving(false); }
  };

  const newProject = () => {
    if (!confirmDiscard()) return;
    loadSeq.current++;
    setProjectId(null); setBaseUpdatedAt(null); setProjectName("Projeto FTTH");
    setProjectRaw(seedProject()); setSelected(null); setOpen(null); setStatus("unsaved-new");
  };

  const selectProject = (id: string) => {
    if (id === projectId) return;
    if (!confirmDiscard()) return;
    if (projectId) localStorage.removeItem(draftKey(projectId));
    void loadProject(id);
  };

  const statusLabel: Record<Status, string> = { loading: "Carregando…", saved: "Salvo", dirty: "Alterações não salvas", "unsaved-new": "Novo — não salvo", error: "Erro" };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const p = /\.(xlsx|xls|csv)$/i.test(f.name) ? await importExcel(f) : await importKmz(f);
      if (!p.nodes.length) { setNotice("Nenhum ponto encontrado no arquivo."); return; }
      setProject(p); setSelected(null); setView("map");
      setNotice(`Importado: ${p.nodes.length} caixas, ${p.edges.length} rotas. Toque em Salvar.`);
    } catch (err) { setNotice("Falha ao importar: " + (err as Error).message); }
  };

  const updNode = (n: FNode) => setProject((p) => ({ ...p, nodes: p.nodes.map((x) => (x.id === n.id ? n : x)) }));

  const addNode = (type: NodeType, lng: number, lat: number) => {
    setProject((p) => {
      let parent: FNode | undefined;
      if (type === "cto") {
        const ceos = p.nodes.filter((n) => n.type === "ceo");
        const sel = p.nodes.find((n) => n.id === selected && n.type === "ceo");
        parent = sel ?? ceos.sort((a, b) => Math.hypot(a.lng - lng, a.lat - lat) - Math.hypot(b.lng - lng, b.lat - lat))[0];
      } else parent = p.nodes.find((n) => n.type === "pop");
      if (!parent) { alert(type === "cto" ? "Adicione uma CEO primeiro." : "Sem POP."); return p; }
      const used = childrenOf(p, parent.id).map((c) => c.inputFiber);
      const freeFiber = Array.from({ length: type === "cto" ? 8 : 16 }, (_, i) => i + 1).find((f) => !used.includes(f));
      if (!freeFiber) { alert("Splitter 1:8 sem saídas livres nesta CEO."); return p; }
      const same = p.nodes.filter((n) => n.type === type);
      const num = type === "cto"
        ? String(childrenOf(p, parent.id).length + 1).padStart(2, "0")
        : String(Math.max(450, ...same.map((n) => +n.num || 0)) + 1);
      const node: FNode = { id: newId(), type, name: type === "cto" ? `CTO ${num}` : `CEO Derivação ${num}`, lng, lat, num, inputFiber: freeFiber, clients: Array(8).fill(false) };
      setSelected(node.id);
      return { ...p, nodes: [...p.nodes, node], edges: [...p.edges, { id: newId(), from: parent.id, to: node.id, via: [] }] };
    });
    setMode("view");
  };

  const removeNode = (id: string) => {
    setProject((p) => ({ ...p, nodes: p.nodes.filter((n) => n.id !== id), edges: p.edges.filter((e) => e.from !== id && e.to !== id) }));
    setSelected(null);
  };

  const goMap = (id: string) => { setView("map"); setSelected(id); setTimeout(() => setFocus({ id, ts: Date.now() }), 350); };

  const sel = project.nodes.find((n) => n.id === selected);
  const openNode = project.nodes.find((n) => n.id === open && n.type !== "pop");
  const totalCable = project.nodes.reduce((acc, n) => acc, 0) + project.edges.reduce((a, e) => a + (distanceTo(project, e.to) - distanceTo(project, e.from)), 0);

  const tools: { m: MapMode; icon: typeof Eye; label: string }[] = [
    { m: "view", icon: Eye, label: "Ver" },
    { m: "edit", icon: Move, label: "Editar" },
    { m: "add-ceo", icon: Box, label: "+ CEO" },
    { m: "add-cto", icon: Triangle, label: "+ CTO" },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">{[1, 2, 3, 4, 5, 6].map((i) => <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
          <div>
            <h1>FTTH Vision</h1>
            <p className="font-mono">{project.city}.{project.pop} • {(totalCable / 1000).toFixed(2)} km de cabo</p>
          </div>
        </div>
        <nav className="view-switch">
          <button className={view === "map" ? "is-on" : ""} onClick={() => setView("map")}><MapIcon size={15} /> Mapa 3D</button>
          <button className={view === "timeline" ? "is-on" : ""} onClick={() => setView("timeline")}><GitBranch size={15} /> Linha do tempo</button>
        </nav>
        <div className="flex items-center gap-1">
          <button className="chip-btn" onClick={() => fileRef.current?.click()} aria-label="Importar KMZ ou Excel"><Upload size={14} /> Importar</button>
          <button className="chip-btn is-on" onClick={save} disabled={saving} aria-label="Salvar no banco de dados"><Save size={14} /> {saving ? "Salvando…" : "Salvar"}</button>
          <input ref={fileRef} type="file" accept=".kmz,.kml,.xlsx,.xls,.csv" hidden onChange={onImport} />
          <AccountControl />
        </div>
      </header>
      {notice && <div className="hint" style={{ top: "9.5rem", bottom: "auto", zIndex: 60 }} role="status">{notice}</div>}

      <section className={`view-layer ${view === "map" ? "is-active" : "is-away-back"}`}>
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-muted-foreground">Carregando mapa…</div>}>
          <NetworkMap
            nodes={project.nodes}
            edges={project.edges}
            mode={mode}
            selectedId={selected}
            focus={focus}
            onSelect={setSelected}
            onOpen={setOpen}
            onMoveNode={(id, lng, lat) => setProject((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, lng, lat } : n)) }))}
            onEdgesChange={(edges) => setProject((p) => ({ ...p, edges }))}
            onAddNode={addNode}
          />
        </Suspense>

        <div className="toolbar">
          {tools.map(({ m, icon: I, label }) => (
            <button key={m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}><I size={15} />{label}</button>
          ))}
        </div>
        {mode !== "view" && (
          <div className="hint">
            {mode === "edit" && "Arraste caixas e vértices • toque numa rota para criar vértice • duplo clique remove vértice"}
            {mode === "add-cto" && "Toque no mapa para posicionar a CTO (liga à CEO selecionada ou mais próxima)"}
            {mode === "add-ceo" && "Toque no mapa para posicionar a CEO (liga ao POP)"}
          </div>
        )}
        {sel && (
          <div className="sel-card">
            <div>
              <small>{sel.type.toUpperCase()}</small>
              <b className="font-mono">{nodeCode(project, sel)}</b>
              <span>{Math.round(distanceTo(project, sel.id))} m do POP</span>
            </div>
            <div className="flex gap-1">
              {sel.type !== "pop" && <button className="chip-btn is-on" onClick={() => setOpen(sel.id)}>Abrir 3D</button>}
              <button className="chip-btn" onClick={() => setView("timeline")}><GitBranch size={14} /></button>
              {sel.type !== "pop" && <button className="chip-btn danger" onClick={() => removeNode(sel.id)} aria-label="Excluir"><Trash2 size={14} /></button>}
            </div>
          </div>
        )}
      </section>

      <section className={`view-layer timeline-layer ${view === "timeline" ? "is-active" : "is-away-front"}`}>
        <Timeline project={project} onFocus={goMap} onOpen={setOpen} />
        <div className="tl-footer">
          <label>Cidade<input value={project.city} onChange={(e) => setProject((p) => ({ ...p, city: e.target.value.toUpperCase() }))} /></label>
          <label>Nº POP<input value={project.pop} onChange={(e) => setProject((p) => ({ ...p, pop: e.target.value }))} /></label>
          <button className="chip-btn" onClick={() => { if (confirm("Restaurar projeto exemplo?")) setProject(seedProject()); }}><RotateCcw size={14} /> Exemplo</button>
        </div>
      </section>

      {openNode && <BoxViewer project={project} node={openNode} onClose={() => setOpen(null)} onChange={updNode} />}
    </main>
  );
}
