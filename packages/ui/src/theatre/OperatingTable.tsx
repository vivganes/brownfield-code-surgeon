export function OperatingTable(): JSX.Element {
  return (
    <group position={[0, -0.5, 0]}>
      {/* Table top */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[3.2, 0.12, 1.6]} />
        <meshStandardMaterial color="#d9dee6" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Legs */}
      {[
        [-1.4, -0.5, -0.6],
        [1.4, -0.5, -0.6],
        [-1.4, -0.5, 0.6],
        [1.4, -0.5, 0.6],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x ?? 0, y ?? 0, z ?? 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 1.0, 8]} />
          <meshStandardMaterial color="#8a94a8" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}
