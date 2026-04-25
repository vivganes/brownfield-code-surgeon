import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Phase, SurgeryEvent, Vitals } from "../types";
import { PHASES } from "../types";
import { Room } from "./Room";
import { OperatingTable } from "./OperatingTable";
import { Patient } from "./Patient";
import { MonitorWall } from "./MonitorWall";
import { InstrumentTray } from "./InstrumentTray";
import { useTheatreState } from "./useTheatreEvents";
import { useEventCues } from "./audio/cues";
import { getSoundEngine } from "./audio/SoundEngine";
import { OperatingFieldMonitor } from "./monitors/OperatingFieldMonitor";
import { TheatreLogMonitor } from "./monitors/TheatreLogMonitor";
import { PatientStatusMonitor } from "./monitors/PatientStatusMonitor";
import { OperatingRoomDetails } from "./OperatingRoomDetails";
import { MonitorPopup } from "./MonitorPopup";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

type SceneProps = {
  vitals: Vitals | null;
  events: SurgeryEvent[];
  engine: "plugin" | "sdk" | "managed";
  onApprove: (phase: Phase) => void;
};

const INITIAL_CAMERA: [number, number, number] = [0, 1.9, 7.5];
const INITIAL_TARGET: [number, number, number] = [0, 2.0, -3];

export function TheatreScene({
  vitals,
  events,
  engine,
  onApprove,
}: SceneProps): JSX.Element {
  const monitorPanels = useMemo(
    () => [
      { title: "Operating Field", node: <OperatingFieldMonitor /> },
      { title: "Patient Status", node: <PatientStatusMonitor vitals={vitals} events={events} /> },
      { title: "Surgical Log", node: <TheatreLogMonitor events={events} /> },
    ],
    [vitals, events],
  );
  const state = useTheatreState(vitals, events);
  const clickable = engine === "sdk";
  const pendingApprovals = PHASES.filter(
    (p) => state.glyphs[p] === "awaiting-approval",
  );
  const [dismissedBlockedTs, setDismissedBlockedTs] = useState(0);
  const visibleBlockedTools = state.blockedTools.filter(
    (b) => b.timestamp > dismissedBlockedTs,
  );
  const [audioOn, _setAudioOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [ackFinishTs, setAckFinishTs] = useState(0);
  const effectiveFinishedTs =
    state.finishedTs > ackFinishTs ? state.finishedTs : 0;

  useEffect(() => {
    const s = getSoundEngine();
    if (audioOn) {
      void s.start();
      s.setMuted(muted);
      s.setVolume(volume);
    }
    return () => {
      s.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getSoundEngine().setMuted(muted);
  }, [muted]);
  useEffect(() => {
    getSoundEngine().setVolume(volume);
  }, [volume]);

  useEventCues(events, audioOn);

  const alarm =
    state.lastTestFailTs > 0 && Date.now() - state.lastTestFailTs < 4000;

  const lampTarget = useMemo<[number, number, number]>(() => {
    const phase = state.activePhase;
    if (!phase) return [0, -0.3, 0];
    const i = PHASES.indexOf(phase);
    if (i < 0) return [0, -0.3, 0];
    const x = -3.0 + i * 1.0;
    return [x, -0.3, 1.6];
  }, [state.activePhase]);

  const repoName = vitals?.repoRoot?.split(/[\\/]/).filter(Boolean).pop() ?? "repo";

  const resetView = (): void => {
    const c = controlsRef.current;
    if (!c) return;
    c.object.position.set(...INITIAL_CAMERA);
    c.target.set(...INITIAL_TARGET);
    c.update();
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows
        camera={{ position: INITIAL_CAMERA, fov: 58 }}
        style={{ background: "#05070e" }}
      >
        <OrbitControls
          ref={controlsRef}
          target={INITIAL_TARGET}
          enablePan
          enableZoom
          enableRotate
          zoomSpeed={0.8}
          panSpeed={0.8}
          rotateSpeed={0.6}
          screenSpacePanning
          minDistance={2}
          maxDistance={16}
          minPolarAngle={Math.PI * 0.1}
          maxPolarAngle={Math.PI * 0.62}
          minAzimuthAngle={-Math.PI * 0.55}
          maxAzimuthAngle={Math.PI * 0.55}
          makeDefault
        />
        <Room alarm={alarm} lampTarget={lampTarget} />
        <OperatingRoomDetails />
        <OperatingTable />
        <Patient
          phase={state.activePhase}
          glyphs={state.glyphs}
          lastArtifactTs={state.lastArtifactTs}
          finishedTs={effectiveFinishedTs}
          repoName={repoName}
        />
        <MonitorWall panels={monitorPanels} onOpen={setOpenIndex} />
        <InstrumentTray
          glyphs={state.glyphs}
          clickable={clickable}
          onApprove={onApprove}
        />
        <fog attach="fog" args={["#05070e", 10, 30]} />
      </Canvas>

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          display: "flex",
          gap: 10,
          alignItems: "center",
          background: "rgba(10,14,32,0.7)",
          border: "1px solid #22284a",
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          color: "#e6ecff",
        }}
      >
        <span style={{ color: "#8892b8" }}>
          role: {clickable ? "surgeon" : "observer"}
        </span>
        <button onClick={resetView} style={hudBtn} title="Reset camera">
          reset view
        </button>
        <button onClick={() => setMuted((m) => !m)} style={hudBtn}>
          {muted ? "unmute" : "mute"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          style={{ width: 80 }}
        />
      </div>

      {effectiveFinishedTs > 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 10,
          }}
        >
          <button
            className="restart-btn"
            onClick={() => {
              setAckFinishTs(state.finishedTs);
              void fetch("/api/restart", { method: "POST" }).catch(() => {});
            }}
            title="Bring the patient back for a new iteration"
          >
            restart surgery
          </button>
        </div>
      )}

      {openIndex != null && monitorPanels[openIndex] && (
        <MonitorPopup
          title={monitorPanels[openIndex].title}
          onClose={() => setOpenIndex(null)}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              // Scale up the compact monitor content for popup reading.
              // `zoom` is broadly supported on Chromium/WebKit and OK for this demo.
              zoom: 1.6,
            }}
          >
            {monitorPanels[openIndex].node}
          </div>
        </MonitorPopup>
      )}

      {/* Approval popup */}
      {pendingApprovals.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 30,
            background: "rgba(10,14,32,0.95)",
            border: "1px solid #5eead4",
            borderRadius: 8,
            padding: "20px 28px",
            fontFamily: "ui-monospace, monospace",
            color: "#e6ecff",
            textAlign: "center",
            minWidth: 260,
          }}
        >
          <div style={{ color: "#5eead4", fontSize: 11, letterSpacing: "0.1em", marginBottom: 8 }}>
            ⏸ AWAITING APPROVAL
          </div>
          {pendingApprovals.map((phase) => (
            <div key={phase} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                phase <span style={{ color: "#ffd27a" }}>{phase}</span> complete
              </div>
              <button
                onClick={() => onApprove(phase)}
                style={{
                  background: "#0f3d35",
                  color: "#5eead4",
                  border: "1px solid #5eead4",
                  borderRadius: 4,
                  padding: "5px 18px",
                  fontSize: 12,
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                }}
              >
                approve → proceed
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Blocked tools popup */}
      {visibleBlockedTools.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            background: "rgba(10,14,32,0.95)",
            border: "1px solid #f87171",
            borderRadius: 8,
            padding: "14px 20px",
            fontFamily: "ui-monospace, monospace",
            color: "#e6ecff",
            minWidth: 300,
            maxWidth: 480,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: "#f87171", fontSize: 11, letterSpacing: "0.1em" }}>
              ⛔ SDK PERMISSION DENIED
            </span>
            <button
              onClick={() => setDismissedBlockedTs(Date.now())}
              style={{ background: "none", border: "none", color: "#8892b8", cursor: "pointer", fontSize: 14, padding: 0 }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#8892b8", marginBottom: 10 }}>
            The SDK blocked these tools. Rerun with a wider permission mode to allow them.
          </div>
          {visibleBlockedTools.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 11 }}>
              <span style={{ color: "#f87171", minWidth: 60 }}>{b.tool}</span>
              <span style={{ color: "#ffd27a" }}>[{b.phase}]</span>
              {b.summary && <span style={{ color: "#8892b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.summary}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Controls hint */}
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          background: "rgba(10,14,32,0.7)",
          border: "1px solid #22284a",
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          color: "#8892b8",
          lineHeight: 1.5,
        }}
      >
        <div>
          <span style={{ color: "#5eead4" }}>drag</span> rotate ·{" "}
          <span style={{ color: "#5eead4" }}>right-drag</span> pan ·{" "}
          <span style={{ color: "#5eead4" }}>wheel</span> zoom
        </div>
        <div style={{ marginTop: 4, fontSize: 9, color: "#4a5278" }}>
          patient model: "Toon Cat FREE" by Omabuarts Studio · CC-BY-4.0
        </div>
      </div>
    </div>
  );
}

const hudBtn = {
  background: "#1a2146",
  color: "#e6ecff",
  border: "1px solid #22284a",
  borderRadius: 4,
  fontSize: 11,
  padding: "2px 8px",
  cursor: "pointer",
} as const;
