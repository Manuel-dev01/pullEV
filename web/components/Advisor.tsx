"use client";

import { useState } from "react";
import type { EVResult, Pack } from "@shared/types";

const C = { bg: "#08070c", panel: "#0f0b16", ink: "#f6f2fb", muted: "#9c94b6", teal: "#3ff0cf", pink: "#ff5fb4", indigo: "#7b7bff" };
const HUE = "linear-gradient(135deg,#ff5fb4,#7b7bff,#3ff0cf)";

type Msg = { role: "user" | "assistant"; text: string; citations?: string[]; grounded?: boolean };

export function Advisor({
  pack,
  ev,
  open,
  setOpen,
}: {
  pack: Pack;
  ev: EVResult;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(q?: string) {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, question }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: data.answer ?? data.error ?? "No response.", citations: data.citations, grounded: !data.error },
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Advisor is unavailable right now (network/engine)." }]);
    }
    setLoading(false);
  }

  return (
    <>
      <div
        onClick={() => setOpen(!open)}
        style={{ position: "fixed", bottom: 26, right: 26, zIndex: 60, cursor: "pointer", width: 60, height: 60, borderRadius: 18, background: HUE, display: "grid", placeItems: "center", boxShadow: "0 12px 34px rgba(201,92,245,.5)", animation: "pv-orb 3s infinite" }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: C.bg }}>EV</span>
      </div>

      {open && (
        <div style={{ position: "fixed", bottom: 100, right: 26, zIndex: 60, width: "min(380px,calc(100vw - 52px))", maxHeight: "70vh", display: "flex", flexDirection: "column", borderRadius: 20, background: "linear-gradient(180deg,#14101d,#0b0912)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 30px 70px rgba(0,0,0,.6)", overflow: "hidden", animation: "pv-rise .3s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: HUE, display: "grid", placeItems: "center", fontFamily: "var(--font-display)", color: C.bg, fontSize: 13 }}>EV</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1 }}>PULL ADVISOR</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: C.muted }}>grounded · cites every number · not advice</div>
            </div>
            <div onClick={() => setOpen(false)} style={{ cursor: "pointer", color: C.muted, fontSize: 20, lineHeight: 1 }}>×</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14, minHeight: 120 }}>
            {msgs.length === 0 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Ask about <strong style={{ color: C.ink }}>{pack.name}</strong>. I answer only from its computed EV, distribution, pool, and Renaiss Index prices, citing each number.
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {[`Should I rip ${pack.name}?`, "What's the chance of profit?", "What's the top card worth?"].map((q) => (
                    <button key={q} onClick={() => ask(q)} style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "#c9c1e0", border: "1px solid rgba(255,255,255,.14)", borderRadius: 999, padding: "5px 10px", background: "transparent" }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} style={{ alignSelf: "flex-end", background: "rgba(255,95,180,.14)", border: "1px solid rgba(255,95,180,.3)", borderRadius: "14px 14px 4px 14px", padding: "11px 14px", fontSize: 13.5, maxWidth: "82%" }}>{m.text}</div>
              ) : (
                <div key={i} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)", borderRadius: "14px 14px 14px 4px", padding: "13px 15px", fontSize: 13.5, lineHeight: 1.6, color: "#e6e0f2" }}>
                  {m.text}
                  {m.citations && m.citations.length > 0 && (
                    <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
                      {m.citations.map((c, j) => (
                        <span key={j} style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: C.indigo, border: "1px solid rgba(123,123,255,.35)", borderRadius: 6, padding: "3px 7px" }}>{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {loading && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C.muted }}>thinking…</div>}
          </div>

          <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", gap: 8, alignItems: "center", background: C.panel }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about this pack…"
              style={{ flex: 1, fontSize: 13, color: C.ink, background: "transparent", border: "none", outline: "none" }}
            />
            <button onClick={() => ask()} disabled={loading} style={{ border: "none", cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 13, color: C.bg, padding: "9px 16px", borderRadius: 9, background: HUE }}>ASK</button>
          </div>
        </div>
      )}
    </>
  );
}
