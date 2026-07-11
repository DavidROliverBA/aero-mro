import type { ReactNode } from "react";

export function Pill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "muted" | "info";
  children: ReactNode;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function StatCard({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="card">
      <div className="stat" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const AC_TONE: Record<string, "ok" | "warn" | "danger" | "muted"> = {
  in_service: "ok",
  scheduled_maintenance: "warn",
  aog: "danger",
  stored: "muted",
};

export function statusPill(status: string) {
  const tone = AC_TONE[status] ?? "info";
  return <Pill tone={tone}>{status.replace(/_/g, " ")}</Pill>;
}

// Horizontal life-consumed bar, e.g. LLP cycles used.
export function LifeBar({ pct, tone }: { pct: number; tone: "ok" | "warn" | "danger" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={`bar ${tone}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${clamped.toFixed(1)}% of life limit consumed`}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}

// In-app cross-reference: looks like a link, navigates with go(tab, focusId).
export function EntityLink({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button type="button" className="entity-link" onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="muted" style={{ padding: "24px 4px", textAlign: "center" }}>
      {children}
    </p>
  );
}
