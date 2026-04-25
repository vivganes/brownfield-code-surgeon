import { useFrame } from "@react-three/fiber";
import { Html, useGLTF, useAnimations } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Phase } from "../types";
import type { GlyphState } from "./useTheatreEvents";

// Toon Cat FREE model (Omabuarts Studio, CC-BY-4.0).
// See public/models/license.txt for the full attribution.
const CAT_MODEL_URL = "/models/toon_cat_free.glb";
useGLTF.preload(CAT_MODEL_URL);

// ---------------------------------------------------------------------------
// Patient: the codebase represented as a sick cat on the operating table.
//
// 7 phases drive the visual:
//   plan      -> overhead laser scan sweeps the body
//   map       -> file-name labels pinned to body parts as "seams"
//   break     -> thorny vines dissolve and fall away
//   cover     -> stitches appear along seams
//   implement -> shimmer pass: dull fur becomes vivid (new growth)
//   refactor  -> bloom/glow, gentle wag
//   finish    -> cat stands and trots out of frame
//
// Cat body is built from primitives for now (no external asset).
// To swap in the Toon Cat FREE (CC-BY-4.0) GLB later, replace
// `<PrimitiveCat ... />` with a `useGLTF(...)` based component; everything
// else (vines / laser / labels / stitches / glow / trot) is asset-agnostic.
// ---------------------------------------------------------------------------

type PatientProps = {
  phase: Phase | null;
  glyphs: Record<Phase, GlyphState>;
  lastArtifactTs: number;
  finishedTs: number;
  repoName: string;
};

const HEALTHY = new THREE.Color("#d8a26b"); // warm tabby
const SICK = new THREE.Color("#5c5e6a"); // dull grey

// Choreography constants.
const TABLE_TOP_Y = -0.44; // matches OperatingTable's top surface
const FLOOR_Y = -1.5; // approx ground (legs are 1.0 tall under the table)
const FLOOR_DELTA_Y = FLOOR_Y - TABLE_TOP_Y;
const TABLE_EDGE_X = 1.65; // table half-width 1.6 + a bit

function healthForPhase(
  phase: Phase | null,
  glyphs: Record<Phase, GlyphState>,
): number {
  // 0 = sick, 1 = healthy. Progresses across phases.
  let h = 0;
  if (glyphs.break === "complete") h = Math.max(h, 0.25);
  if (glyphs.cover === "complete") h = Math.max(h, 0.45);
  if (glyphs.implement === "complete") h = Math.max(h, 0.75);
  if (glyphs.refactor === "complete") h = Math.max(h, 1.0);
  if (phase === "finish") h = 1.0;
  return h;
}

export function Patient({
  phase,
  glyphs,
  lastArtifactTs,
  finishedTs,
  repoName,
}: PatientProps): JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const targetHealth = healthForPhase(phase, glyphs);

  // Trot-away choreography on finish: walk to edge → jump down → walk on floor.
  // Reset on new iteration.
  const trotStart = useRef<number | null>(null);
  useEffect(() => {
    if (finishedTs === 0) {
      trotStart.current = null;
      if (groupRef.current) {
        groupRef.current.position.x = 0;
        groupRef.current.position.y = TABLE_TOP_Y;
      }
    }
  }, [finishedTs]);

  useFrame(({ clock }, dt) => {
    const g = groupRef.current;
    if (!g) return;

    if (finishedTs > 0 && trotStart.current === null) {
      trotStart.current = clock.elapsedTime;
    }
    const breath = 1 + Math.sin(clock.elapsedTime * 1.2) * 0.015;
    g.scale.setScalar(breath);

    if (trotStart.current !== null) {
      const t = clock.elapsedTime - trotStart.current;
      const T_WALK = 1.1; // walk to table edge
      const T_JUMP = 0.7; // jump down arc
      let x: number;
      let dy: number; // delta from TABLE_TOP_Y (negative = below table)
      if (t < T_WALK) {
        // Walking on the table surface to the edge.
        x = (t / T_WALK) * TABLE_EDGE_X;
        dy = 0;
      } else if (t < T_WALK + T_JUMP) {
        // Parabolic jump to floor.
        const u = (t - T_WALK) / T_JUMP; // 0..1
        x = TABLE_EDGE_X + u * 0.35;
        const hop = -4 * (u - 0.5) * (u - 0.5) + 1; // 0..1..0
        dy = hop * 0.18 + u * (FLOOR_DELTA_Y);
      } else {
        // Walking on the floor away from the table.
        const u = t - (T_WALK + T_JUMP);
        x = TABLE_EDGE_X + 0.35 + u * 1.3;
        dy = FLOOR_DELTA_Y;
      }
      g.position.x = x;
      g.position.y = TABLE_TOP_Y + dy;
    } else {
      g.position.x = 0;
      g.position.y = TABLE_TOP_Y;
    }
    void dt;
  });

  return (
    <group ref={groupRef} position={[0, TABLE_TOP_Y, 0]}>
      <Suspense fallback={null}>
        <CatModel
          targetHealth={targetHealth}
          phase={phase}
          finishedTs={finishedTs}
        />
      </Suspense>
      <Vines glyphs={glyphs} />
      {phase === "plan" && <LaserScan />}
      {phase === "map" && <SeamLabels repoName={repoName} />}
      {glyphs.break !== "complete" && <BloodDrips />}
      {phase === "implement" && (
        <ImplementShimmer lastArtifactTs={lastArtifactTs} />
      )}
      {(phase === "refactor" || phase === "finish") && <RefactorGlow />}
      <PatientLabel repoName={repoName} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// CatModel — Toon Cat FREE GLB, tinted/animated per phase.
// Tweak SCALE / Y_OFFSET if the model sits wrong on the table.
// ---------------------------------------------------------------------------

// Target on-table dimensions (cat lying down, looking sideways).
const CAT_TARGET_LENGTH = 1.5; // along longest axis
const CAT_Y_OFFSET = 0.0; // additional lift from the table top

const SICK_TINT = new THREE.Color(0.55, 0.55, 0.62);
const HEALTHY_TINT = new THREE.Color(1.0, 1.0, 1.0);

function CatModel({
  targetHealth,
  phase,
  finishedTs,
}: {
  targetHealth: number;
  phase: Phase | null;
  finishedTs: number;
}): JSX.Element {
  const { scene, animations } = useGLTF(CAT_MODEL_URL);

  // Clone scene + materials so we can mutate per-instance without affecting
  // the cached gltf. Capture original colours so we can re-tint each frame.
  // Auto-fit: compute bbox and derive a uniform scale so the cat's longest
  // axis equals CAT_TARGET_LENGTH, and lift it so its feet rest on y=0.
  const { instance, tinted, autoScale, autoLift } = useMemo(() => {
    // Use the loaded scene directly. We only render one Patient, so sharing
    // the cached gltf hierarchy is safe. We DO clone materials below so that
    // per-frame tinting is per-instance and survives unmount/remount.
    // (SkeletonUtils.clone produced invisible skinned geometry on this GLB,
    // hence the no-clone approach.)
    const root = scene;
    const tintedMats: {
      mat: THREE.MeshStandardMaterial;
      original: THREE.Color;
    }[] = [];
    root.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const mat = m.material;
      const list = Array.isArray(mat) ? mat : [mat];
      const cloned = list.map((src) => {
        const c = src.clone();
        if (c instanceof THREE.MeshStandardMaterial) {
          tintedMats.push({ mat: c, original: c.color.clone() });
        }
        return c;
      });
      m.material = Array.isArray(mat) ? cloned : cloned[0]!;
    });

    // Bounding box at unit scale.
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const scale = CAT_TARGET_LENGTH / longest;
    // After scaling, lift so the bottom sits at y=0.
    const lift = -box.min.y * scale;

    void lift;

    // Bake scale onto the root and rebuild matrices, then recompute the
    // post-bake bbox so we can lift correctly. Parent-scaling a SkinnedMesh
    // by 5+ orders of magnitude can render incorrectly; baking onto the
    // root and updating matrix world avoids that.
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    const bakedBox = new THREE.Box3().setFromObject(root);
    const bakedLift = -bakedBox.min.y;

    return {
      instance: root,
      tinted: tintedMats,
      autoScale: scale,
      autoLift: bakedLift,
    };
  }, [scene]);

  // Animation mixer — play whatever the GLB ships with (idle/walk loop).
  const groupRef = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(animations, groupRef);
  useEffect(() => {
    const first = Object.values(actions)[0];
    if (first) {
      first.reset().play();
      first.timeScale = 0.0; // start frozen — sick cat doesn't move
    }
  }, [actions]);

  // Drive tint, emissive, and animation speed from health each frame.
  const currentHealth = useRef(0);
  useFrame((_, dt) => {
    currentHealth.current = THREE.MathUtils.damp(
      currentHealth.current,
      targetHealth,
      1.4,
      dt,
    );
    const h = currentHealth.current;

    const tint = SICK_TINT.clone().lerp(HEALTHY_TINT, h);
    const glow =
      phase === "refactor" || phase === "finish" ? 0.35 * h : 0.0;
    for (const { mat, original } of tinted) {
      mat.color.copy(original).multiply(tint);
      mat.emissive.copy(original).multiplyScalar(glow);
    }

    // Anim speed: frozen when very sick → full speed when healthy or trotting.
    const first = Object.values(actions)[0];
    if (first) {
      const target =
        finishedTs > 0 ? 1.4 : phase === "implement" ? 0.5 : 0.2 + h * 0.8;
      first.timeScale = THREE.MathUtils.damp(
        first.timeScale,
        target,
        2.0,
        dt,
      );
    }
    mixer.update(dt);
  });

  return (
    <group
      ref={groupRef}
      position={[0, autoLift + CAT_Y_OFFSET, 0]}
      rotation={[0, Math.PI * 0.15, 0]}
    >
      <primitive object={instance} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// PrimitiveCat — original primitives-only fallback. Kept for emergencies.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PrimitiveCat({
  targetHealth,
  phase,
  finishedTs,
}: {
  targetHealth: number;
  phase: Phase | null;
  finishedTs: number;
}): JSX.Element {
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);

  const currentHealth = useRef(0);
  useFrame((_, dt) => {
    // Smoothly interpolate body colour and emissive toward targetHealth.
    currentHealth.current = THREE.MathUtils.damp(
      currentHealth.current,
      targetHealth,
      1.4,
      dt,
    );
    if (bodyMat.current) {
      const c = SICK.clone().lerp(HEALTHY, currentHealth.current);
      bodyMat.current.color.copy(c);
      // Glow ramps up during refactor/finish.
      const glow =
        phase === "refactor" || phase === "finish"
          ? 0.35 * currentHealth.current
          : 0.0;
      bodyMat.current.emissive.copy(c).multiplyScalar(glow);
    }
    // Head lift: sick = head down, healthy = head up.
    if (headRef.current) {
      const lift = THREE.MathUtils.lerp(-0.05, 0.12, currentHealth.current);
      headRef.current.position.y = 0.18 + lift;
      // Slight head bob on finish.
      if (finishedTs > 0) {
        headRef.current.position.y +=
          Math.sin(performance.now() * 0.004) * 0.01;
      }
    }
    // Tail wag intensifies as health rises.
    if (tailRef.current) {
      const wag =
        Math.sin(performance.now() * 0.005) *
        (0.05 + 0.35 * currentHealth.current);
      tailRef.current.rotation.z = wag;
    }
  });

  return (
    <group>
      {/* Body — flattened sphere "loaf" */}
      <mesh castShadow position={[0, 0.05, 0]} scale={[0.6, 0.32, 0.42]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial
          ref={bodyMat}
          color={SICK}
          roughness={0.85}
          metalness={0.0}
        />
      </mesh>

      {/* Head */}
      <group ref={headRef} position={[0.42, 0.18, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.18, 20, 16]} />
          <meshStandardMaterial color={SICK} roughness={0.9} />
        </mesh>
        {/* Ears */}
        <mesh position={[-0.05, 0.16, 0.09]} rotation={[0.2, 0, -0.3]}>
          <coneGeometry args={[0.05, 0.12, 12]} />
          <meshStandardMaterial color="#3a3a44" roughness={0.9} />
        </mesh>
        <mesh position={[-0.05, 0.16, -0.09]} rotation={[-0.2, 0, -0.3]}>
          <coneGeometry args={[0.05, 0.12, 12]} />
          <meshStandardMaterial color="#3a3a44" roughness={0.9} />
        </mesh>
        {/* Eyes (closed when sick, open when healthy) */}
        <mesh position={[0.16, 0.0, 0.07]}>
          <sphereGeometry args={[0.018, 10, 10]} />
          <meshStandardMaterial color="#0a0a12" />
        </mesh>
        <mesh position={[0.16, 0.0, -0.07]}>
          <sphereGeometry args={[0.018, 10, 10]} />
          <meshStandardMaterial color="#0a0a12" />
        </mesh>
        {/* Nose */}
        <mesh position={[0.18, -0.04, 0]}>
          <sphereGeometry args={[0.014, 10, 10]} />
          <meshStandardMaterial color="#cf6f7f" />
        </mesh>
      </group>

      {/* Tail — curled around the body */}
      <group ref={tailRef} position={[-0.55, 0.05, 0.0]}>
        <mesh castShadow rotation={[0, 0, 0.4]}>
          <cylinderGeometry args={[0.04, 0.025, 0.6, 12]} />
          <meshStandardMaterial color={SICK} roughness={0.9} />
        </mesh>
      </group>

      {/* Paws (tucked) */}
      {[
        [0.18, -0.13, 0.16],
        [0.18, -0.13, -0.16],
        [-0.18, -0.13, 0.16],
        [-0.18, -0.13, -0.16],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x ?? 0, y ?? 0, z ?? 0]} castShadow>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshStandardMaterial color="#3a3a44" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Vines — thorny brambles wrapping the cat. Dissolve when "break" runs.
// ---------------------------------------------------------------------------

function Vines({
  glyphs,
}: {
  glyphs: Record<Phase, GlyphState>;
}): JSX.Element {
  const broken = glyphs.break === "complete";

  // Vine arcs spiralling around the cat. Each is a CatmullRom curve; the
  // VineTube component splits it into discrete chunks so we can shatter
  // them when "break" completes.
  const vines = useMemo(() => {
    const arcs: { curve: THREE.CatmullRomCurve3; seed: number }[] = [];
    const seeds = [0.0, 1.0, 2.1, 3.3];
    for (const s of seeds) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const angle = t * Math.PI * 2.4 + s;
        const rx = 0.42 + Math.sin(t * 5 + s) * 0.06;
        const rz = 0.7 + Math.sin(t * 4 + s * 0.5) * 0.08;
        const x = Math.cos(angle) * rx;
        const z = Math.sin(angle) * rz;
        const y = 0.02 + t * 0.45;
        pts.push(new THREE.Vector3(x, y, z));
      }
      arcs.push({
        curve: new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4),
        seed: s,
      });
    }
    return arcs;
  }, []);

  return (
    <group>
      {vines.map(({ curve }, i) => (
        <VineTube key={i} curve={curve} broken={broken} />
      ))}
    </group>
  );
}

type VineChunk = {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  length: number;
  velocity: THREE.Vector3;
  angVel: THREE.Vector3;
  thornLen: number;
};

function VineTube({
  curve,
  broken,
}: {
  curve: THREE.CatmullRomCurve3;
  broken: boolean;
}): JSX.Element {
  const NUM = 18;
  const RADIUS = 0.016;
  const chunks = useMemo<VineChunk[]>(() => {
    const out: VineChunk[] = [];
    const upY = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < NUM; i++) {
      const t1 = i / NUM;
      const t2 = (i + 1) / NUM;
      const p1 = curve.getPoint(t1);
      const p2 = curve.getPoint(t2);
      const length = p1.distanceTo(p2);
      const center = p1.clone().lerp(p2, 0.5);
      const dir = p2.clone().sub(p1).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(upY, dir);
      // Outward radial direction (used for break-velocity hint).
      const radial = new THREE.Vector3(center.x, 0, center.z);
      if (radial.lengthSq() < 1e-6) radial.set(1, 0, 0);
      else radial.normalize();
      const velocity = radial
        .clone()
        .multiplyScalar(0.6 + Math.random() * 0.9)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            0.4 + Math.random() * 0.7,
            (Math.random() - 0.5) * 0.5,
          ),
        );
      const angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 7,
      );
      const thornLen = 0.13 + Math.random() * 0.05;
      out.push({ pos: center, quat, length, velocity, angVel, thornLen });
    }
    return out;
  }, [curve]);

  const refs = useRef<(THREE.Group | null)[]>([]);
  const matRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const thornMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const startedAt = useRef<number | null>(null);

  useFrame(({ clock }) => {
    // Manage break trigger / reset.
    if (broken && startedAt.current === null) {
      startedAt.current = clock.elapsedTime;
    }
    if (!broken && startedAt.current !== null) {
      startedAt.current = null;
    }

    chunks.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const cm = matRefs.current[i];
      const tm = thornMatRefs.current[i];

      if (startedAt.current !== null) {
        const t = clock.elapsedTime - startedAt.current;
        const G = 1.6; // gravity
        g.position.set(
          c.pos.x + c.velocity.x * t,
          c.pos.y + c.velocity.y * t - 0.5 * G * t * t,
          c.pos.z + c.velocity.z * t,
        );
        const tumble = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(c.angVel.x * t, c.angVel.y * t, c.angVel.z * t),
        );
        g.quaternion.copy(c.quat).multiply(tumble);
        const opacity = Math.max(0, 1 - t * 0.55);
        if (cm) cm.opacity = opacity;
        if (tm) tm.opacity = opacity;
      } else {
        g.position.copy(c.pos);
        g.quaternion.copy(c.quat);
        if (cm) cm.opacity = 1;
        if (tm) tm.opacity = 1;
      }
    });
  });

  return (
    <group>
      {chunks.map((c, i) => (
        <group
          key={i}
          ref={(r) => {
            refs.current[i] = r;
          }}
        >
          {/* Vine segment along local +Y */}
          <mesh castShadow>
            <cylinderGeometry args={[RADIUS, RADIUS, c.length * 1.04, 6]} />
            <meshStandardMaterial
              ref={(r) => {
                matRefs.current[i] = r;
              }}
              color="#3a4a26"
              roughness={0.9}
              metalness={0.05}
              transparent
            />
          </mesh>
          {/* Long pointy thorn pointing along local +X */}
          <mesh
            position={[RADIUS + 0.005, 0, 0]}
            rotation={[0, 0, -Math.PI / 2]}
            castShadow
          >
            <coneGeometry args={[0.011, c.thornLen, 6]} />
            <meshStandardMaterial
              ref={(r) => {
                thornMatRefs.current[i] = r;
              }}
              color="#1a1a14"
              roughness={0.9}
              transparent
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// LaserScan — a thin emissive plane sweeping back-and-forth across the body.
// ---------------------------------------------------------------------------

function LaserScan(): JSX.Element {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    m.position.x = Math.sin(t * 1.6) * 0.55;
  });
  // Tall vertical sheet covering the cat from feet (y≈0) to head (y≈1.5).
  return (
    <mesh ref={ref} position={[0, 0.78, 0]}>
      <planeGeometry args={[0.025, 1.7]} />
      <meshBasicMaterial
        color="#7cf0ff"
        transparent
        opacity={0.85}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// SeamLabels — file-name labels pinned to body parts during "map".
// ---------------------------------------------------------------------------

const SEAM_FILES = [
  "auth.ts",
  "router.ts",
  "store.ts",
  "useUser.ts",
  "api.ts",
];

function SeamLabels({ repoName }: { repoName: string }): JSX.Element {
  void repoName;
  // Coords sit on / near the toon-cat's silhouette (target length 1.8).
  const anchors: { pos: [number, number, number]; label: string }[] = [
    { pos: [0.25, 0.95, 0.25], label: SEAM_FILES[0]! }, // head
    { pos: [0.0, 0.8, 0.3], label: SEAM_FILES[1]! }, // upper back
    { pos: [-0.2, 0.65, 0.28], label: SEAM_FILES[2]! }, // mid back
    { pos: [-0.4, 0.45, 0.25], label: SEAM_FILES[3]! }, // hip
    { pos: [0.3, 0.3, 0.28], label: SEAM_FILES[4]! }, // front leg
  ];
  return (
    <group>
      {anchors.map((a, i) => (
        <group key={i} position={a.pos}>
          <mesh>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshBasicMaterial color="#5eead4" toneMapped={false} />
          </mesh>
          <Html
            center
            distanceFactor={6}
            zIndexRange={[18, 0]}
            position={[0, 0.07, 0]}
          >
            <div
              style={{
                color: "#5eead4",
                fontFamily: "ui-monospace, monospace",
                fontSize: 9,
                background: "rgba(10,14,32,0.75)",
                padding: "1px 5px",
                borderRadius: 3,
                border: "1px solid #1f5d52",
                whiteSpace: "nowrap",
              }}
            >
              {a.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// BloodDrips — small red drops welling up at wound points and dripping down.
// Active until "break" completes (vines/wounds gone).
// ---------------------------------------------------------------------------

// All wound points are on the legs (lower body, y ~0.05–0.30).
const WOUND_POINTS: { x: number; y: number; z: number; period: number; phase: number }[] = [
  { x: 0.30, y: 0.18, z: 0.28, period: 2.6, phase: 0.0 }, // front-right leg
  { x: 0.05, y: 0.22, z: 0.30, period: 2.2, phase: 0.7 }, // front-mid
  { x: -0.32, y: 0.20, z: 0.28, period: 3.0, phase: 1.4 }, // hind-right leg
  { x: -0.10, y: 0.15, z: 0.32, period: 2.4, phase: 0.3 }, // hind-mid
];

function BloodDrips(): JSX.Element {
  return (
    <group>
      {WOUND_POINTS.map((w, i) => (
        <BloodDrop key={i} origin={w} />
      ))}
    </group>
  );
}

function BloodDrop({
  origin,
}: {
  origin: { x: number; y: number; z: number; period: number; phase: number };
}): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const FALL = 0.22; // distance the drop falls (leg → table)
  useFrame(({ clock }) => {
    const m = meshRef.current;
    const mat = matRef.current;
    if (!m || !mat) return;
    const t = ((clock.elapsedTime + origin.phase) % origin.period) / origin.period; // 0..1
    // Welling phase 0..0.2: small bead grows at origin.
    // Dripping phase 0.2..1: bead elongates, falls, shrinks.
    let scale: number;
    let yOff: number;
    let opacity: number;
    if (t < 0.2) {
      const u = t / 0.2;
      scale = 0.2 + u * 0.8;
      yOff = 0;
      opacity = 1;
    } else {
      const u = (t - 0.2) / 0.8;
      scale = 1 - u * 0.4;
      yOff = -u * FALL;
      opacity = 1 - u * u; // taper to invisible by end
    }
    m.position.set(origin.x, origin.y + yOff, origin.z);
    m.scale.set(scale, scale * 1.6, scale); // slight teardrop stretch
    mat.opacity = opacity;
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.025, 10, 8]} />
      <meshStandardMaterial
        ref={matRef}
        color="#9b1a1a"
        emissive="#5a0808"
        emissiveIntensity={0.6}
        roughness={0.4}
        transparent
        opacity={1}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// ImplementShimmer — a soft glow ring that pulses on each ArtifactWritten.
// ---------------------------------------------------------------------------

function ImplementShimmer({
  lastArtifactTs,
}: {
  lastArtifactTs: number;
}): JSX.Element {
  const ref = useRef<THREE.Mesh>(null);
  const seen = useRef(0);
  const pulseStart = useRef(-10);
  useFrame(({ clock }) => {
    if (lastArtifactTs !== seen.current) {
      seen.current = lastArtifactTs;
      pulseStart.current = clock.elapsedTime;
    }
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime - pulseStart.current;
    const a = Math.max(0, Math.exp(-t * 1.6)) * 0.7;
    (m.material as THREE.MeshBasicMaterial).opacity = a;
    const s = 1 + (1 - Math.exp(-t * 1.6)) * 0.6;
    m.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.55, 0.62, 48]} />
      <meshBasicMaterial
        color="#ffd27a"
        transparent
        opacity={0}
        toneMapped={false}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// RefactorGlow — multi-layer aura: hue-cycling halo sphere, expanding ground
// rings, and a vertical light beam. Draws attention and feels celebratory.
// ---------------------------------------------------------------------------

function RefactorGlow(): JSX.Element {
  return (
    <group>
      <AuraHalo />
      <PulsingRing radius={0.6} thickness={0.12} period={2.4} delay={0.0} />
      <PulsingRing radius={0.6} thickness={0.1} period={2.4} delay={0.8} />
      <PulsingRing radius={0.6} thickness={0.08} period={2.4} delay={1.6} />
      <LightBeam />
      <Sparkles count={28} radius={0.9} height={1.5} />
    </group>
  );
}

function AuraHalo(): JSX.Element {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (matRef.current) {
      const hue = (t * 0.08) % 1; // slow rainbow
      matRef.current.color.setHSL(hue, 0.7, 0.6);
      matRef.current.opacity = 0.2 + Math.sin(t * 1.6) * 0.06;
    }
    if (meshRef.current) {
      const s = 1 + Math.sin(t * 1.6) * 0.06;
      meshRef.current.scale.setScalar(s);
    }
  });
  return (
    <mesh ref={meshRef} position={[0, 0.75, 0]}>
      <sphereGeometry args={[1.0, 32, 24]} />
      <meshBasicMaterial
        ref={matRef}
        color="#ffd27a"
        transparent
        opacity={0.22}
        toneMapped={false}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function PulsingRing({
  radius,
  thickness,
  period,
  delay,
}: {
  radius: number;
  thickness: number;
  period: number;
  delay: number;
}): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = ((clock.elapsedTime + delay) % period) / period;
    const m = meshRef.current;
    const mat = matRef.current;
    if (!m || !mat) return;
    const s = 0.4 + t * 1.6; // expand outward
    m.scale.set(s, s, 1);
    mat.opacity = (1 - t) * 0.55;
    const hue = (clock.elapsedTime * 0.1 + delay * 0.2) % 1;
    mat.color.setHSL(hue, 0.7, 0.65);
  });
  return (
    <mesh ref={meshRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - thickness * 0.5, radius + thickness * 0.5, 64]} />
      <meshBasicMaterial
        ref={matRef}
        color="#ffd27a"
        transparent
        opacity={0.5}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function LightBeam(): JSX.Element {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) {
      const t = clock.elapsedTime;
      matRef.current.opacity = 0.15 + Math.sin(t * 1.2) * 0.05;
      const hue = (t * 0.07) % 1;
      matRef.current.color.setHSL(hue, 0.6, 0.7);
    }
  });
  return (
    <mesh position={[0, 1.5, 0]}>
      <cylinderGeometry args={[0.55, 0.25, 3.0, 24, 1, true]} />
      <meshBasicMaterial
        ref={matRef}
        color="#ffd27a"
        transparent
        opacity={0.18}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function Sparkles({
  count,
  radius,
  height,
}: {
  count: number;
  radius: number;
  height: number;
}): JSX.Element {
  const sparks = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        angle: Math.random() * Math.PI * 2,
        r: 0.4 + Math.random() * radius,
        baseY: Math.random() * height,
        speed: 0.4 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        size: 0.018 + Math.random() * 0.02,
      })),
    [count, radius, height],
  );
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const s = sparks[i];
      if (!s) return;
      const yOff = ((t * s.speed + s.phase) % 2) - 1; // -1..1
      child.position.set(
        Math.cos(s.angle + t * 0.3) * s.r,
        0.4 + s.baseY + yOff * 0.3,
        Math.sin(s.angle + t * 0.3) * s.r * 0.8,
      );
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + Math.sin(t * 3 + s.phase) * 0.4;
    });
  });
  return (
    <group ref={groupRef}>
      {sparks.map((s, i) => (
        <mesh key={i}>
          <sphereGeometry args={[s.size, 6, 6]} />
          <meshBasicMaterial
            color="#fff7c2"
            transparent
            opacity={0.8}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Patient label (kept from MudBall).
// ---------------------------------------------------------------------------

function PatientLabel({ repoName }: { repoName: string }): JSX.Element {
  return (
    <Html
      position={[0, 1.7, 0]}
      center
      distanceFactor={5}
      occlude={false}
      zIndexRange={[20, 0]}
    >
      <div
        style={{
          color: "#e6ecff",
          fontFamily: "ui-monospace, monospace",
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "0.04em",
          background: "rgba(10,14,32,0.78)",
          padding: "5px 12px",
          borderRadius: 5,
          border: "1px solid #2a3358",
          whiteSpace: "nowrap",
        }}
      >
        patient: {repoName}
      </div>
    </Html>
  );
}
