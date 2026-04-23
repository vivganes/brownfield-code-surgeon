import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";

cytoscape.use(dagre);

type Seam = { from: string; to: string; kind?: string };

export function SeamsGraph(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/seams");
        if (!res.ok) {
          if (!cancelled) setErr(res.status === 404 ? "no seams file yet" : `error ${res.status}`);
          return;
        }
        const text = await res.text();
        if (!cancelled) {
          setMarkdown(text);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    };
    void load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!ref.current || !markdown) return;
    const seams = parseSeams(markdown);
    if (seams.length === 0) return;

    const nodes = new Set<string>();
    for (const s of seams) {
      nodes.add(s.from);
      nodes.add(s.to);
    }

    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...[...nodes].map((id) => ({ data: { id, label: id } })),
        ...seams.map((s, i) => ({
          data: {
            id: `e${i}`,
            source: s.from,
            target: s.to,
            label: s.kind ?? "",
          },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#1a2146",
            "border-color": "#5eead4",
            "border-width": 1,
            label: "data(label)",
            color: "#e6ecff",
            "font-size": 10,
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": "120px",
            width: "label",
            height: "label",
            padding: "8px",
            shape: "round-rectangle",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#a78bfa",
            "target-arrow-color": "#a78bfa",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 8,
            color: "#8892b8",
          },
        },
      ],
      layout: { name: "dagre", rankDir: "LR" } as any,
    });

    return () => cy.destroy();
  }, [markdown]);

  if (err) {
    return (
      <div className="body">
        <p className="empty">{err}</p>
      </div>
    );
  }
  if (!markdown) {
    return (
      <div className="body">
        <p className="empty">Loading seams…</p>
      </div>
    );
  }
  return <div id="seams-graph" ref={ref} />;
}

/**
 * Minimal parser: pulls `A -> B` or `A --kind--> B` edges from the seams markdown.
 * Also accepts pipe-table rows `| from | to | kind |`.
 */
function parseSeams(md: string): Seam[] {
  const seams: Seam[] = [];
  const arrowRe = /^[\s-*]*`?([\w./:-]+)`?\s*--?([\w-]*)?-?->\s*`?([\w./:-]+)`?/gm;
  let m: RegExpExecArray | null;
  while ((m = arrowRe.exec(md)) !== null) {
    seams.push({ from: m[1]!, to: m[3]!, kind: m[2] || undefined });
  }
  const tableRe = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;
  while ((m = tableRe.exec(md)) !== null) {
    const from = m[1]!.trim();
    const to = m[2]!.trim();
    if (from === "from" || from.startsWith("---")) continue;
    seams.push({ from, to, kind: m[3]?.trim() });
  }
  return seams;
}
