import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, FileLock2, KeyRound, ShieldCheck, Workflow, X, Zap } from "lucide-react";
import "./landing.css";

const EXPLORER = "https://testnet.nearblocks.io";

const COMPARE = [
  { field: "Operation", authorized: "NEAR transfer", proposed: "NEAR transfer", ok: true },
  { field: "Asset", authorized: "NEAR", proposed: "TOKENB", ok: false },
  { field: "Recipient", authorized: "vendor.testnet", proposed: "token-b-sale.testnet", ok: false },
  { field: "Amount", authorized: "up to 3 NEAR", proposed: "1 NEAR", ok: true },
];

const METRICS = [
  ["15", "deterministic checks on every request"],
  ["8", "real transactions on NEAR testnet"],
  ["0", "language-model calls in any authorization decision"],
  ["95", "automated tests (53 engine, 42 contract)"],
];

const STEPS = [
  ["You write the instruction", "“Pay vendor.testnet up to 3 NEAR for this invoice, valid 24 hours.” TrustVault drafts the exact permissions from it."],
  ["You review and sign", "You see what the agent may and may not do, plus a fingerprint of the terms. Your wallet signs them to the vault contract."],
  ["The agent asks", "The agent is its own NEAR account, with a key that can only request payments. It never holds your keys or funds."],
  ["The contract checks every field", "Agent, capsule, expiry, replay, operation, asset, recipient, limits and balance. One mismatch and nothing moves."],
  ["Paid, held or refused", "Matching requests are paid. Anything else is refused, recorded on-chain and explained in plain words."],
];

const PROOFS: [string, string, string, string, boolean][] = [
  ["Authorized payment", "0.1 NEAR to the vendor", "Approved", "dW7C8gHmwbg8dMcgi5StidbxzuKWFhu1kmfo6zPX85o", true],
  ["Prompt injection", "TOKENB to token-b-sale.testnet", "Blocked", "3jhcA6rKpRqwdHhqtKjHLkbbx6MHdrCrJMzTFx97jnmg", false],
  ["Recipient substitution", "0.1 NEAR to attacker-wallet.testnet", "Blocked", "Cds6gGanQdxE1Zn2LMvrRfgGGP7nnQt84TyYVhH2hsJn", false],
  ["Spending manipulation", "0.8 NEAR against a 0.3 limit", "Blocked", "CGVnMnioWcJYNdPNDobStLtXREmHn41Bx3fR8HVAwN5j", false],
  ["Authorization replay", "Reused an accepted nonce", "Blocked", "DkppM5vaGeJzf57ZoBsRPJMb5LFTv2JseTkkHbXUvXwf", false],
  ["Operation substitution", "function_call instead of transfer", "Blocked", "C3tnxoCQcJyAnEevyNUtRX9Vuvm3v5ppw8k8jDxzpjsK", false],
  ["Expired authorization", "Request after the capsule expired", "Expired", "4X2dJE4BRFso5x6UuP4AB6e3QTsGrQxssVAL9BKfda64", false],
  ["Revoked agent", "Request after the owner revoked the agent", "Revoked", "CMBb6LDgsATinSD8iKorY3qJDQtacBxkRCih3ZPyy6Nq", false],
];

const btn = "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-colors";

export default function Landing() {
  return (
    <div className="theme-light min-h-screen">
      <div className="relative overflow-hidden">
        <div aria-hidden className="tv-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[560px]" />

        <nav aria-label="Main" className="relative mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2.5 text-[16px] font-semibold tracking-[-0.01em]">
            <span className="grid size-9 place-items-center rounded-full bg-fg text-white"><ShieldCheck className="size-[18px]" /></span>TrustVault
          </span>
          <div className="flex items-center gap-1.5 rounded-full border border-line bg-panel/90 p-1.5 text-sm shadow-sm">
            <a href="#how" className="hidden rounded-full px-4 py-2 text-dim transition-colors hover:bg-raised hover:text-fg sm:inline">How it works</a>
            <a href="#proof" className="hidden rounded-full px-4 py-2 text-dim transition-colors hover:bg-raised hover:text-fg sm:inline">Proof</a>
            <Link href="/console/attack-lab" className="hidden rounded-full px-4 py-2 text-dim transition-colors hover:bg-raised hover:text-fg sm:inline">Attack lab</Link>
            <Link href="/console" className="inline-flex h-9 items-center rounded-full bg-fg px-5 font-medium text-white transition-colors hover:bg-signal">Open console</Link>
          </div>
        </nav>

        <header className="relative mx-auto max-w-6xl px-6 pt-14 pb-20 lg:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel px-3.5 py-1.5 text-[13px] text-dim"><span className="size-1.5 rounded-full bg-pass" />Live on NEAR testnet · AI Security &amp; Defense</span>
          <h1 className="mt-7 max-w-4xl text-[46px] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-[72px]">Your AI can act. TrustVault makes sure it acts on your instructions.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-dim sm:text-xl">A NEAR vault that checks every payment your AI agent requests against the exact terms you signed, and refuses everything else.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/console" className={`${btn} bg-fg text-white hover:bg-signal`}>Open the console<ArrowRight className="size-4" /></Link>
            <Link href="/console/attack-lab" className={`${btn} border border-line-strong bg-panel hover:bg-raised`}>Try to break it</Link>
          </div>
        </header>
      </div>

      <section aria-label="Key facts" className="mx-auto max-w-6xl px-6">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {METRICS.map(([n, label]) => (
            <div key={label} className="tv-card p-6">
              <dt className="sr-only">{label}</dt>
              <dd className="text-[44px] leading-none font-semibold tracking-[-0.04em] tabular">{n}</dd>
              <p aria-hidden className="mt-3 text-sm leading-snug text-dim">{label}</p>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-[34px] leading-tight font-semibold tracking-[-0.03em] sm:text-[40px]">A payment can pass every limit and still not be what you asked for.</h2>
            <p className="mt-6 text-[17px] leading-relaxed text-dim">Agents read web pages, emails and tool output, and any of them can carry instructions. A hijacked agent rarely tries to drain a wallet; it makes a small, plausible payment to the wrong place.</p>
            <p className="mt-4 text-[17px] leading-relaxed text-dim">Spending limits check the size of a payment. TrustVault checks its meaning: the recipient, asset, operation and amount you approved for that task, for that agent, until that time, once.</p>
          </div>
          <figure className="tv-card overflow-hidden">
            <div className="grid grid-cols-2 border-b border-line text-[13px]">
              <div className="p-4"><div className="text-faint">Spending limit alone</div><div className="mt-1 flex items-center gap-1.5 font-semibold text-hold"><Check className="size-4" aria-hidden />Would approve</div></div>
              <div className="border-l border-line bg-raised p-4"><div className="text-faint">TrustVault</div><div className="mt-1 flex items-center gap-1.5 font-semibold text-block"><X className="size-4" aria-hidden />Blocked: unauthorized asset</div></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="text-left text-[13px] text-faint">
                    <th scope="col" className="px-5 pt-4 pb-2 font-medium">Field</th>
                    <th scope="col" className="px-3 pt-4 pb-2 font-medium">Owner authorized</th>
                    <th scope="col" className="px-3 pt-4 pb-2 font-medium">Agent proposed</th>
                    <th scope="col" className="pt-4 pr-5 pb-2"><span className="sr-only">Result</span></th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((r) => (
                    <tr key={r.field} className={`border-t border-line ${r.ok ? "" : "bg-block/[0.06]"}`}>
                      <th scope="row" className="px-5 py-3 text-left font-medium text-dim">{r.field}</th>
                      <td className="px-3 py-3 font-mono text-[13px] break-all text-dim">{r.authorized}</td>
                      <td className={`px-3 py-3 font-mono text-[13px] break-all ${r.ok ? "text-fg" : "font-semibold text-block"}`}>{r.proposed}</td>
                      <td className="py-3 pr-5">
                        <span className={`grid size-6 place-items-center rounded-full ${r.ok ? "bg-pass/12 text-pass" : "bg-block/12 text-block"}`}>
                          {r.ok ? <Check className="size-3.5" aria-label="matches" /> : <X className="size-3.5" aria-label="does not match" />}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <figcaption className="border-t border-line p-5 text-sm leading-relaxed text-dim">Example: a product page told the agent to “buy TOKENB instead”. The amount is under the limit, so a spending cap alone would have let it through.</figcaption>
          </figure>
        </div>
      </section>

      <section id="how" className="border-y border-line bg-sidebar">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-[34px] font-semibold tracking-[-0.03em] sm:text-[40px]">How it works</h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-5">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="tv-card p-6">
                <span className="grid size-9 place-items-center rounded-full bg-fg text-[13px] font-semibold text-white tabular">{i + 1}</span>
                <h3 className="mt-5 text-[16px] leading-snug font-semibold">{title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-dim">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="proof" className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-[34px] font-semibold tracking-[-0.03em] sm:text-[40px]">Proof on NEAR testnet</h2>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-dim">Each row is a real transaction against the deployed vault. Only the first one moved funds. The rest were refused by the contract and recorded.</p>
        <ul className="mt-10 grid gap-3 md:grid-cols-2">
          {PROOFS.map(([name, what, result, hash, ok], i) => (
            <li key={hash}>
              <a href={`${EXPLORER}/txns/${hash}`} target="_blank" rel="noopener noreferrer" className="tv-card group flex items-center gap-4 p-5 transition-colors hover:bg-raised">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-raised text-[13px] font-semibold text-dim tabular">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{name}</span>
                  <span className="block truncate text-sm text-dim">{what}</span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium ${ok ? "bg-pass/12 text-pass" : "bg-block/10 text-block"}`}>{result}</span>
                <ArrowUpRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-fg" aria-label="Open on NearBlocks" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 md:grid-cols-2">
        <div className="tv-card p-8">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">What NEAR does here</h2>
          <ul className="mt-6 space-y-5 text-sm leading-relaxed text-dim">
            <li className="flex gap-3"><FileLock2 className="mt-0.5 size-5 shrink-0 text-link" /><span><span className="font-medium text-fg">Contract custody.</span> Funds sit in the vault, and only the contract's own checks can release them.</span></li>
            <li className="flex gap-3"><KeyRound className="mt-0.5 size-5 shrink-0 text-link" /><span><span className="font-medium text-fg">Function-call keys.</span> The agent's key can call one method on one contract, nothing else.</span></li>
            <li className="flex gap-3"><Zap className="mt-0.5 size-5 shrink-0 text-link" /><span><span className="font-medium text-fg">Fast containment.</span> Freezing and revoking work instantly. Anything that gives an agent more power needs full wallet confirmation.</span></li>
            <li className="flex gap-3"><Workflow className="mt-0.5 size-5 shrink-0 text-link" /><span><span className="font-medium text-fg">Promises and callbacks.</span> A payment counts as spent only after it succeeds; failures are refunded.</span></li>
          </ul>
        </div>
        <div className="tv-card p-8">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">What it does not do</h2>
          <ul className="mt-6 space-y-5 text-sm leading-relaxed text-dim">
            <li>It doesn't make the agent smarter. It assumes the agent can be fooled and limits what a fooled agent can do.</li>
            <li>It can't fix a bad capsule. If you authorize the wrong recipient, the contract enforces the wrong recipient.</li>
            <li>This version protects native NEAR transfers. Token transfers, swaps and arbitrary contract calls are refused, not supported.</li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-[28px] bg-fg px-8 py-14 text-center text-white sm:px-14">
          <h2 className="mx-auto max-w-2xl text-[32px] leading-tight font-semibold tracking-[-0.03em] sm:text-[40px]">See the contract refuse a hijacked agent.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/console" className={`${btn} bg-white text-fg hover:bg-raised`}>Open the console<ArrowRight className="size-4" /></Link>
            <Link href="/console/attack-lab" className={`${btn} border border-white/30 text-white hover:bg-white/10`}>Try to break it</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-6 py-8 text-sm text-faint">
          <span>TrustVault. Built at NEAR HACKATHON 2026. Testnet only.</span>
          <Link href="/console" className="transition-colors hover:text-fg">Console</Link>
        </div>
      </footer>
    </div>
  );
}
