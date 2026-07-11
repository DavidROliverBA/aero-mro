import { useState } from "react";
import { supabase } from "../lib/supabase";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme";
import { Pill } from "../components/ui";

const THEMES: { value: ThemePref; label: string; hint: string }[] = [
  { value: "dark", label: "Dark", hint: "Default — designed for the hangar at night" },
  { value: "light", label: "Light", hint: "Bright environments and projectors" },
  { value: "system", label: "System", hint: "Follow the device setting" },
];

export default function Settings({
  reload,
  keySet,
  onNeedKey,
}: {
  reload: () => Promise<void>;
  keySet: boolean;
  onNeedKey: () => void;
}) {
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  function chooseTheme(t: ThemePref) {
    setThemePref(t);
    setTheme(t);
  }

  async function resetDemo() {
    if (
      !window.confirm(
        "Reset ALL demo data? Every change made during the demonstration will be discarded and the seed dataset restored.",
      )
    )
      return;
    setResetting(true);
    setResetMsg(null);
    try {
      const { error } = await supabase.rpc("reset_demo_data");
      if (error) throw error;
      await reload();
      setResetMsg("Demo data restored to seed state — every module is back to its opening position.");
    } catch (e) {
      setResetMsg(`Reset failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">Appearance, AI access, and demo controls</p>

      <fieldset>
        <legend>Appearance</legend>
        <div className="row" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.value}
              className={`btn ${theme === t.value ? "" : "ghost"}`}
              role="radio"
              aria-checked={theme === t.value}
              onClick={() => chooseTheme(t.value)}
            >
              {t.value === "dark" ? "🌙" : t.value === "light" ? "☀️" : "🖥"} {t.label}
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          {THEMES.find((t) => t.value === theme)?.hint}
        </p>
      </fieldset>

      <fieldset>
        <legend>AI</legend>
        <div className="row">
          <Pill tone={keySet ? "ok" : "muted"}>{keySet ? "Claude key set (in memory)" : "no key"}</Pill>
          <button className="btn ghost" onClick={onNeedKey}>
            {keySet ? "Replace key" : "Set Claude API key"}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          The key is held in memory only and is gone on refresh — it is never stored.
        </p>
      </fieldset>

      <fieldset style={{ borderColor: "var(--danger)" }}>
        <legend style={{ color: "var(--danger)" }}>Demo controls</legend>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Restores every table to the seed dataset, date-shifted to today — the AOG
          investigation, the imminent A-Check, the 97% landing-gear fitting, the
          weekend coverage gaps, all back in place for the next demonstration.
        </p>
        <button className="btn danger" onClick={() => void resetDemo()} disabled={resetting}>
          {resetting ? "Resetting…" : "Reset demo data"}
        </button>
        {resetMsg && (
          <div
            className={`banner ${resetMsg.startsWith("Reset failed") ? "danger" : ""}`}
            style={{ marginTop: 12, marginBottom: 0 }}
            role="status"
          >
            {resetMsg}
          </div>
        )}
      </fieldset>

      <p className="muted" style={{ fontSize: 12 }}>
        Signed-in account and sign-out live in the sidebar. Demo persona for the My Work
        view is remembered per device.
      </p>
    </>
  );
}
