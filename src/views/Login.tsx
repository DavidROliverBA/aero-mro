import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
    // On success the browser redirects to GitHub, so no further UI needed.
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div className="card" style={{ maxWidth: 380, width: "100%", textAlign: "center", padding: 32 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 6 }}>
          AeroMRO
          <small>Part-145 / CAMO · UK CAA + EASA</small>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "12px 0 24px" }}>
          Maintenance system access is restricted to authorised staff. Sign in with GitHub to continue.
        </p>
        <button className="btn" style={{ width: "100%", padding: "11px 14px" }} onClick={signIn} disabled={busy}>
          {busy ? "Redirecting to GitHub…" : "Sign in with GitHub"}
        </button>
        {err && (
          <div className="ai-out" style={{ color: "var(--danger)", marginTop: 14, textAlign: "left" }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
