import { useEffect, useMemo, useRef, useState } from "react";
import type { Store, Tab } from "../App";

interface Item {
  label: string;
  sublabel: string;
  target: Tab;
  ask?: string; // when set, selecting hands the query to the AI assistant
}

// One flat searchable index over navigation + every entity in the store.
function buildIndex(store: Store): Item[] {
  const nav: Item[] = (
    [
      ["dashboard", "Dashboard"], ["mywork", "My Work"], ["fleet", "Fleet"],
      ["techlog", "Tech Log"], ["defects", "Defects"], ["workorders", "Work Orders"],
      ["planning", "Planning & LLP"], ["parts", "Parts & Stores"], ["tooling", "Tooling"],
      ["directives", "AD / SB"], ["reliability", "Reliability"], ["quality", "Quality & Audit"],
      ["engineers", "Certifying Staff"], ["workforce", "Workforce"], ["settings", "Settings"],
      ["assistant", "AI Assistant"],
    ] as [Tab, string][]
  ).map(([target, label]) => ({ label, sublabel: "Go to view", target }));

  const reg = (id: string) => store.aircraft.find((a) => a.id === id)?.registration ?? "";
  return [
    ...nav,
    ...store.aircraft.map((a) => ({
      label: `${a.registration} · ${a.type_designator}`,
      sublabel: `Aircraft — ${a.status.replace(/_/g, " ")} at ${a.base}`,
      target: "fleet" as Tab,
    })),
    ...store.defects
      .filter((d) => d.status !== "closed")
      .map((d) => ({
        label: d.description.slice(0, 70),
        sublabel: `Defect — ${reg(d.aircraft_id)} · ${d.status}`,
        target: "defects" as Tab,
      })),
    ...store.workOrders.map((w) => ({
      label: `${w.wo_number} — ${w.title}`,
      sublabel: `Work order — ${reg(w.aircraft_id)} · ${w.status.replace(/_/g, " ")}`,
      target: "workorders" as Tab,
    })),
    ...store.parts.map((p) => ({
      label: `${p.part_number} — ${p.description}`,
      sublabel: `Part — ${p.condition}${p.location ? ` · ${p.location}` : ""}`,
      target: "parts" as Tab,
    })),
    ...store.tools.map((t) => ({
      label: `${t.tool_no} — ${t.description}`,
      sublabel: `Tool — ${t.location}`,
      target: "tooling" as Tab,
    })),
    ...store.engineers.map((e) => ({
      label: `${e.full_name} · ${e.staff_no}`,
      sublabel: `Engineer — ${e.licence_categories.join("/")} · ${e.type_ratings.join(", ")}`,
      target: "engineers" as Tab,
    })),
    ...store.mpTasks.map((t) => ({
      label: `${t.task_code} — ${t.title}`,
      sublabel: "Maintenance programme task",
      target: "planning" as Tab,
    })),
    ...store.directives.map((ad) => ({
      label: `${ad.ad_number} — ${ad.subject.slice(0, 50)}`,
      sublabel: `AD — ${ad.applies_to_type}`,
      target: "directives" as Tab,
    })),
    ...store.audits.map((a) => ({
      label: `${a.audit_ref} — ${a.area}`,
      sublabel: `Audit — ${a.status.replace(/_/g, " ")}`,
      target: "quality" as Tab,
    })),
  ];
}

export default function CommandPalette({
  store,
  open,
  onClose,
  go,
  onAsk,
}: {
  store: Store;
  open: boolean;
  onClose: () => void;
  go: (t: Tab) => void;
  onAsk: (question: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const index = useMemo(() => buildIndex(store), [store]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index.slice(0, 8);
    const words = q.split(/\s+/);
    const hits = index
      .filter((it) => words.every((w) => `${it.label} ${it.sublabel}`.toLowerCase().includes(w)))
      .slice(0, 8);
    // Always offer the query as a question for the assistant.
    return [
      ...hits,
      { label: `Ask AI: “${query.trim()}”`, sublabel: "Send to the assistant", target: "assistant" as Tab, ask: query.trim() },
    ];
  }, [index, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Focus after the element mounts.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  function pick(item: Item) {
    onClose();
    if (item.ask) onAsk(item.ask);
    else go(item.target);
  }

  return (
    <>
      <div className="palette-backdrop" onClick={onClose} aria-hidden />
      <div className="palette" role="dialog" aria-label="Search everything">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search aircraft, defects, WOs, parts… or ask AI"
          aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            else if (e.key === "Enter" && results[cursor]) pick(results[cursor]);
          }}
        />
        <ul role="listbox" aria-label="Results">
          {results.map((r, i) => (
            <li
              key={`${r.label}-${i}`}
              role="option"
              aria-selected={i === cursor}
              className={i === cursor ? "active" : ""}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(r)}
            >
              <div className="pl-label">{r.label}</div>
              <div className="pl-sub muted">{r.sublabel}</div>
            </li>
          ))}
        </ul>
        <div className="pl-hint muted">↑↓ navigate · Enter select · Esc close</div>
      </div>
    </>
  );
}
