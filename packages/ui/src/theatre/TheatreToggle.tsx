export function TheatreToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onToggle}
      style={{
        background: active ? "var(--accent)" : "var(--panel-2)",
        color: active ? "#07142c" : "var(--fg)",
        border: "1px solid #22284a",
        borderRadius: 4,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
      title={active ? "Exit immersive theatre" : "Enter immersive theatre"}
    >
      {active ? "Exit Theatre" : "Enter Theatre"}
    </button>
  );
}
