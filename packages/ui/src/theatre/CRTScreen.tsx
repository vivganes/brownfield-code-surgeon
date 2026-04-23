import type { CSSProperties, ReactNode } from "react";

export function CRTScreen({
  children,
  width,
  height,
}: {
  children: ReactNode;
  width: number;
  height: number;
}): JSX.Element {
  const wrap: CSSProperties = {
    width,
    height,
    background: "#05070e",
    border: "6px solid #1b2540",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    boxShadow:
      "inset 0 0 40px rgba(94,234,212,0.15), 0 0 20px rgba(0,0,0,0.6)",
  };
  const scanlines: CSSProperties = {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    backgroundImage:
      "repeating-linear-gradient(to bottom, rgba(0,0,0,0.15) 0 2px, transparent 2px 4px)",
    mixBlendMode: "multiply",
  };
  const vignette: CSSProperties = {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
  };
  const inner: CSSProperties = {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    color: "#e6ecff",
    display: "flex",
    flexDirection: "column",
  };
  return (
    <div style={wrap}>
      <div style={inner}>{children}</div>
      <div style={scanlines} />
      <div style={vignette} />
    </div>
  );
}
