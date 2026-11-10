import { NextResponse } from "next/server";
import { AGENT_ACCOUNT_ID, agentConfigured } from "@/lib/server/agent";
import { llmConfigured } from "@/lib/server/llm";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ agentConfigured: agentConfigured(), agentAccountId: AGENT_ACCOUNT_ID || null, llmConfigured: llmConfigured() });
}
