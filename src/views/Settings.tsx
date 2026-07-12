import { useState } from "react";
import type { Store } from "../App";
import { supabase } from "../lib/supabase";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme";
import { EmptyState, Pill } from "../components/ui";

const THEMES: { value: ThemePref; label: string; hint: string }[] = [
  { value: "dark", label: "Dark", hint: "Default — designed for the hangar at night" },
  { value: "light", label: "Light", hint: "Bright environments and projectors" },
  { value: "system", label: "System", hint: "Follow the device setting" },
];

export default function Settings({
  store,
  reload,
  keySet,
  onSetKey,
  account,
  isAdmin,
}: {
  store: Store;
  reload: () => Promise<void>;
  keySet: boolean;
  onSetKey: (k: string) => void;
  account: string;
  isAdmin: boolean;
}) {
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  // User management
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newEngId, setNewEngId] = useState("");
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [userBusy, setUserBusy] = useState<string | null>(null); // "create" | username being removed
  // Change my password (password accounts only)
  const [myPass, setMyPass] = useState("");
  const [passMsg, setPassMsg] = useState<string | null>(null);

  // `account` is resolved from the allow-list row bound to the authenticated uid
  // (App.tsx), so this matches identity, not a self-assertable metadata claim.
  const me = store.allowedUsers.find((u) => u.username === account) ?? null;

  async function createUser() {
    setUserBusy("create");
    setUserMsg(null);
    try {
      const { error } = await supabase.rpc("create_app_user", {
        p_username: newUser.trim().toLowerCase(),
        p_password: newPass,
        p_engineer_id: newEngId || null,
      });
      if (error) throw error;
      setUserMsg(`Account “${newUser.trim().toLowerCase()}” created.`);
      setNewUser("");
      setNewPass("");
      setNewEngId("");
      await reload();
    } catch (e) {
      setUserMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUserBusy(null);
    }
  }

  async function removeUser(username: string) {
    if (!window.confirm(`Remove account “${username}”? They will lose all access immediately.`)) return;
    setUserBusy(username);
    setUserMsg(null);
    try {
      const { error } = await supabase.rpc("delete_app_user", { p_username: username });
      if (error) throw error;
      setUserMsg(`Account “${username}” removed.`);
      await reload();
    } catch (e) {
      setUserMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUserBusy(null);
    }
  }

  async function changeMyPassword() {
    setPassMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: myPass });
      if (error) throw error;
      setMyPass("");
      setPassMsg("Password changed.");
    } catch (e) {
      setPassMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

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
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="st-key">Claude API key</label>
            <input
              id="st-key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
            />
          </div>
          <button
            className="btn"
            disabled={!keyInput.trim()}
            onClick={() => {
              onSetKey(keyInput.trim());
              setKeyInput("");
            }}
          >
            {keySet ? "Replace key" : "Set key"}
          </button>
          <Pill tone={keySet ? "ok" : "muted"}>{keySet ? "key set (in memory)" : "no key"}</Pill>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Held in memory only and gone on refresh — never stored. For a key that never
          touches the browser at all, deploy <code>workers/ai-proxy</code> and set{" "}
          <code>VITE_AI_PROXY_URL</code>.
        </p>
      </fieldset>

      {!isAdmin && (
        <fieldset>
          <legend>User management</legend>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Creating and removing accounts, and resetting the demo data, are restricted to
            administrators. You are signed in as <strong>{account}</strong>.
          </p>
        </fieldset>
      )}

      {isAdmin && (
      <fieldset>
        <legend>User management</legend>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Accounts sign in with username + password (credentials handled by Supabase Auth,
          bcrypt-hashed — never stored by the app). Linking an engineer binds My Work and
          sign-offs to that login. GitHub logins listed here are allow-list entries.
        </p>
        {store.allowedUsers.length === 0 ? (
          <EmptyState>No users visible</EmptyState>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr><th>Username</th><th>Sign-in</th><th>Linked engineer</th><th>Added</th><th></th></tr>
              </thead>
              <tbody>
                {store.allowedUsers.map((u) => {
                  const eng = u.engineer_id ? store.engineersById.get(u.engineer_id) : undefined;
                  return (
                    <tr key={u.username}>
                      <td>
                        <strong>{u.username}</strong>
                        {u.username === account && <>{" "}<Pill tone="info">you</Pill></>}
                      </td>
                      <td><Pill tone={u.auth_kind === "password" ? "ok" : "muted"}>{u.auth_kind}</Pill></td>
                      <td className="muted">{eng ? `${eng.full_name} · ${eng.staff_no}` : "—"}</td>
                      <td className="muted">{new Date(u.added_at).toLocaleDateString("en-GB")}</td>
                      <td>
                        {u.username !== account && (
                          <button
                            className="btn ghost small"
                            disabled={userBusy !== null}
                            onClick={() => void removeUser(u.username)}
                          >
                            {userBusy === u.username ? "Removing…" : "Remove"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="um-user">New username</label>
            <input
              id="um-user"
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              placeholder="e.g. priya"
              autoCapitalize="none"
              autoComplete="off"
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="um-pass">Password (min 8)</label>
            <input
              id="um-pass"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="um-eng">Link to engineer (optional)</label>
            <select id="um-eng" value={newEngId} onChange={(e) => setNewEngId(e.target.value)}>
              <option value="">— none —</option>
              {store.engineers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} · {e.staff_no}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn"
            disabled={userBusy !== null || !newUser.trim() || newPass.length < 8}
            onClick={() => void createUser()}
          >
            {userBusy === "create" ? "Creating…" : "Create account"}
          </button>
        </div>
        {userMsg && (
          <div className={`banner ${userMsg.startsWith("Failed") ? "danger" : ""}`} style={{ marginTop: 12, marginBottom: 0 }} role="status">
            {userMsg}
          </div>
        )}
      </fieldset>
      )}

      {me?.auth_kind === "password" && (
        <fieldset>
          <legend>Change my password</legend>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="cp-pass">New password (min 8)</label>
              <input
                id="cp-pass"
                type="password"
                value={myPass}
                onChange={(e) => setMyPass(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button className="btn ghost" disabled={myPass.length < 8} onClick={() => void changeMyPassword()}>
              Change password
            </button>
          </div>
          {passMsg && (
            <div className={`banner ${passMsg.startsWith("Failed") ? "danger" : ""}`} style={{ marginTop: 12, marginBottom: 0 }} role="status">
              {passMsg}
            </div>
          )}
        </fieldset>
      )}

      {isAdmin && (
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
      )}

      <p className="muted" style={{ fontSize: 12 }}>
        Signed-in account and sign-out live in the sidebar. Demo persona for the My Work
        view is remembered per device.
      </p>
    </>
  );
}
