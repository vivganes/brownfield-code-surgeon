import { useEffect, useState } from "react";
import { MonitorPopup } from "./MonitorPopup";
import { mdToHtml } from "./mdToHtml";

type Props = {
  onClose: () => void;
};

export function PlanDialog({ onClose }: Props): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plan")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.text();
      })
      .then((text) => setContent(text))
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <MonitorPopup title="Operative Plan — plan.md" onClose={onClose}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "24px 32px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 14,
          lineHeight: 1.65,
          color: "#e6ecff",
        }}
      >
        {error != null && (
          <div style={{ color: "#ef4444", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
            {error}
          </div>
        )}
        {content == null && error == null && (
          <div style={{ color: "#8892b8", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
            loading plan.md…
          </div>
        )}
        {content != null && (
          <div
            className="plan-md-body"
            // plan.md is served from the local filesystem by our own Node server.
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: mdToHtml(content) }}
          />
        )}
      </div>
    </MonitorPopup>
  );
}
