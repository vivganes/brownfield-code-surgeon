import { useEffect, useRef, useState } from "react";
import type { SurgeryEvent, Vitals } from "./types";

export type StreamState = {
  connected: boolean;
  vitals: Vitals | null;
  events: SurgeryEvent[];
  planReady: boolean;
  seamsReady: boolean;
};

const MAX_EVENTS = 500;

export function useSurgeryStream(): StreamState {
  const [connected, setConnected] = useState(false);
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [events, setEvents] = useState<SurgeryEvent[]>([]);
  const [planReady, setPlanReady] = useState(false);
  const [seamsReady, setSeamsReady] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.addEventListener("hello", () => setConnected(true));
    es.addEventListener("repo-switched", () => {
      // Directory switched: clear old state
      // Fresh vitals will arrive automatically via the existing SSE connection
      setVitals(null);
      setEvents([]);
      setPlanReady(false);
      setSeamsReady(false);
    });
    es.addEventListener("plan-ready",    () => setPlanReady(true));
    es.addEventListener("plan-removed",  () => setPlanReady(false));
    es.addEventListener("seams-ready",   () => setSeamsReady(true));
    es.addEventListener("seams-removed", () => setSeamsReady(false));
    es.addEventListener("vitals", (ev) => {
      try {
        setVitals(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore bad payload
      }
    });
    es.addEventListener("event", (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as SurgeryEvent;
        setEvents((prev) => {
          const next = [...prev, parsed];
          return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
        });
      } catch {
        // ignore bad payload
      }
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { connected, vitals, events, planReady, seamsReady };
}
