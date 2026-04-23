import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

type RoomProps = {
  alarm: boolean;
  lampTarget: [number, number, number];
};

export function Room({ alarm, lampTarget }: RoomProps): JSX.Element {
  const lamp = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(new THREE.Object3D());
  const alarmLight = useRef<THREE.PointLight>(null);

  useFrame((_, dt) => {
    if (lamp.current) {
      const t = target.current;
      t.position.lerp(
        new THREE.Vector3(lampTarget[0], lampTarget[1], lampTarget[2]),
        Math.min(1, dt * 2),
      );
      t.updateMatrixWorld();
      lamp.current.target = t;
    }
    if (alarmLight.current) {
      const target = alarm ? 1.2 : 0;
      alarmLight.current.intensity +=
        (target - alarmLight.current.intensity) * Math.min(1, dt * 5);
    }
  });

  return (
    <group>
      {/* Floor — tiled */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[30, 30, 1, 1]} />
        <meshStandardMaterial color="#3a4460" roughness={0.85} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, 1.5, -8]}>
        <planeGeometry args={[30, 10]} />
        <meshStandardMaterial color="#3a4460" roughness={0.95} />
      </mesh>
      {/* Side walls */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-12, 1.5, 0]}>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial color="#404b68" roughness={0.95} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[12, 1.5, 0]}>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial color="#404b68" roughness={0.95} />
      </mesh>
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5.5, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color="#2a3150" roughness={1} />
      </mesh>

      {/* Ambient + surgical fill (surgical rooms are brightly and evenly lit) */}
      <ambientLight intensity={0.9} color="#e7edff" />
      <hemisphereLight args={["#dce6ff", "#3a4460", 1.0]} />
      {/* Broad overhead fill so the whole room reads */}
      <directionalLight position={[0, 8, 6]} intensity={0.7} color="#f4f7ff" />
      <directionalLight position={[-6, 5, 4]} intensity={0.3} color="#d6e1ff" />
      <directionalLight position={[6, 5, 4]} intensity={0.3} color="#d6e1ff" />

      {/* Overhead surgical lamp */}
      <group position={[0, 5.2, 0]}>
        <mesh>
          <cylinderGeometry args={[0.8, 1.1, 0.3, 16]} />
          <meshStandardMaterial color="#d7deea" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.15, 0]}>
          <cylinderGeometry args={[1.15, 0.95, 0.1, 24]} />
          <meshStandardMaterial emissive="#fff6d8" emissiveIntensity={1.2} color="#fff6d8" />
        </mesh>
      </group>
      <spotLight
        ref={lamp}
        position={[0, 5.0, 0]}
        angle={0.6}
        penumbra={0.5}
        intensity={2.5}
        color={alarm ? "#ffb3b3" : "#fff5d8"}
        castShadow
      />
      <primitive object={target.current} />

      {/* Alarm flood */}
      <pointLight
        ref={alarmLight}
        position={[0, 3, 2]}
        color="#ff3030"
        intensity={0}
        distance={20}
      />
    </group>
  );
}
