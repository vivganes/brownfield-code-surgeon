import { Html } from "@react-three/drei";
import type { ReactNode } from "react";
import { CRTScreen } from "./CRTScreen";

export type Panel = { title: string; node: ReactNode };

type MonitorWallProps = {
  panels: Panel[]; // exactly 3: [left, center, right]
  onOpen: (index: number) => void;
};

// With <Html transform> (no distanceFactor) drei uses 1 world unit = 100 px.
// We render HTML at 2x that for crisp text, then compensate with scale={0.5}.
const PX_PER_UNIT = 200;
const SCALE = 0.5;

type Slot = {
  pos: [number, number, number];
  plane: [number, number]; // world meters
};

const SLOTS: Slot[] = [
  { pos: [-8.0, 2.0, 0], plane: [2.4, 1.7] },
  // Center monitor is the Patient Status — sized larger than the side panels
  // for prominence, kept horizontally centered on the wall, and pushed back
  // (z=-0.45) and up (y=3.6) so it doesn't sit in the camera's line to the cat.
  { pos: [0, 3.6, -0.45], plane: [3.8, 2.2] },
  { pos: [8.0, 2.0, 0], plane: [2.4, 1.7] },
];

export function MonitorWall({ panels, onOpen }: MonitorWallProps): JSX.Element {
  return (
    <group position={[0, 0, -7.4]}>
      {SLOTS.map((slot, i) => {
        const p = panels[i];
        const [pw, ph] = slot.plane;
        // HTML px = plane meters × px-per-unit (before scale compensates).
        const htmlW = Math.round(pw * PX_PER_UNIT);
        const htmlH = Math.round(ph * PX_PER_UNIT);
        return (
          <group key={i} position={slot.pos}>
            {/* Bezel */}
            <mesh position={[0, 0, -0.08]}>
              <boxGeometry args={[pw + 0.5, ph + 0.5, 0.15]} />
              <meshStandardMaterial color="#10142a" metalness={0.35} roughness={0.55} />
            </mesh>
            {/* Inner frame highlight */}
            <mesh position={[0, 0, -0.04]}>
              <boxGeometry args={[pw + 0.2, ph + 0.2, 0.06]} />
              <meshStandardMaterial color="#1c2548" metalness={0.4} roughness={0.45} />
            </mesh>
            {/* Dark screen backdrop */}
            <mesh>
              <planeGeometry args={[pw, ph]} />
              <meshStandardMaterial color="#040610" />
            </mesh>
            {/* Screen glow */}
            <pointLight
              position={[0, 0, 0.6]}
              color="#3fe0c4"
              intensity={0.25}
              distance={3}
            />
            <Html
              transform
              position={[0, 0, 0.03]}
              scale={SCALE}
              style={{ pointerEvents: "auto" }}
              zIndexRange={[10, 0]}
            >
              <div
                onClick={() => onOpen(i)}
                style={{
                  cursor: "pointer",
                  width: htmlW,
                  height: htmlH,
                  // Allow pointer events so click fires; block text selection inside miniature.
                  userSelect: "none",
                }}
                title="click to expand"
              >
              <CRTScreen width={htmlW} height={htmlH}>
                {p ? (
                  <>
                    <div
                      style={{
                        flex: "0 0 auto",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 22,
                        textTransform: "uppercase",
                        letterSpacing: "0.22em",
                        color: "#5eead4",
                        padding: "14px 22px",
                        borderBottom: "2px solid #1b2540",
                        background:
                          "linear-gradient(90deg, rgba(94,234,212,0.1), rgba(94,234,212,0))",
                      }}
                    >
                      {p.title}
                    </div>
                    <div
                      style={{
                        flex: "1 1 auto",
                        minHeight: 0,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {p.node}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      padding: 60,
                      color: "#3a4868",
                      fontSize: 40,
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    — offline —
                  </div>
                )}
              </CRTScreen>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
