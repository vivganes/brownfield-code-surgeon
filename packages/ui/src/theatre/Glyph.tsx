import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRef, useState } from "react";
import * as THREE from "three";
import type { GlyphState } from "./useTheatreEvents";
import type { Phase } from "../types";
import { getSoundEngine } from "./audio/SoundEngine";

type GlyphProps = {
  phase: Phase;
  index: number;
  state: GlyphState;
  clickable: boolean;
  position: [number, number, number];
  onApprove: (phase: Phase) => void;
};

const COLOR_BY_STATE: Record<GlyphState, string> = {
  dormant: "#9aa8cc",
  active: "#5eead4",
  "awaiting-approval": "#f59e0b",
  complete: "#60a5fa",
  failed: "#ef4444",
};

// A different primitive per phase — purely abstract.
function GlyphMesh({ index }: { index: number }): JSX.Element {
  switch (index) {
    case 0:
      return (
        <mesh>
          <torusGeometry args={[0.22, 0.07, 12, 24]} />
          <meshStandardMaterial color="white" />
        </mesh>
      );
    case 1:
      return (
        <mesh>
          <coneGeometry args={[0.22, 0.42, 4]} />
          <meshStandardMaterial color="white" flatShading />
        </mesh>
      );
    case 2:
      return (
        <mesh>
          <octahedronGeometry args={[0.28, 0]} />
          <meshStandardMaterial color="white" flatShading />
        </mesh>
      );
    case 3:
      return (
        <mesh>
          <dodecahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial color="white" flatShading />
        </mesh>
      );
    case 4:
      return (
        <mesh rotation={[Math.PI / 4, 0, Math.PI / 4]}>
          <boxGeometry args={[0.38, 0.38, 0.38]} />
          <meshStandardMaterial color="white" flatShading />
        </mesh>
      );
    case 5:
      return (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusKnotGeometry args={[0.2, 0.06, 64, 8]} />
          <meshStandardMaterial color="white" />
        </mesh>
      );
    default:
      return (
        <mesh>
          <tetrahedronGeometry args={[0.32, 0]} />
          <meshStandardMaterial color="white" flatShading />
        </mesh>
      );
  }
}

export function Glyph({
  phase,
  index,
  state,
  clickable,
  position,
  onApprove,
}: GlyphProps): JSX.Element {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const [hover, setHover] = useState(false);
  const pressedAt = useRef<number | null>(null);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    let scale = 1;
    let emissive = 0.4;
    switch (state) {
      case "dormant":
        emissive = 0.1;
        break;
      case "active":
        scale = 1 + Math.sin(t * 2 + index) * 0.03;
        emissive = 0.6 + Math.sin(t * 2 + index) * 0.2;
        break;
      case "awaiting-approval": {
        const flash = (Math.sin(t * 8) + 1) / 2;
        scale = 1 + flash * 0.1;
        emissive = 0.8 + flash * 1.2;
        break;
      }
      case "complete":
        emissive = 0.8;
        break;
      case "failed": {
        const strobe = Math.sin(t * 14) > 0 ? 1 : 0.1;
        emissive = 0.3 + strobe * 1.2;
        break;
      }
    }

    // Press-punch: squish down then overshoot back up over ~350ms.
    if (pressedAt.current !== null) {
      const p = (performance.now() - pressedAt.current) / 1000;
      if (p < 0.08) {
        scale *= 0.58 + p / 0.08 * 0.42; // compress to 0.58
      } else if (p < 0.22) {
        scale *= 1.0 + Math.sin(((p - 0.08) / 0.14) * Math.PI) * 0.28; // overshoot
      } else if (p < 0.38) {
        scale *= 1.0; // settle
      } else {
        pressedAt.current = null;
      }
    }

    group.current.scale.setScalar(scale * (hover && clickable ? 1.1 : 1));
    group.current.rotation.y = t * 0.3 + index;
    if (light.current) light.current.intensity = emissive * 2;

    // Apply color to child material
    group.current.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && "emissive" in m) {
        m.color.set(COLOR_BY_STATE[state]);
        m.emissive.set(COLOR_BY_STATE[state]);
        m.emissiveIntensity = emissive;
      }
    });
  });

  const isApproval = state === "awaiting-approval" && clickable;

  return (
    <group position={position}>
      <group
        ref={group}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (isApproval) setHover(true);
          if (isApproval) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!isApproval) return;
          pressedAt.current = performance.now();
          getSoundEngine().approvalClick();
          onApprove(phase);
        }}
      >
        <GlyphMesh index={index} />
        <pointLight ref={light} color={COLOR_BY_STATE[state]} distance={1.6} intensity={0.4} />
      </group>

      <Html
        position={[0, -0.42, 0]}
        center
        distanceFactor={5}
        occlude={false}
        zIndexRange={[20, 0]}
      >
        <div
          style={{
            color: COLOR_BY_STATE[state],
            fontFamily: "ui-monospace, monospace",
            fontSize: 18,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            whiteSpace: "nowrap",
            textShadow: "0 0 6px rgba(0,0,0,0.85)",
            textAlign: "center",
          }}
        >
          <div>{phase}{state === "complete" ? " ✓" : ""}</div>
          {isApproval && (
            <div style={{ fontSize: 13, letterSpacing: "0.12em", marginTop: 3 }}>
              ▸ click to approve
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
