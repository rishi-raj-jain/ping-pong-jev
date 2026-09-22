import { GameArena } from '@/components/game-arena'
import type { Metadata } from 'next'

export const metadata: Metadata = { alternates: { canonical: '/' } }

/**
 * The whole product on one page: a short pitch for what Jev is, the playable
 * table, and a plain-language "how the opponent thinks" section that ties the
 * game loop back to TypeSafe's claims. Kept intentionally lean — one screen of
 * chrome around the game so it stays shareable.
 */
export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-(length:--text-sm) font-semibold tracking-wide">
          <span className="text-(--human)">●</span>
          <span className="text-(--ink)">Human</span>
          <span className="text-(--ink-faint)">vs</span>
          <span className="text-(--jev)">Jev</span>
          <span className="text-(--jev)">●</span>
        </div>
        <a href="https://typesafe.ai/blog/introducing-system-one-models-and-jev" target="_blank" rel="noreferrer" className="text-(length:--text-xs) text-(--ink-dim) hover:text-(--jev)">
          What is Jev? ↗
        </a>
      </header>

      <section className="mb-7">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          Pong, but the right paddle is a <span className="text-(--jev)">System One model</span>.
        </h1>
        <p className="mt-3 text-(length:--text-base) leading-relaxed text-pretty text-(--ink-dim)">
          <a href="https://typesafe.ai" target="_blank" rel="noreferrer">
            Jev
          </a>{' '}
          doesn&rsquo;t write sentences. It takes unstructured state — the ball&rsquo;s position and velocity, where each paddle is — and returns one <em className="text-(--ink)">typed</em> decision:{' '}
          <code className="rounded bg-(--bg-soft) px-1 py-0.5 text-(length:--text-sm) text-(--jev)">aim</code>, a single calibrated number from{' '}
          <code className="rounded bg-(--bg-soft) px-1 py-0.5 text-(length:--text-sm) text-(--jev)">0</code> to <code className="rounded bg-(--bg-soft) px-1 py-0.5 text-(length:--text-sm) text-(--jev)">1</code> — exactly
          where it expects the ball to cross its line. The paddle homes straight to it. TypeSafe says that&rsquo;s ~40–200× faster than an LLM, and it mathematically can&rsquo;t hallucinate a value out of range. So: can
          you beat it?
        </p>
      </section>

      <GameArena />

      <section className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Feature
          title="State in, decision out"
          body="Every tick, the six numbers on the right are handed to Jev. It answers with one calibrated target and a confidence — a frontier-intelligence function call inside the game loop."
        />
        <Feature title="No tokens to parse" body="There is no sentence to interpret and nothing to regex. The answer is a single typed number in range, so the paddle can act on it directly." />
        <Feature title="Fast enough to play" body="A System One model is built for real-time decisions. Query it dozens of times a second and the paddle just… moves. Set TYPESAFE_API_KEY to feel the live version." />
      </section>

      <footer className="mt-10 border-t border-(--panel-line) pt-5 text-(length:--text-xs) text-(--ink-faint)">
        <p>
          Built with Next.js. The opponent is{' '}
          <a href="https://typesafe.ai/blog/introducing-system-one-models-and-jev" target="_blank" rel="noreferrer">
            Jev by TypeSafe
          </a>
          . Without a key, it runs on a local reflex that speaks the same typed contract, so the demo works everywhere.
        </p>
      </footer>
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-(--panel-line) bg-(--panel) p-4">
      <h3 className="text-(length:--text-sm) font-semibold text-(--ink)">{title}</h3>
      <p className="mt-1.5 text-(length:--text-xs) leading-relaxed text-(--ink-dim)">{body}</p>
    </div>
  )
}
