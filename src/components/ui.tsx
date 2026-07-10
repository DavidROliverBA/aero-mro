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
