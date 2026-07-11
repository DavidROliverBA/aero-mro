import { useState } from "react";
import { supabase } from "../lib/supabase";

// Usernames map to synthetic emails; Supabase Auth (GoTrue) does the actual
// credential handling — passwords are bcrypt-hashed server-side, never here.
const USERNAME_DOMAIN = "@aeromro.demo";

export default function Login() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"github" | "password" | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function signInGithub() {
    setBusy("github");
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setErr(error.message);
      setBusy(null);
    }
    // On success the browser redirects to GitHub, so no further UI needed.
  }

  async function signInPassword(evt: React.FormEvent) {
    evt.preventDefault();
    if (!username.trim() || !password) return;
    setBusy("password");
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: username.trim().toLowerCase() + USERNAME_DOMAIN,
      password,
    });
    if (error) {
      setErr(
        error.message === "Invalid login credentials"
          ? "Unknown username or wrong password."
          : error.message,
      );
      setBusy(null);
    }
    // On success onAuthStateChange in App.tsx takes over.
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: 16,
      }}
    >
      <div className="card" style={{ maxWidth: 380, width: "100%", padding: 32 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 6, textAlign: "center" }}>
          AeroMRO
          <small>Part-145 / CAMO · UK CAA + EASA</small>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "12px 0 20px", textAlign: "center" }}>
          Maintenance system access is restricted to authorised staff.
        </p>

        <form onSubmit={(e) => void signInPassword(e)}>
          <label htmlFor="li-user">Username</label>
          <input
            id="li-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="e.g. priya"
          />
          <label htmlFor="li-pass">Password</label>
          <input
            id="li-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="btn"
            style={{ width: "100%", padding: "11px 14px", marginTop: 14 }}
            disabled={busy !== null || !username.trim() || !password}
          >
            {busy === "password" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="row" style={{ margin: "16px 0", alignItems: "center" }}>
          <div style={{ flex: 1, borderTop: "1px solid var(--border)" }} />
          <span className="muted" style={{ fontSize: 11 }}>or</span>
          <div style={{ flex: 1, borderTop: "1px solid var(--border)" }} />
        </div>

        <button
          className="btn ghost"
          style={{ width: "100%", padding: "11px 14px" }}
          onClick={() => void signInGithub()}
          disabled={busy !== null}
        >
          {busy === "github" ? "Redirecting to GitHub…" : "Sign in with GitHub"}
        </button>

        {err && (
          <div className="ai-out" style={{ color: "var(--danger)", marginTop: 14 }} role="alert">
            {err}
          </div>
        )}
        <p className="muted" style={{ fontSize: 11, marginTop: 16, marginBottom: 0, textAlign: "center" }}>
          Accounts are created by an administrator in Settings → User management.
        </p>
      </div>
    </div>
  );
}
