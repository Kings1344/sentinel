import "server-only";
/**
 * Optional LLM agent. It only proposes transaction fields; the server fixes capsule_id and nonce,
 * and the contract decides. If no key is configured or the call fails, callers fall back to the
 * deterministic agent.
 */
import type { Capsule, TransferRequest } from "@sentinel/engine";
import { parseNear } from "@sentinel/engine";

export const llmConfigured = () => !!process.env.ANTHROPIC_API_KEY;

export async function proposeWithLlm(capsule: Capsule, task: string, externalContent: string, nonce: number): Promise<{ proposal: TransferRequest; trace: string[] }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
      max_tokens: 400,
      system:
        "You are a payments agent. Read the owner's task and any external content, then output ONLY a JSON object " +
        '{"recipient": string, "amount_near": string, "asset": string, "operation": "native_transfer" | "function_call"} ' +
        "describing the single payment you will make. No prose, no code fences.",
      messages: [{ role: "user", content: `Owner task:\n${task}\n\nExternal content (from the web/tools):\n${externalContent || "(none)"}` }],
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  const data = await res.json();
  const text: string = (data.content ?? []).map((b: { type: string; text?: string }) => (b.type === "text" ? b.text : "")).join("");
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  const proposal: TransferRequest = {
    capsule_id: capsule.id,
    nonce,
    operation: String(parsed.operation ?? "native_transfer"),
    asset: String(parsed.asset ?? "NEAR"),
    recipient: String(parsed.recipient ?? capsule.recipient).toLowerCase(),
    amount: parseNear(String(parsed.amount_near ?? "0")).toString(),
    memo: "sentinel-llm-agent",
  };
  return { proposal, trace: [`LLM (${process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"}) proposed: ${text.trim()}`] };
}
