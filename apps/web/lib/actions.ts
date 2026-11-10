/** Owner transactions. Each maps 1:1 to a contract method; "1" = 1 yoctoNEAR full-access confirmation. */
import { parseNear } from "@sentinel/engine";
import { GAS_300T, type CallResult } from "./wallet";

type Call = <T = unknown>(method: string, args: Record<string, unknown>, depositYocto?: string, gas?: string) => Promise<CallResult<T>>;
const ONE_YOCTO = "1";

export const ownerActions = (call: Call) => ({
  deposit: (amountNear: string) => call("deposit", {}, parseNear(amountNear).toString()),
  withdraw: (amountNear: string) => call("withdraw", { amount: parseNear(amountNear).toString() }, ONE_YOCTO, GAS_300T),
  freeze: () => call("freeze", {}),
  unfreeze: () => call("unfreeze", {}, ONE_YOCTO),
  registerAgent: (agentId: string, label: string) => call("register_agent", { agent_id: agentId, label }, ONE_YOCTO),
  suspendAgent: (agentId: string) => call("suspend_agent", { agent_id: agentId }),
  resumeAgent: (agentId: string) => call("resume_agent", { agent_id: agentId }, ONE_YOCTO),
  revokeAgent: (agentId: string) => call("revoke_agent", { agent_id: agentId }),
  reinstateAgent: (agentId: string) => call("reinstate_agent", { agent_id: agentId }, ONE_YOCTO),
  createCapsule: (input: Record<string, unknown>) => call("create_capsule", { input }, ONE_YOCTO),
  revokeCapsule: (capsuleId: number) => call("revoke_capsule", { capsule_id: capsuleId }),
  resolveReview: (requestId: number, approve: boolean) =>
    call("resolve_review", { request_id: requestId, approve }, approve ? ONE_YOCTO : "0", GAS_300T),
});
