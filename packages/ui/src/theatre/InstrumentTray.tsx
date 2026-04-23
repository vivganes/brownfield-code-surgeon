import { PHASES, type Phase } from "../types";
import { Glyph } from "./Glyph";
import type { GlyphState } from "./useTheatreEvents";

type TrayProps = {
  glyphs: Record<Phase, GlyphState>;
  clickable: boolean;
  onApprove: (phase: Phase) => void;
};

export function InstrumentTray({ glyphs, clickable, onApprove }: TrayProps): JSX.Element {
  // Tray surface in front of the table, tilted toward camera.
  return (
    <group position={[0, -0.35, 1.6]} rotation={[-Math.PI / 10, 0, 0]}>
      {/* Tray base */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[6.8, 0.06, 0.9]} />
        <meshStandardMaterial color="#b3bccd" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[6.6, 0.02, 0.8]} />
        <meshStandardMaterial color="#0f1322" />
      </mesh>

      {PHASES.map((phase, i) => {
        const x = -3.0 + i * 1.0;
        return (
          <Glyph
            key={phase}
            phase={phase}
            index={i}
            state={glyphs[phase]}
            clickable={clickable}
            position={[x, 0.22, 0]}
            onApprove={onApprove}
          />
        );
      })}
    </group>
  );
}
