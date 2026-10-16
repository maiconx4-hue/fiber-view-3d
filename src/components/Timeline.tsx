import { MapPin } from "lucide-react";
import { Cube } from "./Cube";
import { ABNT, childrenOf, distanceTo, estimatedPower, fiber, nodeCode, type Project } from "@/lib/ftth";

interface Props {
  project: Project;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}

function Link({ color = "#38bdf8", label }: { color?: string; label?: string }) {
  return (
    <div className="tl-link">
      <div className="fiber-line" style={{ ["--fc" as string]: color }} />
      {label && <span className="tl-link-label">{label}</span>}
    </div>
  );
}

function Stage({ title, sub, children, onClick, delay = 0 }: { title: string; sub: string; children: React.ReactNode; onClick?: () => void; delay?: number }) {
  return (
    <button type="button" onClick={onClick} className="tl-stage" style={{ animationDelay: `${delay}ms` }}>
      <div className="tl-device">{children}</div>
      <div className="tl-title">{title}</div>
      <div className="tl-sub">{sub}</div>
    </button>
  );
}

const portRow = (n: number, from = 1) => (
  <div className="port-row">
    {Array.from({ length: n }, (_, i) => (
      <span key={i} className="port-dot" style={{ background: fiber(from + i).hex }} />
    ))}
  </div>
);

export function Timeline({ project, onFocus, onOpen }: Props) {
  const pop = project.nodes.find((n) => n.type === "pop");
  const ceos = project.nodes.filter((n) => n.type === "ceo");
  return (
    <div className="timeline-scroll">
      <div className="tl-legend">
        {ABNT.map((f) => (
          <span key={f.n} className="legend-chip"><i style={{ background: f.hex }} />{f.n} {f.name}</span>
        ))}
      </div>
      {ceos.map((ceo, ci) => {
        const ctos = childrenOf(project, ceo.id);
        return (
          <div key={ceo.id} className="tl-row">
            <Stage title="POP" sub={pop ? `${nodeCode(project, pop)} • ${pop.name}` : "—"} onClick={() => pop && onFocus(pop.id)}>
              <Cube w={58} h={70} d={44} tone="pop" front={<div className="rack-lines" />} />
            </Stage>
            <Link />
            <Stage title="Switch" sub="Agregação 10G" delay={120}>
              <Cube w={76} h={18} d={46} tone="switch" front={portRow(8)} />
            </Stage>
            <Link />
            <Stage title="OLT" sub="GPON • +5 dBm" delay={240}>
              <Cube w={76} h={34} d={50} tone="olt" front={portRow(8)} />
            </Stage>
            <Link color={fiber(ceo.inputFiber).hex} label={`PON ${ceo.inputFiber}`} />
            <Stage title="Portas PON" sub="16 portas" delay={360}>
              <div className="pon-grid">{Array.from({ length: 16 }, (_, i) => <span key={i} className={i + 1 === ceo.inputFiber ? "on" : ""} style={{ background: fiber(i + 1).hex }} />)}</div>
            </Stage>
            <Link color={fiber(ceo.inputFiber).hex} />
            <Stage title="DGO" sub="Distribuidor óptico" delay={480}>
              <Cube w={60} h={42} d={36} tone="dgo" front={portRow(12)} />
            </Stage>
            <Link color={fiber(ceo.inputFiber).hex} label={`${Math.round(distanceTo(project, ceo.id))} m`} />
            <Stage title={`CEO ${ceo.num}`} sub={`Splitter 1:8 • ${estimatedPower(project, ceo.id).toFixed(1)} dBm`} onClick={() => onOpen(ceo.id)} delay={600}>
              <Cube w={40} h={64} d={40} tone="ceo" front={<div className="splitter-mini">1:8</div>} />
            </Stage>
            <div className="tl-fan">
              {ctos.length === 0 && <div className="tl-sub">Sem CTOs — adicione no mapa</div>}
              {ctos.map((c, i) => {
                const used = c.clients.filter(Boolean).length;
                return (
                  <div key={c.id} className="tl-fan-item" style={{ animationDelay: `${700 + i * 90}ms` }}>
                    <Link color={fiber(c.inputFiber).hex} label={`F${c.inputFiber} • ${Math.round(distanceTo(project, c.id) - distanceTo(project, ceo.id))} m`} />
                    <button type="button" className="cto-chip" onClick={() => onOpen(c.id)}>
                      <span className="tri" style={{ ["--fc" as string]: fiber(c.inputFiber).hex }} />
                      <span className="flex flex-col items-start">
                        <b className="font-mono">{nodeCode(project, c)}</b>
                        <small>{used}/8 portas • {estimatedPower(project, c.id).toFixed(1)} dBm</small>
                      </span>
                    </button>
                    <button type="button" className="tl-pin" title="Ver no mapa" onClick={() => onFocus(c.id)}><MapPin size={14} /></button>
                  </div>
                );
              })}
            </div>
            {ci === 0 && null}
          </div>
        );
      })}
    </div>
  );
}
