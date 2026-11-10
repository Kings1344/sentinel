import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { IntentDiff } from "@/components/IntentDiff";

const EXAMPLE = [
  { field: "Operation", authorized: "native_transfer", proposed: "native_transfer", ok: true },
  { field: "Asset", authorized: "NEAR", proposed: "TOKENB", ok: false },
  { field: "Recipient", authorized: "vendor.testnet", proposed: "token-b-sale.testnet", ok: false },
  { field: "Amount", authorized: "≤ 3 NEAR", proposed: "1 NEAR", ok: true },
];

const STEPS = [
  ["You write the instruction", "“Pay vendor.testnet up to 3 NEAR for this invoice, valid 24 hours.” Sentinel drafts the exact fields from it."],
  ["You review and sign", "You see what the agent may and may not do, plus a SHA-256 commitment of the terms. Your wallet signs it to the vault contract."],
  ["The agent asks", "The agent is a separate NEAR account with a key that can only call request_transfer. It never holds your keys or the vault's funds."],
  ["The contract checks every field", "Agent, capsule, expiry, nonce, operation, asset, recipient, per-payment and total limits, vault balance. One mismatch and nothing moves."],
  ["Paid, held or refused", "Matching requests are paid and settled through a callback. Anything else is refused, recorded on-chain and explained."],
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-signal" />Sentinel</span>
        <div className="flex items-center gap-5 text-sm">
          <a href="#how" className="text-dim hover:text-fg">How it works</a>
          <Link href="/console/attack-lab" className="text-dim hover:text-fg">Attack lab</Link>
          <Link href="/console" className="rounded-md bg-signal px-3.5 py-2 font-medium text-white hover:bg-[#1f6af0]">Open console</Link>
        </div>
      </nav>

      <header className="mx-auto grid max-w-6xl gap-10 px-5 pt-10 pb-20 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:pt-16">
        <div>
          <h1 className="max-w-xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl">Your AI can act. Sentinel makes sure it acts on your instructions.</h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-dim">
            An on-chain vault on NEAR that checks every payment your AI agent requests against the exact terms you signed, and refuses everything else.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/console" className="rounded-md bg-signal px-4 py-2.5 font-medium text-white hover:bg-[#1f6af0]">Open the console</Link>
            <Link href="/console/attack-lab" className="rounded-md border border-line bg-raised px-4 py-2.5 font-medium hover:border-dim/50">Try to break it</Link>
          </div>
        </div>
        <figure className="rounded-xl border border-line bg-panel p-4 sm:p-5">
          <IntentDiff rows={EXAMPLE} caption="Example intent diff" />
          <figcaption className="mt-4 space-y-1.5 text-sm">
            <p><span className="font-medium text-block">Blocked: asset mismatch.</span> <span className="text-dim">A product page told the agent to “buy TOKENB instead”. The amount is under the limit, so a spending cap alone would have let it through.</span></p>
            <p className="text-xs text-faint">Illustration of a real Attack Lab scenario. Run it yourself against the deployed contract.</p>
          </figcaption>
        </figure>
      </header>

      <section className="border-y border-line bg-panel/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-2">
          <h2 className="max-w-md text-2xl font-semibold tracking-tight">A payment can pass every limit and still not be what you asked for.</h2>
          <div className="space-y-4 leading-relaxed text-dim">
            <p>Agents read web pages, emails and tool output. Any of them can carry instructions. A hijacked agent rarely asks to drain a wallet; it asks for a small, plausible payment to the wrong place.</p>
            <p>Spending limits and allowlists check the size of a payment. Sentinel checks its meaning: the specific recipient, asset, operation and amount you approved for that task, for that agent, until that time, once per nonce.</p>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-5">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="border-t border-line pt-4">
              <div className="text-sm text-signal tabular">Step {i + 1}</div>
              <h3 className="mt-1 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-20 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">What NEAR does here</h2>
          <ul className="mt-5 space-y-3 leading-relaxed text-dim">
            <li><span className="font-medium text-fg">Contract custody.</span> Funds sit in the vault contract, and only the contract's own checks can release them.</li>
            <li><span className="font-medium text-fg">Function-call keys.</span> The agent's key can call one method on one contract. It cannot sign anything else.</li>
            <li><span className="font-medium text-fg">1 yoctoNEAR confirmations.</span> Anything that gives an agent more power needs a full-access wallet signature. Freezing and revoking do not, so you can react fast.</li>
            <li><span className="font-medium text-fg">Promises and callbacks.</span> A payment counts as spent only after the transfer succeeds; failures are refunded to the vault.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">What it does not do</h2>
          <ul className="mt-5 space-y-3 leading-relaxed text-dim">
            <li>It does not make the agent smarter. It assumes the agent can be fooled and limits what a fooled agent can do.</li>
            <li>It cannot fix a bad capsule. If you authorize the wrong recipient, the contract enforces the wrong recipient.</li>
            <li>This version protects native NEAR transfers only. Token transfers, swaps and arbitrary contract calls are refused, not supported.</li>
          </ul>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-6 text-sm text-faint">
          <span>Sentinel. Built at NEAR HACKATHON 2026. Testnet only.</span>
          <Link href="/console" className="hover:text-dim">Console</Link>
        </div>
      </footer>
    </div>
  );
}
