import JSZip from "jszip";
import * as XLSX from "xlsx";
import { newId, type FEdge, type FNode, type LngLat, type NodeType, type Project } from "./ftth";

// ---------- KMZ / KML ----------

function parseKml(text: string): { nodes: FNode[]; edges: FEdge[] } {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const placemarks = Array.from(doc.getElementsByTagName("Placemark"));
  const nodes: FNode[] = [];
  const edges: FEdge[] = [];
  const byName = new Map<string, FNode>();

  const typeOf = (name: string): NodeType => {
    const n = name.toUpperCase();
    if (n.includes("POP")) return "pop";
    if (n.includes("CEO")) return "ceo";
    return "cto";
  };
  const numOf = (name: string, type: NodeType) => {
    const m = name.match(/(\d+)/g);
    if (type === "pop") return m?.[0] ?? "01";
    return m?.[m.length - 1] ?? String(nodes.length + 1).padStart(2, "0");
  };

  for (const pm of placemarks) {
    const name = pm.getElementsByTagName("name")[0]?.textContent?.trim() || "Sem nome";
    const coordText = pm.getElementsByTagName("coordinates")[0]?.textContent?.trim();
    if (!coordText) continue;
    const pts: LngLat[] = coordText
      .split(/\s+/)
      .map((c) => c.split(",").map(Number))
      .filter((c) => c.length >= 2 && isFinite(c[0]!) && isFinite(c[1]!))
      .map((c) => [c[0]!, c[1]!] as LngLat);
    if (!pts.length) continue;

    if (pm.getElementsByTagName("Point").length > 0) {
      const type = typeOf(name);
      const node: FNode = {
        id: newId(),
        type,
        name,
        lng: pts[0]![0],
        lat: pts[0]![1],
        num: numOf(name, type),
        inputFiber: nodes.filter((n) => n.type !== "pop").length + 1,
        clients: Array(8).fill(false),
      };
      nodes.push(node);
      byName.set(name, node);
    } else if (pm.getElementsByTagName("LineString").length > 0 && pts.length >= 2) {
      // rota: liga ao nó mais próximo das extremidades depois
      edges.push({ id: newId(), from: "", to: "", via: pts.slice(1, -1) });
      (edges[edges.length - 1] as FEdge & { _ends?: LngLat[] })._ends = [pts[0]!, pts[pts.length - 1]!];
    }
  }

  // resolve extremidades das rotas para nós mais próximos
  const nearest = (pt: LngLat) =>
    nodes.reduce<FNode | undefined>((best, n) => {
      const d = Math.hypot(n.lng - pt[0], n.lat - pt[1]);
      return !best || d < Math.hypot(best.lng - pt[0], best.lat - pt[1]) ? n : best;
    }, undefined);

  const resolved: FEdge[] = [];
  for (const e of edges) {
    const ends = (e as FEdge & { _ends?: LngLat[] })._ends!;
    const a = nearest(ends[0]!);
    const b = nearest(ends[1]!);
    if (a && b && a.id !== b.id) resolved.push({ id: e.id, from: a.id, to: b.id, via: e.via });
  }

  // nós sem rota: ligar ao pai mais provável (CTO→CEO mais próxima, CEO→POP)
  const hasEdge = new Set(resolved.flatMap((e) => [e.from, e.to]));
  for (const n of nodes) {
    if (n.type === "pop" || hasEdge.has(n.id)) continue;
    const parentType: NodeType = n.type === "cto" ? "ceo" : "pop";
    const parent = nodes
      .filter((x) => x.type === parentType)
      .sort((a, b) => Math.hypot(a.lng - n.lng, a.lat - n.lat) - Math.hypot(b.lng - n.lng, b.lat - n.lat))[0];
    if (parent) resolved.push({ id: newId(), from: parent.id, to: n.id, via: [] });
  }

  return { nodes, edges: resolved };
}

export async function importKmz(file: File): Promise<Project> {
  let kmlText: string;
  if (file.name.toLowerCase().endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"));
    if (!kmlFile) throw new Error("KMZ sem arquivo KML interno.");
    kmlText = await kmlFile.async("text");
  } else {
    kmlText = await file.text();
  }
  const { nodes, edges } = parseKml(kmlText);
  if (!nodes.length) throw new Error("Nenhum ponto (POP/CEO/CTO) encontrado no arquivo.");
  const pop = nodes.find((n) => n.type === "pop");
  return {
    city: "MCP",
    pop: pop?.num ?? "01",
    nodes,
    edges,
  };
}

// ---------- Excel ----------
// Colunas esperadas (cabeçalho flexível): tipo, nome, numero, longitude, latitud(e), fibra
// e opcionalmente: pai (nome do nó pai) para montar as rotas.

export async function importExcel(file: File): Promise<Project> {
  const wb = XLSX.read(await file.arrayBuffer());
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!rows.length) throw new Error("Planilha vazia.");

  const pick = (r: Record<string, unknown>, ...keys: string[]) => {
    for (const k of Object.keys(r)) {
      const norm = k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      if (keys.includes(norm)) return r[k];
    }
    return "";
  };

  const nodes: FNode[] = [];
  const parentNames: (string | null)[] = [];
  for (const r of rows) {
    const lng = Number(pick(r, "longitude", "lng", "lon", "x"));
    const lat = Number(pick(r, "latitude", "lat", "y"));
    if (!isFinite(lng) || !isFinite(lat) || (!lng && !lat)) continue;
    const tipoRaw = String(pick(r, "tipo", "type", "equipamento")).toUpperCase();
    const type: NodeType = tipoRaw.includes("POP") ? "pop" : tipoRaw.includes("CEO") ? "ceo" : "cto";
    const name = String(pick(r, "nome", "name") || `${type.toUpperCase()} ${nodes.length + 1}`);
    const node: FNode = {
      id: newId(),
      type,
      name,
      lng,
      lat,
      num: String(pick(r, "numero", "num", "n") || nodes.length + 1),
      inputFiber: Number(pick(r, "fibra", "fiber")) || nodes.filter((n) => n.type !== "pop").length + 1,
      clients: Array(8).fill(false),
    };
    nodes.push(node);
    const pai = String(pick(r, "pai", "parent", "origem") || "").trim();
    parentNames.push(pai || null);
  }
  if (!nodes.length) throw new Error("Nenhuma linha com coordenadas válidas (longitude/latitude).");

  const edges: FEdge[] = [];
  nodes.forEach((n, i) => {
    if (n.type === "pop") return;
    const byName = parentNames[i] ? nodes.find((x) => x.name === parentNames[i]) : undefined;
    const parentType: NodeType = n.type === "cto" ? "ceo" : "pop";
    const parent =
      byName ??
      nodes
        .filter((x) => x.type === parentType)
        .sort((a, b) => Math.hypot(a.lng - n.lng, a.lat - n.lat) - Math.hypot(b.lng - n.lng, b.lat - n.lat))[0];
    if (parent) edges.push({ id: newId(), from: parent.id, to: n.id, via: [] });
  });

  const pop = nodes.find((n) => n.type === "pop");
  return { city: "MCP", pop: pop?.num ?? "01", nodes, edges };
}
