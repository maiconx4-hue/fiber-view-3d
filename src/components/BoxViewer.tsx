import { useState } from "react";
import { X, RotateCw } from "lucide-react";
import { Cube } from "./Cube";
import { childrenOf, distanceTo, estimatedPower, fiber, nodeCode, parentOf, type FNode, type Project } from "@/lib/ftth";

interface Props {
  project: Project;
  node: FNode;
  onClose: () => void;
  onChange: (n: FNode) => void;
}

function SplitterSvg({ input, outputs }: { input: string; outputs: { color: string; on: boolean }[] }) {
  return (
    <svg viewBox="0 0 200 130" className="w-full h-full">
      <path d="M8 65 H70" stroke={input} strokeWidth="4" className="svg-flow" />
      <rect x="70" y="40" width="36" height="50" rx="5" className="svg-splitter" />
      <text x="88" y="69" textAnchor="middle" className="svg-text">1:8</text>
      {outputs.map((o, i) => {
        const y = 10 + i * 15.7;
        return (
          <g key={i}>
            <path d={`M106 65 C 135 65, 140 ${y}, 172 ${y}`} stroke={o.color} strokeWidth="2.6" fill="none" className={o.on ? "svg-flow" : ""} opacity={o.on ? 1 : 0.45} />
            <circle cx="182" cy={y} r="5.5" fill={o.on ? o.color : "transparent"} stroke={o.color} strokeWidth="2" />
            <text x="194" y={y + 3} className="svg-num">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function BoxViewer({ project, node, onClose, onChange }: Props) {
  const [spin, setSpin] = useState(false);
  const [ry, setRy] = useState(-30);
  const isCto = node.type === "cto";
  const code = nodeCode(project, node);
  const parent = parentOf(project, node.id);
  const kids = childrenOf(project, node.id);
  const outputs = Array.from({ length: 8 }, (_, i) => ({
    color: fiber(i + 1).hex,
    on: isCto ? node.clients[i] : kids.some((k) => k.inputFiber === i + 1),
  }));
  const power = estimatedPower(project, node.id);
  const [city, pop, der, cto] = code.split(".");

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer" onClick={(e) => e.stopPropagation()}>
        <button className="viewer-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        <div className="viewer-stage">
          <div className="viewer-grid" />
          <Cube
            w={230}
            h={170}
            d={isCto ? 70 : 110}
            tone={isCto ? "cto" : "ceo"}
            rx={-18}
            ry={ry}
            spin={spin}
            front={
              <div className="box-front">
                <div className="box-code">{code}</div>
                <div className="flex-1 min-h-0"><SplitterSvg input={fiber(node.inputFiber).hex} outputs={outputs} /></div>
              </div>
            }
            top={<div className="box-top-label">{isCto ? "CTO" : "CEO"} • 1:8</div>}
            side={<div className="box-side" />}
          />
        </div>
        <div className="viewer-controls">
          <input type="range" min={-90} max={30} value={ry} onChange={(e) => { setSpin(false); setRy(+e.target.value); }} className="flex-1 accent-primary" aria-label="Girar caixa" />
          <button className={`chip-btn ${spin ? "is-on" : ""}`} onClick={() => setSpin((s) => !s)}><RotateCw size={14} /> Girar</button>
        </div>

        <div className="code-break">
          {[["MCP", city, "cidade"], ["POP", pop, "nº POP"], ["DER", der, "derivação"], ...(isCto ? [["CTO", cto, "nº CTO"]] : [])].map(([k, v, d], i) => (
            <div key={k} className="code-seg" style={{ animationDelay: `${i * 90}ms` }}>
              <b>{v}</b><small>{d}</small>
            </div>
          ))}
        </div>

        <div className="viewer-info">
          <label>Nome<input value={node.name} onChange={(e) => onChange({ ...node, name: e.target.value })} /></label>
          <label>{isCto ? "Nº CTO" : "Nº derivação"}<input value={node.num} onChange={(e) => onChange({ ...node, num: e.target.value })} /></label>
          <label>Fibra de entrada
            <select value={node.inputFiber} onChange={(e) => onChange({ ...node, inputFiber: +e.target.value })}>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1} — {fiber(i + 1).name}</option>)}
            </select>
          </label>
          <div className="stat"><span>Alimentação</span><b>{parent ? nodeCode(project, parent) : "—"}</b></div>
          <div className="stat"><span>Distância do POP</span><b>{Math.round(distanceTo(project, node.id))} m</b></div>
          <div className="stat"><span>Potência estimada</span><b className={power < -27 ? "text-destructive" : "text-primary"}>{power.toFixed(2)} dBm</b></div>
        </div>

        {isCto && (
          <div className="ports">
            <div className="ports-title">Portas de atendimento (toque para ocupar/liberar)</div>
            <div className="ports-grid">
              {node.clients.map((on, i) => (
                <button key={i} className={`port ${on ? "is-on" : ""}`} style={{ ["--fc" as string]: fiber(i + 1).hex }}
                  onClick={() => onChange({ ...node, clients: node.clients.map((c, k) => (k === i ? !c : c)) })}>
                  <span />{i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
        {!isCto && (
          <div className="ports">
            <div className="ports-title">Saídas do splitter → CTOs</div>
            {outputs.map((o, i) => {
              const k = kids.find((x) => x.inputFiber === i + 1);
              return <div key={i} className="out-row"><i style={{ background: o.color }} />{i + 1} {fiber(i + 1).name}<b>{k ? nodeCode(project, k) : "livre"}</b></div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
