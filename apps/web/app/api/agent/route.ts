import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  buildScenarioProposal, evaluateRequest, getScenario, SCENARIOS,
  type Agent, type Capsule, type Evaluation, type Overview, type ScenarioId,
} from "@sentinel/engine";
import { viewCall, extractEvents, extractReturn, extractTxHash } from "@/lib/rpc";
import { txUrl } from "@/lib/config";
import { AGENT_ACCOUNT_ID, agentConfigured, submitAsAgent } from "@/lib/server/agent";
import { llmConfigured, proposeWithLlm } from "@/lib/server/llm";

export const dynamic = "force-dynamic";

const Body = z.object({
  scenario: z.enum(SCENARIOS.map((s) => s.id) as [ScenarioId, ...ScenarioId[]]),
  capsuleId: z.number().int().positive(),
  task: z.string().max(1000).optional(),
  externalContent: z.string().max(2000).optional(),
  simulate: z.boolean().default(false),
  useLlm: z.boolean().default(false),
});

// Simple per-IP limiter: the route spends the agent account's gas.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many agent runs. Wait a minute and try again." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  const { scenario, capsuleId, task, externalContent, useLlm } = parsed.data;
  const simulate = parsed.data.simulate || !agentConfigured();

  try {
    const [overview, capsule] = await Promise.all([
      viewCall<Overview>("get_overview"),
      viewCall<Capsule | null>("get_capsule", { capsule_id: capsuleId }),
    ]);
    if (!capsule) return NextResponse.json({ error: `Capsule #${capsuleId} not found on the contract.` }, { status: 404 });
    const agent = await viewCall<Agent | null>("get_agent", { agent_id: capsule.agent_id });
    if (!agent) return NextResponse.json({ error: `Agent ${capsule.agent_id} is not registered.` }, { status: 404 });
    if (!simulate && capsule.agent_id !== AGENT_ACCOUNT_ID) {
      return NextResponse.json({
        error: `Capsule #${capsuleId} is bound to ${capsule.agent_id}, but this server signs as ${AGENT_ACCOUNT_ID}. Pick a capsule for ${AGENT_ACCOUNT_ID}.`,
      }, { status: 409 });
    }

    const s = getScenario(scenario);
    let built = buildScenarioProposal(scenario, capsule, { task, externalContent });
    if (useLlm && llmConfigured() && s.nonce === "next") {
      try {
        const llm = await proposeWithLlm(capsule, built.task, built.externalContent, built.proposal.nonce);
        built = { ...built, proposal: llm.proposal, trace: [...llm.trace, "Server fixed capsule_id and nonce; the LLM cannot set them."] };
      } catch (e) {
        built.trace.unshift(`LLM unavailable (${e instanceof Error ? e.message : e}); used the deterministic agent.`);
      }
    }

    const preview = evaluateRequest({
      frozen: overview.frozen,
      vaultBalance: BigInt(overview.vault_balance),
      agent,
      capsule,
      request: built.proposal,
      nowMs: BigInt(Date.now()),
    });

    const base = {
      scenario: s.id, expected: s.expected, capsule, agent, task: built.task, externalContent: built.externalContent,
      proposal: built.proposal, trace: built.trace, preview,
    };
    if (simulate) {
      return NextResponse.json({ ...base, mode: "simulation", note: agentConfigured() ? "Simulated off-chain. Nothing was sent to the contract." : "Agent signer not configured, so this ran as an off-chain simulation only." });
    }

    let outcome: unknown;
    try {
      outcome = await submitAsAgent(built.proposal);
    } catch (e) {
      // A contract panic (e.g. unregistered caller) surfaces here as a failed transaction.
      return NextResponse.json({ ...base, mode: "onchain", failed: true, error: e instanceof Error ? e.message : String(e) }, { status: 200 });
    }
    const events = extractEvents(outcome);
    const evaluated = events.find((e) => e.event === "request_evaluated")?.data?.[0]?.evaluation as Evaluation | undefined;
    const final = extractReturn<Evaluation>(outcome);
    const hash = extractTxHash(outcome);
    return NextResponse.json({ ...base, mode: "onchain", txHash: hash, explorerUrl: hash ? txUrl(hash) : null, onchain: evaluated ?? null, final });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
