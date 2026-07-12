import { useEffect, useRef, useState } from "react";
import type { Store, Tab } from "../App";
import {
  agentTurn,
  AUTO_TOOLS,
  type AgentMessage,
  type ContentBlock,
  type ProposedAction,
} from "../lib/ai";
import { buildSnapshot, describeAction, executeAction } from "../lib/actions";

// Chat transcript items rendered in the UI (a superset of what goes to the API).
type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "system"; text: string }
  | {
      kind: "action";
      action: ProposedAction;
      state: "pending" | "done" | "declined" | "error";
      result?: string;
    };

const SUGGESTIONS = [
  "What's stopping G-ALBB flying today?",
  "Which checks and ADs fall due in the next 30 days?",
  "Raise a defect on G-ALBE: cabin temp sensor u/s, zone 2",
  "Any compliance risks I should know about this morning?",
];

// Model turns chained on auto-executed tools alone (no human input between
// them) before we stop and hand control back to the user.
const MAX_AUTO_TURNS = 5;

export default function Assistant({
  active,
  storeRef,
  reload,
  keySet,
  onNeedKey,
  setTab,
  account,
  seed,
  onSeedConsumed,
}: {
  active: boolean;
  storeRef: { current: Store };
  reload: () => Promise<void>;
  keySet: boolean;
  onNeedKey: () => void;
  setTab: (t: Tab) => void;
  account: string;
  seed?: string | null;
  onSeedConsumed?: () => void;
}) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // API-visible history lives in a ref: it must stay in lockstep with the
  // tool_use / tool_result protocol even while UI state updates async.
  const history = useRef<AgentMessage[]>([]);
  const autoResults = useRef<ContentBlock[]>([]);
  const pendingResults = useRef<ContentBlock[]>([]);
  // How many confirmation cards the current turn is waiting on, and which have
  // already been handled. Refs (not state) because two rapid clicks must see
  // each other synchronously — React state commits too late for that.
  const expectedPending = useRef(0);
  const handledIds = useRef<Set<string>>(new Set());

  const hasPending = items.some((it) => it.kind === "action" && it.state === "pending");

  function push(...next: ChatItem[]) {
    setItems((cur) => [...cur, ...next]);
  }

  // A query handed over from the command palette: send it straight away if a
  // key is set, otherwise pre-fill the input so nothing is lost. The palette is
  // global, so a seed can arrive while this view is already open — it must fire
  // on every new seed, not only on mount.
  useEffect(() => {
    if (!seed) return;
    onSeedConsumed?.();
    if (keySet && !busy && !hasPending) void send(seed);
    else setInput(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  async function runTurn(depth = 0) {
    setBusy(true);
    try {
      const turn = await agentTurn(history.current, buildSnapshot(storeRef.current));
      history.current.push({ role: "assistant", content: turn.assistantBlocks });
      if (turn.text) push({ kind: "assistant", text: turn.text });
      if (turn.stopReason === "max_tokens")
        push({
          kind: "system",
          text: "The reply was cut short at the response length limit — ask for the rest, or narrow the question.",
        });

      if (turn.actions.length === 0) return;

      // Auto-execute safe UI tools; queue the rest as pending cards.
      const results: ContentBlock[] = [];
      let pendingCount = 0;
      for (const a of turn.actions) {
        if (AUTO_TOOLS.has(a.tool)) {
          if (a.tool === "navigate") setTab(a.input.tab as Tab);
          results.push({ type: "tool_result", tool_use_id: a.id, content: "Done — view opened." });
          push({ kind: "system", text: `Opened ${String(a.input.tab)} view` });
        } else {
          push({ kind: "action", action: a, state: "pending" });
          pendingCount++;
        }
      }
      if (pendingCount === 0) {
        // Everything auto-executed — let the model finish its answer. The results
        // must go back even when the budget is spent: a tool_use block left
        // without its tool_result would corrupt the history for the next message.
        history.current.push({ role: "user", content: results });
        if (depth + 1 >= MAX_AUTO_TURNS) {
          // Close the turn with an assistant message: leaving the transcript on a
          // user turn would make the next send() two consecutive user messages.
          history.current.push({
            role: "assistant",
            content: [{ type: "text", text: "[Stopped: automatic step limit reached.]" }],
          });
          push({
            kind: "system",
            text: `Stopped after ${MAX_AUTO_TURNS} automatic steps without an answer — send another message to continue.`,
          });
          return;
        }
        await runTurn(depth + 1);
      } else {
        // Hold auto results until the pending cards resolve, then send together.
        autoResults.current = results;
        pendingResults.current = [];
        expectedPending.current = pendingCount;
      }
    } catch (e) {
      push({ kind: "system", text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  async function resolveAction(item: ChatItem & { kind: "action" }, approved: boolean) {
    // Synchronous double-click / double-resolve guard.
    if (handledIds.current.has(item.action.id)) return;
    handledIds.current.add(item.action.id);
    let state: "done" | "declined" | "error" = approved ? "done" : "declined";
    let result: string;
    if (approved) {
      try {
        result = await executeAction(item.action, storeRef.current, account);
        await reload();
      } catch (e) {
        state = "error";
        result = e instanceof Error ? e.message : String(e);
      }
    } else {
      result = "Declined by user.";
    }

    setItems((cur) =>
      cur.map((it) =>
        it.kind === "action" && it.action.id === item.action.id ? { ...it, state, result } : it,
      ),
    );

    pendingResults.current.push({
      type: "tool_result",
      tool_use_id: item.action.id,
      content: result,
      is_error: state === "error" || undefined,
    });
    // Flush back to the model only when every card from this turn has resolved.
    // Counting collected results (not scanning UI state) makes this safe under
    // concurrent confirmations — exactly one resolver sees the full count.
    if (pendingResults.current.length >= expectedPending.current) {
      history.current.push({
        role: "user",
        content: [...autoResults.current, ...pendingResults.current],
      });
      autoResults.current = [];
      pendingResults.current = [];
      expectedPending.current = 0;
      await runTurn();
    }
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    // A new user message while tool_use blocks await their tool_results would
    // corrupt the API history — resolve the cards first.
    if (hasPending) {
      push({ kind: "system", text: "Confirm or decline the pending action cards before sending a new message." });
      return;
    }
    if (!keySet) return onNeedKey();
    setInput("");
    push({ kind: "user", text: q });
    history.current.push({ role: "user", content: q });
    await runTurn();
  }

  // Mounted on every tab (App keeps the session alive across navigation) but
  // renders nothing when another view is showing — no hidden DOM, so nothing
  // here is focusable, announced, or matched by a query on the visible view.
  if (!active) return null;

  return (
    <>
      <h1>AI Assistant</h1>
      <p className="subtitle">
        Ask anything, or ask it to do anything — every change it proposes needs your confirmation.
        Sign-offs, CRS, deferrals and quarantine stay in their own views: those are licence-holder acts.
      </p>

      {items.length === 0 && (
        <div className="row" style={{ marginBottom: 16 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="btn ghost" onClick={() => void send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="chat" role="log" aria-live="polite" aria-label="Conversation">
        {items.map((it, idx) => {
          if (it.kind === "action") {
            const cls = it.state === "done" ? "done" : it.state === "pending" ? "" : "declined";
            return (
              <div key={idx} className={`action-card ${cls}`}>
                <div className="ac-title">
                  <span aria-hidden>
                    {it.state === "done" ? "✅" : it.state === "pending" ? "⏳" : "🚫"}
                  </span>
                  Proposed action{it.state !== "pending" && ` — ${it.state}`}
                </div>
                <div className="ac-desc">{describeAction(it.action)}</div>
                {it.state === "pending" && (
                  <div className="row">
                    <button className="btn" onClick={() => void resolveAction(it, true)}>
                      Confirm & execute
                    </button>
                    <button className="btn ghost" onClick={() => void resolveAction(it, false)}>
                      Decline
                    </button>
                  </div>
                )}
                {it.result && <div className="ac-result muted">{it.result}</div>}
              </div>
            );
          }
          return (
            <div key={idx} className={`msg ${it.kind}`}>
              {it.text}
            </div>
          );
        })}
        {busy && <div className="msg system" role="status">Thinking…</div>}
      </div>

      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder={hasPending ? "Resolve the pending action cards first…" : "Ask, or tell it what to do…"}
          aria-label="Message the assistant"
          disabled={busy || hasPending}
        />
        <button className="btn" onClick={() => void send()} disabled={busy || hasPending || !input.trim()}>
          Send
        </button>
      </div>
    </>
  );
}
