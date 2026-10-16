// Código de cores ABNT (NBR 14721 / 14160) para fibras ópticas — ordem 1 a 12
export const ABNT = [
  { n: 1, name: "Verde", hex: "#16a34a" },
  { n: 2, name: "Amarelo", hex: "#facc15" },
  { n: 3, name: "Branco", hex: "#f1f5f9" },
  { n: 4, name: "Azul", hex: "#2563eb" },
  { n: 5, name: "Vermelho", hex: "#dc2626" },
  { n: 6, name: "Violeta", hex: "#7c3aed" },
  { n: 7, name: "Marrom", hex: "#7c4a1e" },
  { n: 8, name: "Rosa", hex: "#f472b6" },
  { n: 9, name: "Preto", hex: "#111111" },
  { n: 10, name: "Cinza", hex: "#9ca3af" },
  { n: 11, name: "Laranja", hex: "#f97316" },
  { n: 12, name: "Aqua", hex: "#22d3ee" },
] as const;

export const fiber = (n: number) => ABNT[(Math.max(1, n) - 1) % 12]!;

export type NodeType = "pop" | "ceo" | "cto";
export type LngLat = [number, number];

export interface FNode {
  id: string;
  type: NodeType;
  name: string;
  lng: number;
  lat: number;
  num: string; // POP: nº pop | CEO: nº derivação | CTO: nº da CTO
  inputFiber: number; // fibra (cor ABNT) que alimenta este nó
  clients: boolean[]; // 8 portas do splitter 1:8
}

export interface FEdge {
  id: string;
  from: string;
  to: string;
  via: LngLat[];
}

export interface Project {
  city: string;
  pop: string;
  nodes: FNode[];
  edges: FEdge[];
}

const uid = () => Math.random().toString(36).slice(2, 9);
export const newId = uid;

export function seedProject(): Project {
  const pop: FNode = { id: "pop", type: "pop", name: "POP Central", lng: -51.0712, lat: 0.0338, num: "05", inputFiber: 1, clients: Array(8).fill(false) };
  const ceo: FNode = { id: "ceo1", type: "ceo", name: "CEO Derivação 451", lng: -51.0668, lat: 0.0372, num: "451", inputFiber: 1, clients: Array(8).fill(false) };
  const ctoPos: LngLat[] = [
    [-51.0652, 0.0389],
    [-51.0641, 0.0366],
    [-51.0675, 0.0397],
    [-51.0685, 0.0381],
  ];
  const ctos: FNode[] = ctoPos.map(([lng, lat], i) => ({
    id: `cto${i + 1}`,
    type: "cto",
    name: `CTO ${String(i + 1).padStart(2, "0")}`,
    lng,
    lat,
    num: String(i + 1).padStart(2, "0"),
    inputFiber: i + 1,
    clients: Array.from({ length: 8 }, (_, k) => k < 3 + i),
  }));
  const edges: FEdge[] = [
    { id: "e0", from: "pop", to: "ceo1", via: [[-51.0698, 0.0352], [-51.0681, 0.0360]] },
    ...ctos.map((c, i) => ({ id: `e${i + 1}`, from: "ceo1", to: c.id, via: [] as LngLat[] })),
  ];
  return { city: "MCP", pop: "05", nodes: [pop, ceo, ...ctos], edges };
}

export function haversine(a: LngLat, b: LngLat) {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b[1] - a[1]);
  const dLng = toR(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function edgeCoords(e: FEdge, nodes: FNode[]): LngLat[] | null {
  const a = nodes.find((n) => n.id === e.from);
  const b = nodes.find((n) => n.id === e.to);
  if (!a || !b) return null;
  return [[a.lng, a.lat], ...e.via, [b.lng, b.lat]];
}

export function pathLength(coords: LngLat[]) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}

export function parentOf(p: Project, id: string) {
  const e = p.edges.find((x) => x.to === id);
  return e ? p.nodes.find((n) => n.id === e.from) : undefined;
}

export function childrenOf(p: Project, id: string) {
  return p.edges.filter((e) => e.from === id).map((e) => p.nodes.find((n) => n.id === e.to)!).filter(Boolean);
}

export function nodeCode(p: Project, n: FNode) {
  if (n.type === "pop") return `${p.city}.${p.pop}`;
  if (n.type === "ceo") return `${p.city}.${p.pop}.${n.num}`;
  const ceo = parentOf(p, n.id);
  return `${p.city}.${p.pop}.${ceo?.num ?? "000"}.${n.num}`;
}

export function distanceTo(p: Project, id: string): number {
  const e = p.edges.find((x) => x.to === id);
  if (!e) return 0;
  const c = edgeCoords(e, p.nodes);
  return (c ? pathLength(c) : 0) + distanceTo(p, e.from);
}

// Orçamento óptico simplificado
export const OLT_TX_DBM = 5;
export function estimatedPower(p: Project, id: string) {
  const km = distanceTo(p, id) / 1000;
  const n = p.nodes.find((x) => x.id === id);
  const splitters = n?.type === "cto" ? 2 : n?.type === "ceo" ? 1 : 0;
  const loss = km * 0.35 + splitters * 10.5 + 4 * 0.5 + 2 * 0.1;
  return OLT_TX_DBM - loss;
}

export function nearestSegment(coords: LngLat[], pt: LngLat) {
  let best = 0;
  let bd = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const [ax, ay] = coords[i - 1] as LngLat;
    const [bx, by] = coords[i] as LngLat;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = (ax + t * dx - pt[0]) ** 2 + (ay + t * dy - pt[1]) ** 2;
    if (d < bd) { bd = d; best = i - 1; }
  }
  return best; // índice do segmento → inserir em via[best]
}
