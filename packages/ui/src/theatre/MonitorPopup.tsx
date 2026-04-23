import { useEffect } from "react";
import type { ReactNode } from "react";

type MonitorPopupProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function MonitorPopup({ title, children, onClose }: MonitorPopupProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(5,7,16,0.72)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#05070e",
          border: "2px solid #1b2540",
          borderRadius: 12,
          boxShadow:
            "0 0 0 4px rgba(94,234,212,0.05), 0 20px 60px rgba(0,0,0,0.6), inset 0 0 40px rgba(94,234,212,0.12)",
          maxWidth: "min(1200px, 100%)",
          maxHeight: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 22px",
            borderBottom: "2px solid #1b2540",
            background:
              "linear-gradient(90deg, rgba(94,234,212,0.12), rgba(94,234,212,0))",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <div
            style={{
              color: "#5eead4",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#1a2146",
              color: "#e6ecff",
              border: "1px solid #22284a",
              borderRadius: 4,
              fontSize: 12,
              padding: "6px 12px",
              cursor: "pointer",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.08em",
            }}
            title="Close (Esc)"
          >
            close ✕
          </button>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            position: "relative",
            color: "#e6ecff",
            display: "flex",
          }}
        >
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              backgroundImage:
                "repeating-linear-gradient(to bottom, rgba(0,0,0,0.18) 0 2px, transparent 2px 4px)",
              mixBlendMode: "multiply",
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
