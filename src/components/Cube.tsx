import type { CSSProperties, ReactNode } from "react";

interface Props {
  w: number;
  h: number;
  d: number;
  tone?: "pop" | "switch" | "olt" | "dgo" | "ceo" | "cto";
  front?: ReactNode;
  top?: ReactNode;
  side?: ReactNode;
  rx?: number;
  ry?: number;
  spin?: boolean;
}

export function Cube({ w, h, d, tone = "cto", front, top, side, rx = -22, ry = -34, spin }: Props) {
  const style = { "--w": `${w}px`, "--h": `${h}px`, "--d": `${d}px`, "--rx": `${rx}deg`, "--ry": `${ry}deg` } as CSSProperties;
  return (
    <div className="cube-stage" style={{ width: w + d, height: h + d }}>
      <div className={`cube tone-${tone} ${spin ? "cube-spin" : "cube-sway"}`} style={style}>
        <div className="face face-front">{front}</div>
        <div className="face face-back" />
        <div className="face face-right">{side}</div>
        <div className="face face-left" />
        <div className="face face-top">{top}</div>
        <div className="face face-bottom" />
      </div>
    </div>
  );
}
