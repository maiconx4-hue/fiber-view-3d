import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { edgeCoords, fiber, nearestSegment, pathLength, type FEdge, type FNode, type LngLat, type NodeType } from "@/lib/ftth";

export type MapMode = "view" | "edit" | "add-cto" | "add-ceo";

interface Props {
  nodes: FNode[];
  edges: FEdge[];
  mode: MapMode;
  selectedId: string | null;
  focus: { id: string; ts: number } | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  onMoveNode: (id: string, lng: number, lat: number) => void;
  onEdgesChange: (edges: FEdge[]) => void;
  onAddNode: (type: NodeType, lng: number, lat: number) => void;
}

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagens © Esri, Maxar, Earthstar",
    },
    labels: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
    },
    dem: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 14,
    },
  },
  layers: [
    { id: "sat", type: "raster", source: "sat" },
    { id: "labels", type: "raster", source: "labels" },
  ],
  sky: { "sky-color": "#79a8d9", "horizon-color": "#d8e6f2", "fog-color": "#cfdce8", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4 },
};

function edgesGeo(edges: FEdge[], nodes: FNode[]) {
  return {
    type: "FeatureCollection" as const,
    features: edges.flatMap((e) => {
      const c = edgeCoords(e, nodes);
      if (!c) return [];
      const to = nodes.find((n) => n.id === e.to)!;
      const feeder = to.type !== "cto";
      return [{
        type: "Feature" as const,
        properties: { id: e.id, color: feeder ? "#38bdf8" : fiber(to.inputFiber).hex, w: feeder ? 5 : 3.5 },
        geometry: { type: "LineString" as const, coordinates: c },
      }];
    }),
  };
}

export default function NetworkMap(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const live = useRef(props);
  live.current = props;
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);

  const pushEdges = (nodes: FNode[], edges: FEdge[]) => {
    const src = map.current?.getSource("edges") as GeoJSONSource | undefined;
    src?.setData(edgesGeo(edges, nodes));
  };

  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: [-51.0675, 0.0365],
      zoom: 16.3,
      pitch: 62,
      bearing: -24,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    m.on("load", () => {
      try { m.setTerrain({ source: "dem", exaggeration: 1.4 }); } catch { /* sem relevo */ }
      m.addSource("edges", { type: "geojson", data: edgesGeo(live.current.edges, live.current.nodes) });
      m.addLayer({ id: "edges-glow", type: "line", source: "edges", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["*", ["get", "w"], 3.2], "line-opacity": 0.28, "line-blur": 6 } });
      m.addLayer({ id: "edges-casing", type: "line", source: "edges", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0b1220", "line-width": ["+", ["get", "w"], 2.5] } });
      m.addLayer({ id: "edges", type: "line", source: "edges", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["get", "w"] } });
      m.addLayer({ id: "edges-flow", type: "line", source: "edges", layout: { "line-cap": "butt" }, paint: { "line-color": "#ffffff", "line-width": ["*", ["get", "w"], 0.45], "line-opacity": 0.9, "line-dasharray": [0, 4, 3] } });
      m.addLayer({ id: "edges-hit", type: "line", source: "edges", paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0 } });

      // luz percorrendo a fibra
      const seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
      let step = 0;
      const tick = () => {
        if (!map.current) return;
        step = (step + 1) % seq.length;
        if (m.getLayer("edges-flow")) m.setPaintProperty("edges-flow", "line-dasharray", seq[step]);
        setTimeout(() => requestAnimationFrame(tick), 70);
      };
      tick();

      m.on("click", "edges-hit", (e) => {
        const s = live.current;
        if (s.mode !== "edit") return;
        const id = e.features?.[0]?.properties?.id as string;
        const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
        s.onEdgesChange(s.edges.map((ed) => {
          if (ed.id !== id) return ed;
          const c = edgeCoords(ed, s.nodes)!;
          const i = nearestSegment(c, pt);
          const via = [...ed.via];
          via.splice(i, 0, pt);
          return { ...ed, via };
        }));
      });
      m.on("mouseenter", "edges-hit", () => { if (live.current.mode === "edit") m.getCanvas().style.cursor = "copy"; });
      m.on("mouseleave", "edges-hit", () => { m.getCanvas().style.cursor = ""; });
      setReady(true);
    });
    m.on("click", (e) => {
      const s = live.current;
      if (s.mode === "add-cto") s.onAddNode("cto", e.lngLat.lng, e.lngLat.lat);
      else if (s.mode === "add-ceo") s.onAddNode("ceo", e.lngLat.lng, e.lngLat.lat);
    });
    return () => { m.remove(); map.current = null; };
  }, []);

  // marcadores, vértices e medidas
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const { nodes, edges, mode, selectedId } = props;
    pushEdges(nodes, edges);
    const editing = mode === "edit";

    nodes.forEach((n) => {
      const el = document.createElement("div");
      el.className = `node-marker node-${n.type}${selectedId === n.id ? " is-selected" : ""}`;
      el.innerHTML = `<span class="node-shape"${n.type !== "pop" ? ` style="--fc:${fiber(n.inputFiber).hex}"` : ""}></span><span class="node-label">${n.type === "cto" ? "CTO " + n.num : n.type === "ceo" ? "CEO " + n.num : "POP " + n.num}</span>`;
      const mk = new maplibregl.Marker({ element: el, draggable: editing, anchor: n.type === "pop" ? "bottom" : "center" }).setLngLat([n.lng, n.lat]).addTo(m);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const s = live.current;
        if (s.mode === "add-cto" || s.mode === "add-ceo") return;
        s.onSelect(n.id);
        if (s.mode === "view") {
          m.flyTo({ center: [n.lng, n.lat], zoom: 19, pitch: 72, duration: 900, essential: true });
          setTimeout(() => live.current.onOpen(n.id), 750);
        }
      });
      mk.on("drag", () => {
        const p = mk.getLngLat();
        const s = live.current;
        pushEdges(s.nodes.map((x) => (x.id === n.id ? { ...x, lng: p.lng, lat: p.lat } : x)), s.edges);
      });
      mk.on("dragend", () => { const p = mk.getLngLat(); live.current.onMoveNode(n.id, p.lng, p.lat); });
      markers.current.push(mk);
    });

    edges.forEach((e) => {
      const c = edgeCoords(e, nodes);
      if (!c) return;
      // rótulo de medida
      const len = pathLength(c);
      const mid = c[Math.floor((c.length - 1) / 2)]!;
      const nxt = c[Math.floor((c.length - 1) / 2) + 1]!;
      const lbl = document.createElement("div");
      lbl.className = "edge-label";
      lbl.textContent = `${Math.round(len)} m`;
      markers.current.push(new maplibregl.Marker({ element: lbl }).setLngLat([(mid[0] + nxt[0]) / 2, (mid[1] + nxt[1]) / 2]).addTo(m));
      if (!editing) return;
      e.via.forEach((v, i) => {
        const vel = document.createElement("div");
        vel.className = "vertex-marker";
        vel.title = "Arraste para mover • duplo clique remove";
        const vm = new maplibregl.Marker({ element: vel, draggable: true }).setLngLat(v).addTo(m);
        const withVia = (pt: LngLat | null) => live.current.edges.map((ed) => {
          if (ed.id !== e.id) return ed;
          const via = [...ed.via];
          if (pt) via[i] = pt; else via.splice(i, 1);
          return { ...ed, via };
        });
        vm.on("drag", () => { const p = vm.getLngLat(); pushEdges(live.current.nodes, withVia([p.lng, p.lat])); });
        vm.on("dragend", () => { const p = vm.getLngLat(); live.current.onEdgesChange(withVia([p.lng, p.lat])); });
        vel.addEventListener("dblclick", (ev) => { ev.stopPropagation(); live.current.onEdgesChange(withVia(null)); });
        markers.current.push(vm);
      });
    });
  }, [props.nodes, props.edges, props.mode, props.selectedId, ready]);

  useEffect(() => {
    if (!props.focus || !map.current) return;
    const n = props.nodes.find((x) => x.id === props.focus!.id);
    if (n) map.current.flyTo({ center: [n.lng, n.lat], zoom: 18.2, pitch: 65, duration: 1600, essential: true });
  }, [props.focus]);

  return <div ref={box} className={`absolute inset-0 map-mode-${props.mode}`} />;
}
