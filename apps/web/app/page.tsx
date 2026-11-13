import Link from "next/link";
import { ArrowRight, FileLock2, KeyRound, ShieldCheck, ShieldX, Workflow, Zap } from "lucide-react";
import { IntentDiff } from "@/components/IntentDiff";

const EXAMPLE = [
  { field: "Operation", authorized: "NEAR transfer", proposed: "NEAR transfer", ok: true },
  { field: "Asset", authorized: "NEAR", proposed: "TOKENB", ok: false },
  { field: "Recipient", authorized: "vendor.testnet", proposed: "token-b-sale.testnet", ok: false },
  { field: "Amount", authorized: "up to 3 NEAR", proposed: "1 NEAR", ok: true },
];

const STEPS = [
  ["You write the instruction", "“Pay vendor.testnet up to 3 NEAR for this invoice, valid 24 hours.” TrustVault drafts the exact permissions from it."],
  ["You review and sign", "You see what the agent may and may not do, plus a fingerprint of the terms. Your wallet signs them to the vault contract."],
  ["The agent asks", "The agent is its own NEAR account, with a key that can only request payments. It never holds your keys or funds."],
  ["The contract checks every field", "Agent, capsule, expiry, replay, operation, asset, recipient, limits and balance. One mismatch and nothing moves."],
  ["Paid, held or refused", "Matching requests are paid. Anything else is refused, recorded on-chain and explained in plain words."],
];

const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium transition-colors";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span className="grid size-8 place-items-center rounded-lg border border-pass/30 bg-pass/10"><ShieldCheck className="size-[18px] text-[#34d399]" /></span>TrustVault
        </span>
        <div className="flex items-center gap-6 text-sm">
          <a href="#how" className="hidden text-dim transition-colors hover:text-fg sm:inline">How it works</a>
          <Link href="/console/attack-lab" className="hidden text-dim transition-colors hover:text-fg sm:inline">Attack lab</Link>
          <Link href="/console" className="inline-flex h-9 items-center rounded-lg bg-signal px-4 font-medium text-white transition-colors hover:bg-[#5374f5]">Open console</Link>
        </div>
      </nav>

      <header className="mx-auto grid max-w-6xl gap-14 px-6 pt-16 pb-24 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:pt-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel px-3 py-1 text-[13px] text-dim"><span className="size-1.5 rounded-full bg-pass" />Live on NEAR testnet</span>
          <h1 className="mt-6 max-w-xl text-[44px] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[56px]">Your AI can act. TrustVault makes sure it acts on your instructions.</h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-dim">A NEAR vault that checks every payment your AI agent requests against the exact terms you signed, and refuses everything else.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/console" className={`${btn} bg-signal text-white hover:bg-[#5374f5]`}>Open the console<ArrowRight className="size-4" /></Link>
            <Link href="/console/attack-lab" className={`${btn} border border-line-strong bg-raised hover:bg-hover`}>Try to break it</Link>
          </div>
        </div>
        <figure className="surface p-5 sm:p-6">
          <IntentDiff rows={EXAMPLE} caption="Example: a hijacked agent's proposal" />
          <figcaption className="mt-5 flex gap-3 rounded-[10px] border border-block/25 bg-block/[0.06] p-4">
            <ShieldX className="mt-0.5 size-5 shrink-0 text-[#ff7b7b]" />
            <div className="text-sm leading-relaxed">
              <div className="font-semibold">Blocked: unauthorized asset</div>
              <p className="mt-0.5 text-dim">A product page told the agent to “buy TOKENB instead”. The amount is under the limit, so a spending cap alone would have let it through.</p>
            </div>
          </figcaption>
        </figure>
      </header>

      <section className="border-y border-line bg-sidebar">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2">
          <h2 className="max-w-md text-[30px] leading-tight font-semibold tracking-[-0.025em]">A payment can pass every limit and still not be what you asked for.</h2>
          <div className="space-y-5 text-[16px] leading-relaxed text-dim">
            <p>Agents read web pages, emails and tool output. Any of them can carry instructions. A hijacked agent rarely tries to drain a wallet; it makes a small, plausible payment to the wrong place.</p>
            <p>Spending limits check the size of a payment. TrustVault checks its meaning: the recipient, asset, operation and amount you approved for that task, for that agent, until that time, once.</p>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-[30px] font-semibold tracking-[-0.025em]">How it works</h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-5">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="relative">
              <span className="grid size-8 place-items-center rounded-full border border-line-strong bg-panel text-[13px] font-semibold tabular text-link">{i + 1}</span>
              <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 md:grid-cols-2">
        <div className="surface p-8">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">What NEAR does here</h2>
          <ul className="mt-6 space-y-5 text-sm leading-relaxed text-dim">
            <li className="flex gap-3"><FileLock2 className="mt-0.5 size-5 shrink-0 text-link" /><span><span className="font-medium text-fg">Contract custody.</span> Funds sit in the vault, and only the contract's own checks can release them.</span></li>
            <li className="flex gap-3"><KeyRound className="mt-0.5 size-5 shrink-0 text-link" /><span><span className="font-medium text-fg">Function-call keys.</span> The agent's key can call one method on one contract, nothing else.</span></li>
            <li className="flex gap-3"><Zap className="mt-0.5 size-5 shrink-0 text-link" /><span><span className="font-medium text-fg">Fast containment.</span> Freezing and revoking work instantly. Anything that gives an agent more power needs full wallet confirmation.</span></li>
            <li className="flex gap-3"><Workflow className="mt-0.5 size-5 shrink-0 text-link" /><span><span className="font-medium text-fg">Promises and callbacks.</span> A payment counts as spent only after it succeeds; failures are refunded.</span></li>
          </ul>
        </div>
        <div className="surface p-8">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">What it does not do</h2>
          <ul className="mt-6 space-y-5 text-sm leading-relaxed text-dim">
            <li>It doesn't make the agent smarter. It assumes the agent can be fooled and limits what a fooled agent can do.</li>
            <li>It can't fix a bad capsule. If you authorize the wrong recipient, the contract enforces the wrong recipient.</li>
            <li>This version protects native NEAR transfers. Token transfers, swaps and arbitrary contract calls are refused, not supported.</li>
          </ul>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-6 py-8 text-sm text-faint">
          <span>TrustVault. Built at NEAR HACKATHON 2026. Testnet only.</span>
          <Link href="/console" className="transition-colors hover:text-dim">Console</Link>
        </div>
      </footer>
    </div>
  );
}
