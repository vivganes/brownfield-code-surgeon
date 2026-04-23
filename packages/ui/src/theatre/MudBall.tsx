import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

type MudBallProps = {
  label: string;
  lastArtifactTs: number;
};

export function MudBall({ label, lastArtifactTs }: MudBallProps): JSX.Element {
  const mesh = useRef<THREE.Mesh>(null);
  const geom = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.55, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = 0.55 + (Math.random() - 0.5) * 0.18;
      const len = Math.hypot(x, y, z) || 1;
      pos.setXYZ(i, (x / len) * r, (y / len) * r, (z / len) * r);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  const rippleStart = useRef(0);
  const lastSeen = useRef(0);
  useFrame(({ clock }) => {
    if (lastArtifactTs !== lastSeen.current) {
      lastSeen.current = lastArtifactTs;
      if (lastArtifactTs > 0) rippleStart.current = clock.elapsedTime;
    }
    if (mesh.current) {
      const t = clock.elapsedTime - rippleStart.current;
      const s = 1 + Math.max(0, Math.sin(t * 10) * Math.exp(-t * 2)) * 0.08;
      mesh.current.scale.setScalar(s);
      mesh.current.rotation.y += 0.002;
    }
  });

  return (
    <group position={[0, -0.28, 0]}>
      <mesh ref={mesh} geometry={geom} castShadow>
        <meshStandardMaterial color="#6b4a2a" roughness={1} />
      </mesh>
      <Html
        position={[0, 0.8, 0]}
        center
        distanceFactor={6}
        occlude={false}
        zIndexRange={[20, 0]}
      >
        <div
          style={{
            color: "#e6ecff",
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            background: "rgba(10,14,32,0.7)",
            padding: "2px 6px",
            borderRadius: 3,
            border: "1px solid #22284a",
            whiteSpace: "nowrap",
          }}
        >
          patient: {label}
        </div>
      </Html>
    </group>
  );
}
