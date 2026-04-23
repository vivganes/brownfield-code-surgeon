import { useEffect, useRef, useState } from "react";
import type { SurgeryEvent, Vitals } from "./types";

export type StreamState = {
  connected: boolean;
  vitals: Vitals | null;
  events: SurgeryEvent[];
};

const MAX_EVENTS = 500;

export function useSurgeryStream(): StreamState {
  const [connected, setConnected] = useState(false);
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [events, setEvents] = useState<SurgeryEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.addEventListener("hello", () => setConnected(true));
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

  return { connected, vitals, events };
}
