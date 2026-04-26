import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function OperatingRoomDetails(): JSX.Element {
  return (
    <group>
      <IvDrip position={[-3.4, -1.5, 1.2]} />
      <MonitorCart position={[-4.5, -1.5, 2.4]} />
      <SupplyCabinet position={[-10.5, -1.5, -3]} rotation={[0, Math.PI / 2, 0]} />
      <SupplyCabinet position={[10.5, -1.5, -3]} rotation={[0, -Math.PI / 2, 0]} />
      <BiohazardBin position={[-7, -1.5, 3]} />
      <ScrubSink position={[9.8, -1.5, 2]} rotation={[0, -Math.PI / 2, 0]} />
      <DoorPanel position={[-10.99, 0, 4]} rotation={[0, Math.PI / 2, 0]} />
      <FloorMarkings />
      <CeilingLights />
    </group>
  );
}

function IvDrip({ position }: { position: [number, number, number] }): JSX.Element {
  const bag = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (bag.current) bag.current.rotation.z = Math.sin(clock.elapsedTime * 0.8) * 0.04;
  });
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.6, 8]} />
        <meshStandardMaterial color="#9aa6c0" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Hook */}
      <mesh position={[0.12, 2.55, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.12, 0.015, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#9aa6c0" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* IV bag */}
      <mesh ref={bag} position={[0.22, 2.15, 0]}>
        <boxGeometry args={[0.28, 0.4, 0.08]} />
        <meshStandardMaterial color="#aee7ff" transparent opacity={0.75} roughness={0.2} />
      </mesh>
      {/* Tube */}
      <mesh position={[0.22, 1.6, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 1.2, 6]} />
        <meshStandardMaterial color="#c4d0e6" />
      </mesh>
      {/* Base feet */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 16]} />
        <meshStandardMaterial color="#5a6480" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

function AnesthesiaMachine({ position }: { position: [number, number, number] }): JSX.Element {
  const ledA = useRef<THREE.MeshStandardMaterial>(null);
  const ledB = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ledA.current) ledA.current.emissiveIntensity = 1 + Math.sin(t * 2) * 0.4;
    if (ledB.current) ledB.current.emissiveIntensity = 1 + Math.sin(t * 2.3 + 1) * 0.4;
  });
  return (
    <group position={position}>
      {/* Body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.85, 1.1, 0.6]} />
        <meshStandardMaterial color="#cbd3e3" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Small screen */}
      <mesh position={[0, 1.0, 0.31]}>
        <planeGeometry args={[0.5, 0.3]} />
        <meshStandardMaterial
          color="#0a1026"
          emissive="#5eead4"
          emissiveIntensity={0.4}
        />
      </mesh>
      {/* Dials */}
      <mesh position={[-0.18, 0.6, 0.31]}>
        <cylinderGeometry args={[0.08, 0.08, 0.04, 16]} />
        <meshStandardMaterial color="#2a3250" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.18, 0.6, 0.31]}>
        <cylinderGeometry args={[0.08, 0.08, 0.04, 16]} />
        <meshStandardMaterial color="#2a3250" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* LEDs */}
      <mesh position={[-0.28, 0.85, 0.31]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial ref={ledA} color="#22c55e" emissive="#22c55e" emissiveIntensity={1} />
      </mesh>
      <mesh position={[-0.2, 0.85, 0.31]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial ref={ledB} color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1} />
      </mesh>
      {/* Gas cylinders */}
      <mesh position={[-0.3, -0.5, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.4, 12]} />
        <meshStandardMaterial color="#3b7a3b" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.3, -0.5, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.4, 12]} />
        <meshStandardMaterial color="#3a4868" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Wheels */}
      {[[-0.35, -0.95, 0.25], [0.35, -0.95, 0.25], [-0.35, -0.95, -0.25], [0.35, -0.95, -0.25]].map(
        (p, i) => (
          <mesh key={i} position={[p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.06, 10]} />
            <meshStandardMaterial color="#1a1f32" roughness={0.9} />
          </mesh>
        ),
      )}
    </group>
  );
}

function MonitorCart({ position }: { position: [number, number, number] }): JSX.Element {
  const timeRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);
  const lastSec = useRef(-1);

  useFrame(() => {
    const now = new Date();
    const sec = now.getSeconds();
    if (sec !== lastSec.current) {
      lastSec.current = sec;
      if (timeRef.current) timeRef.current.textContent = fmtTime(now);
      if (dateRef.current) dateRef.current.textContent = fmtDate(now);
    }
  });

  const now = new Date();

  // Screen: 1.2 w × 0.85 h world units, centre at y=1.55 (above stand top at y=1.0)
  // Html:   1.1 × 0.75 inner → 220 × 150 px @ scale 0.5
  return (
    <group position={position}>
      {/* Stand */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.5, 1.0, 0.5]} />
        <meshStandardMaterial color="#8a94ad" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Screen bezel */}
      <mesh position={[0, 1.55, 0]}>
        <boxGeometry args={[1.3, 0.95, 0.09]} />
        <meshStandardMaterial color="#0a0d1a" metalness={0.25} roughness={0.5} />
      </mesh>
      {/* Screen surface — black */}
      <mesh position={[0, 1.55, 0.05]}>
        <planeGeometry args={[1.2, 0.85]} />
        <meshStandardMaterial color="#050505" roughness={0.6} />
      </mesh>
      {/* Live clock — 220×150 px @ scale 0.5 = 1.1×0.75 world units */}
      <Html
        transform
        position={[0, 1.55, 0.06]}
        scale={0.5}
        style={{ pointerEvents: "none" }}
        zIndexRange={[5, 0]}
      >
        <div
          style={{
            width: 220,
            height: 150,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontFamily: "'Share Tech Mono', ui-monospace, monospace",
            userSelect: "none",
          }}
        >
          <div style={{ fontSize: 7, color: "#4ade80", letterSpacing: "0.22em", opacity: 0.65 }}>
            OR TIME
          </div>
          <div
            ref={timeRef}
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#4ade80",
              letterSpacing: "0.06em",
              textShadow: "0 0 8px rgba(74,222,128,0.75)",
            }}
          >
            {fmtTime(now)}
          </div>
          <div
            ref={dateRef}
            style={{ fontSize: 7, color: "#22c55e", letterSpacing: "0.14em", opacity: 0.7 }}
          >
            {fmtDate(now)}
          </div>
        </div>
      </Html>
      {/* Wheels */}
      {[[-0.22, -0.05, 0.22], [0.22, -0.05, 0.22], [-0.22, -0.05, -0.22], [0.22, -0.05, -0.22]].map(
        (p, i) => (
          <mesh key={i} position={[p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.05, 8]} />
            <meshStandardMaterial color="#1a1f32" />
          </mesh>
        ),
      )}
    </group>
  );
}

function SupplyCabinet({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}): JSX.Element {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.6, 2.4, 0.5]} />
        <meshStandardMaterial color="#d2d8e6" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Shelves (glass doors) */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.35 + i * 0.6, 0.26]}>
          <planeGeometry args={[1.45, 0.5]} />
          <meshStandardMaterial
            color="#aed1e0"
            transparent
            opacity={0.25}
            roughness={0.1}
            metalness={0.1}
          />
        </mesh>
      ))}
      {/* Handles */}
      <mesh position={[-0.3, 1.2, 0.27]}>
        <boxGeometry args={[0.05, 0.3, 0.04]} />
        <meshStandardMaterial color="#5a6480" metalness={0.8} />
      </mesh>
      <mesh position={[0.3, 1.2, 0.27]}>
        <boxGeometry args={[0.05, 0.3, 0.04]} />
        <meshStandardMaterial color="#5a6480" metalness={0.8} />
      </mesh>
    </group>
  );
}

function BiohazardBin({ position }: { position: [number, number, number] }): JSX.Element {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.25, 0.22, 0.7, 10]} />
        <meshStandardMaterial color="#ef4444" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.04, 10]} />
        <meshStandardMaterial color="#1a1f32" />
      </mesh>
      <Html
        position={[0, 0.45, 0.26]}
        distanceFactor={6}
        occlude={false}
        transform
        zIndexRange={[10, 0]}
      >
        <div
          style={{
            color: "white",
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textAlign: "center",
            textShadow: "0 0 4px black",
          }}
        >
          BIOHAZARD
        </div>
      </Html>
    </group>
  );
}

function ScrubSink({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}): JSX.Element {
  return (
    <group position={position} rotation={rotation}>
      {/* Basin */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[1.4, 0.25, 0.7]} />
        <meshStandardMaterial color="#dadfec" metalness={0.8} roughness={0.25} />
      </mesh>
      {/* Splashback */}
      <mesh position={[0, 1.5, -0.3]}>
        <boxGeometry args={[1.4, 0.9, 0.05]} />
        <meshStandardMaterial color="#bac4d6" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Faucets */}
      {[-0.3, 0, 0.3].map((x) => (
        <mesh key={x} position={[x, 1.25, -0.22]}>
          <cylinderGeometry args={[0.025, 0.025, 0.35, 8]} />
          <meshStandardMaterial color="#b8c2d6" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
      {/* Support */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.3, 1.0, 0.5]} />
        <meshStandardMaterial color="#c8d0e0" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

function DoorPanel({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}): JSX.Element {
  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <mesh>
        <boxGeometry args={[1.8, 3.2, 0.08]} />
        <meshStandardMaterial color="#2a3250" roughness={0.6} />
      </mesh>
      {/* Door slab */}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[1.6, 3.0, 0.05]} />
        <meshStandardMaterial color="#dde3f0" roughness={0.7} />
      </mesh>
      {/* Window */}
      <mesh position={[0, 0.6, 0.09]}>
        <planeGeometry args={[0.7, 0.9]} />
        <meshStandardMaterial
          color="#0c1224"
          emissive="#1f3d55"
          emissiveIntensity={0.3}
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Kick plate */}
      <mesh position={[0, -1.3, 0.09]}>
        <planeGeometry args={[1.4, 0.3]} />
        <meshStandardMaterial color="#8a94ad" metalness={0.6} roughness={0.4} />
      </mesh>
      <Html
        position={[0, 1.45, 0.1]}
        distanceFactor={4}
        transform
        zIndexRange={[10, 0]}
      >
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.24em",
            color: "#5eead4",
            padding: "3px 10px",
            border: "1px solid #5eead4",
            borderRadius: 3,
            background: "#05070e",
            textAlign: "center",
          }}
        >
          OT-01
        </div>
      </Html>
    </group>
  );
}

function FloorMarkings(): JSX.Element {
  return (
    <group position={[0, -1.49, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Safe zone circle */}
      <mesh>
        <ringGeometry args={[3.2, 3.28, 64]} />
        <meshStandardMaterial color="#3f5070" emissive="#3f5070" emissiveIntensity={0.2} />
      </mesh>
      {/* Sterile box */}
      <mesh position={[0, 0, 0]}>
        <ringGeometry args={[4.5, 4.55, 4]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function CeilingLights(): JSX.Element {
  const rows: Array<[number, number]> = [
    [-6, -5],
    [6, -5],
    [-6, 0],
    [6, 0],
    [-6, 5],
    [6, 5],
  ];
  return (
    <group>
      {rows.map(([x, z], i) => (
        <group key={i} position={[x, 5.42, z]}>
          <mesh>
            <boxGeometry args={[1.8, 0.04, 0.35]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#f4f7ff"
              emissiveIntensity={1.8}
            />
          </mesh>
          <pointLight
            position={[0, -0.3, 0]}
            color="#f4f7ff"
            intensity={1.4}
            distance={14}
            decay={1.6}
          />
        </group>
      ))}
    </group>
  );
}

