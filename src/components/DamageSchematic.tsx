import type { DamageRecord } from "../lib/types";

// Rendered top-view aircraft schematic (SVG) with damage markers plotted at
// (pos_x, pos_y) fractions of the canvas — the digital dent & buckle chart.
// Narrowbody and widebody proportions differ just enough to read correctly.

const W = 1000;
const H = 420;

export function damageTone(d: DamageRecord): "ok" | "warn" | "danger" {
  if (!d.within_limits && d.status !== "repaired") return "danger";
  if (d.status === "repaired") return "ok";
  return d.status === "open" ? "danger" : "warn";
}

export default function DamageSchematic({
  type,
  records,
  selectedId,
  onSelect,
  addMode,
  onPlace,
}: {
  type: string; // ICAO type designator, e.g. A320 / B789
  records: DamageRecord[];
  selectedId: string | null;
  onSelect: (d: DamageRecord) => void;
  addMode: boolean;
  onPlace: (x: number, y: number) => void;
}) {
  const wide = ["B78", "B77", "B74", "A33", "A35", "A38"].some((p) => type.startsWith(p));
  const halfBody = wide ? 46 : 36; // fuselage half-width
  const cy = H / 2;
  const noseX = 25;
  const tailX = 975;
  const wingRootFwd = wide ? 400 : 420;
  const wingRootAft = wide ? 560 : 545;
  const wingTipX = wide ? 700 : 650;
  const wingSpan = wide ? 195 : 165;
  const engX = wide ? 480 : 470;
  const engY = wide ? 120 : 128;

  function handleClick(evt: React.MouseEvent<SVGSVGElement>) {
    if (!addMode) return;
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = (evt.clientX - rect.left) / rect.width;
    const y = (evt.clientY - rect.top) / rect.height;
    onPlace(Number(x.toFixed(3)), Number(y.toFixed(3)));
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Dent and buckle chart — top view schematic with ${records.length} damage markers`}
      style={{ width: "100%", height: "auto", cursor: addMode ? "crosshair" : "default", touchAction: "manipulation" }}
      onClick={handleClick}
    >
      {/* frame-station grid */}
      {Array.from({ length: 9 }, (_, i) => {
        const gx = 100 + i * 100;
        return (
          <g key={gx}>
            <line x1={gx} y1={12} x2={gx} y2={H - 12} stroke="var(--border)" strokeDasharray="3 7" strokeWidth={1} />
            <text x={gx} y={H - 2} textAnchor="middle" fontSize={11} fill="var(--muted)">
              FR{(i + 1) * 10}
            </text>
          </g>
        );
      })}

      {/* wings */}
      <polygon
        points={`${wingRootFwd},${cy - halfBody + 6} ${wingTipX},${cy - halfBody - wingSpan} ${wingTipX + 42},${cy - halfBody - wingSpan} ${wingRootAft},${cy - halfBody + 6}`}
        fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={1.5}
      />
      <polygon
        points={`${wingRootFwd},${cy + halfBody - 6} ${wingTipX},${cy + halfBody + wingSpan} ${wingTipX + 42},${cy + halfBody + wingSpan} ${wingRootAft},${cy + halfBody - 6}`}
        fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={1.5}
      />
      {/* engines */}
      <rect x={engX} y={cy - halfBody - engY} width={52} height={26} rx={12} fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={1.5} />
      <rect x={engX} y={cy + halfBody + engY - 26} width={52} height={26} rx={12} fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={1.5} />
      {/* horizontal stabilisers */}
      <polygon
        points={`${tailX - 105},${cy - halfBody + 12} ${tailX - 40},${cy - halfBody - 62} ${tailX - 12},${cy - halfBody - 62} ${tailX - 52},${cy - halfBody + 12}`}
        fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={1.5}
      />
      <polygon
        points={`${tailX - 105},${cy + halfBody - 12} ${tailX - 40},${cy + halfBody + 62} ${tailX - 12},${cy + halfBody + 62} ${tailX - 52},${cy + halfBody - 12}`}
        fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={1.5}
      />
      {/* fuselage */}
      <path
        d={`M ${noseX},${cy}
            Q ${noseX + 8},${cy - halfBody} ${noseX + 95},${cy - halfBody}
            L ${tailX - 210},${cy - halfBody}
            Q ${tailX - 60},${cy - halfBody + 10} ${tailX},${cy - 8}
            L ${tailX},${cy + 8}
            Q ${tailX - 60},${cy + halfBody - 10} ${tailX - 210},${cy + halfBody}
            L ${noseX + 95},${cy + halfBody}
            Q ${noseX + 8},${cy + halfBody} ${noseX},${cy} Z`}
        fill="var(--panel)" stroke="var(--text)" strokeWidth={2}
      />
      {/* fin root (top view) */}
      <ellipse cx={tailX - 95} cy={cy} rx={70} ry={5} fill="var(--muted)" opacity={0.55} />
      <text x={noseX + 12} y={cy + 4} fontSize={11} fill="var(--muted)">▲ nose</text>

      {/* damage markers */}
      {records.map((d, i) => {
        const tone = damageTone(d);
        const x = Number(d.pos_x) * W;
        const y = Number(d.pos_y) * H;
        const sel = d.id === selectedId;
        return (
          <g
            key={d.id}
            onClick={(e) => {
              if (addMode) return;
              e.stopPropagation();
              onSelect(d);
            }}
            style={{ cursor: addMode ? "crosshair" : "pointer" }}
            role="button"
            aria-label={`Damage ${i + 1}: ${d.damage_type} — ${d.station ?? "unlocated"}`}
          >
            {sel && <circle cx={x} cy={y} r={19} fill="none" stroke={`var(--${tone})`} strokeWidth={2} strokeDasharray="4 4" />}
            <circle cx={x} cy={y} r={12} fill={`var(--${tone})`} opacity={0.9} stroke="var(--bg)" strokeWidth={2} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
              {i + 1}
            </text>
            <title>{`#${i + 1} ${d.damage_type} — ${d.station ?? ""} (${d.status}${d.within_limits ? "" : ", BEYOND LIMITS"})`}</title>
          </g>
        );
      })}
    </svg>
  );
}
