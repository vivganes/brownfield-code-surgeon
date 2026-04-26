import { Html } from "@react-three/drei";
import { useEffect, useState } from "react";

type Props = {
  onClick: () => void;
};

const PX_PER_UNIT = 200;
const SCALE = 0.5;
const htmlW = Math.round(0.55 * PX_PER_UNIT); // 110px
const htmlH = Math.round(0.65 * PX_PER_UNIT); // 130px

export function SeamsArtifactCard({ onClick }: Props): JSX.Element {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <group>
      {/* Thin backing plate flush against the right wall */}
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[0.62, 0.74, 0.03]} />
        <meshStandardMaterial color="#071a0e" metalness={0.2} roughness={0.7} />
      </mesh>
      {/* Emerald glow */}
      <pointLight
        position={[-0.15, 0, 0.4]}
        color="#34d399"
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
            title="View seams & dependencies (seams-and-dependencies.md)"
            style={{
              cursor: "pointer",
              width: htmlW,
              height: htmlH,
              background: "#04100a",
              border: `1px solid ${entered ? "#166534" : "transparent"}`,
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
                ? "0 0 18px rgba(52,211,153,0.28), inset 0 0 20px rgba(52,211,153,0.05)"
                : "none",
              userSelect: "none",
            }}
          >
            {/* Icon */}
            <div style={{ fontSize: 36, lineHeight: 1, color: "#34d399" }}>⬡</div>
            {/* Label */}
            <div
              style={{
                color: "#6ee7b7",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              SEAMS
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}
