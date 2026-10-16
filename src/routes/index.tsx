import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Map as MapIcon, GitBranch, Move, Triangle, Box, Eye, Trash2, RotateCcw } from "lucide-react";
import type { MapMode } from "@/components/NetworkMap";
import { Timeline } from "@/components/Timeline";
import { BoxViewer } from "@/components/BoxViewer";
import { childrenOf, distanceTo, newId, nodeCode, seedProject, type FNode, type NodeType, type Project } from "@/lib/ftth";

const NetworkMap = lazy(() => import("@/components/NetworkMap"));

export const Route = createFileRoute("/")({
  ssr: false,
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

const KEY = "ftth-project-v1";

function Index() {
  const [project, setProject] = useState<Project>(seedProject);
  const [view, setView] = useState<"map" | "timeline">("map");
  const [mode, setMode] = useState<MapMode>("view");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; ts: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setProject(JSON.parse(s)); } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(project)); }, [project, loaded]);

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
      </header>

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
