import { Html } from "@react-three/drei";
import { useEffect, useState } from "react";

type Props = {
  onClick: () => void;
};

// Small icon — 0.55 × 0.65 world units
const PX_PER_UNIT = 200;
const SCALE = 0.5;
const htmlW = Math.round(0.55 * PX_PER_UNIT); // 110px
const htmlH = Math.round(0.65 * PX_PER_UNIT); // 130px

export function PlanArtifactCard({ onClick }: Props): JSX.Element {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <group>
      {/* Thin backing plate flush against the wall */}
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[0.62, 0.74, 0.03]} />
        <meshStandardMaterial color="#0e0b1e" metalness={0.2} roughness={0.7} />
      </mesh>
      {/* Purple glow */}
      <pointLight
        position={[0.15, 0, 0.4]}
        color="#a78bfa"
        intensity={entered ? 0.18 : 0}
        distance={1.8}
      />
      <Html
        transform
        position={[0, 0, 0.02]}
        scale={SCALE}
        style={{ pointerEvents: "auto" }}
        zIndexRange={[8, 0]}
      >
        {/* scaleX(-1) un-mirrors text caused by the Y-rotation on the parent group */}
        <div style={{ transform: "scaleX(-1)" }}>
          <div
            onClick={onClick}
            title="View operative plan (plan.md)"
            style={{
              cursor: "pointer",
              width: htmlW,
              height: htmlH,
              background: "#07091c",
              border: `1px solid ${entered ? "#3d2d7a" : "transparent"}`,
              borderRadius: 6,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontFamily: "ui-monospace, monospace",
              opacity: entered ? 1 : 0,
              transform: entered ? "scale(1)" : "scale(0.75)",
              transition: [
                "opacity 0.5s cubic-bezier(0.16,1,0.3,1)",
                "transform 0.5s cubic-bezier(0.16,1,0.3,1)",
                "border-color 0.5s ease",
                "box-shadow 0.5s ease",
              ].join(", "),
              boxShadow: entered
                ? "0 0 18px rgba(167,139,250,0.28), inset 0 0 20px rgba(167,139,250,0.05)"
                : "none",
              userSelect: "none",
            }}
          >
            {/* Icon */}
            <div style={{ fontSize: 36, lineHeight: 1, color: "#a78bfa" }}>◈</div>
            {/* Label */}
            <div
              style={{
                color: "#c4b5fd",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              PLAN
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}
