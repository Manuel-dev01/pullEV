import type { NextRequest } from "next/server";
import { getPacks, getPool, getEV } from "@/lib/api";
import { DEEPSEEK_BASE, DEEPSEEK_MODEL, buildContext, extractCitations, systemPrompt } from "@/lib/advisor";

// Grounded Pull Advisor. Runs server-side (Node) so the DeepSeek key is never
// exposed to the client. The model receives ONLY the computed EV + pool + provenance
// context and must cite every number; it degrades gracefully if unconfigured.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return Response.json({
      error:
        "Advisor is not configured (no DEEPSEEK_API_KEY). The EV, distribution, pool and proof are all still verifiable directly on the page.",
    });
  }

  let packId = "";
  let question = "";
  try {
    const body = await req.json();
    packId = String(body.packId ?? "");
    question = String(body.question ?? "").slice(0, 500);
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  if (!packId || !question) return Response.json({ error: "Missing pack or question." }, { status: 400 });

  const packs = await getPacks();
  const pack = packs.data.find((p) => p.id === packId);
  if (!pack) return Response.json({ error: "No data available for this pack." });

  // Fetch this pack's pool plus EV for EVERY pack, so the advisor can compare and answer
  // "what should I rip". All numbers stay real; nothing is invented.
  const [pool, evResults] = await Promise.all([
    getPool(packId),
    Promise.all(packs.data.map((p) => getEV(p.id).then((e) => ({ id: p.id, name: p.name, ev: e })))),
  ]);
  const active = evResults.find((r) => r.id === packId)?.ev;
  if (!pool || !active) return Response.json({ error: "No data available for this pack." });

  const overview = evResults
    .filter((r) => r.ev)
    .map((r) => {
      const ratio = r.ev!.data.evToCostRatio;
      return {
        name: r.name,
        edge: (ratio - 1) * 100,
        verdict: ratio >= 1.05 ? "RIP" : ratio >= 0.98 ? "MARGINAL" : "SKIP",
      };
    });

  const context = buildContext(pack, active.data, pool.data, overview);

  try {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${question}` },
        ],
      }),
    });
    if (!res.ok) {
      return Response.json({ error: `Advisor upstream error (${res.status}).` });
    }
    const data = await res.json();
    const answer: string = data.choices?.[0]?.message?.content?.trim() ?? "No answer produced.";
    return Response.json({ answer, citations: extractCitations(answer) });
  } catch {
    return Response.json({ error: "Advisor unreachable right now." });
  }
}
