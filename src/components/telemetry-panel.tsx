import { JevBrainBadge } from '@/components/jev-brain-badge'
import type { JevDecision, JevInput } from '@/lib/pong'

/**
 * The "what Jev sees / what Jev decided" panel — the demo's whole thesis made
 * visible. On the left, the exact normalized state that goes into the model
 * every tick (the six numbers named in the brief); on the right, the single
 * typed decision that comes back: `aim`, the height where Jev predicts the ball
 * will cross its line, which the paddle homes straight to.
 */
export function TelemetryPanel({ input, decision, latencyMs }: { input: JevInput | null; decision: JevDecision | null; latencyMs: number | null }) {
  return (
    <div className="rounded-xl border border-(--panel-line) bg-(--panel) p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-(length:--text-sm) font-semibold tracking-wide text-(--ink-dim)">JEV — DECISION FEED</h2>
        {decision ? <JevBrainBadge mode={decision.mode} /> : <span className="text-(length:--text-xs) text-(--ink-faint)">idle</span>}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-(--panel-line) bg-(--bg-soft) p-3">
          <div className="text-(length:--text-xs) tracking-widest text-(--ink-faint)">STATE IN</div>
          <dl className="mt-2 space-y-1.5">
            <Reading label="ball position" value={input ? `${fmt(input.ballX)}, ${fmt(input.ballY)}` : '—'} />
            <Reading label="ball velocity" value={input ? `${signed(input.ballVX)}, ${signed(input.ballVY)}` : '—'} />
            <Reading label="paddle position" value={input ? fmt(input.paddleY) : '—'} />
            <Reading label="opponent position" value={input ? fmt(input.opponentY) : '—'} />
          </dl>
        </div>

        <div className="rounded-lg border border-(--panel-line) bg-(--bg-soft) p-3">
          <div className="flex items-center justify-between">
            <div className="text-(length:--text-xs) tracking-widest text-(--ink-faint)">DECISION OUT</div>
            {latencyMs != null ? <span className="tnum text-(length:--text-xs) text-(--ink-faint)">{latencyMs} ms</span> : null}
          </div>

          <div className="mt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-(length:--text-sm) font-semibold text-(--jev)">aim</span>
              <span className="tnum text-(length:--text-sm) text-(--jev)">{decision ? fmt(decision.aim) : '—'}</span>
            </div>
            <p className="mt-0.5 text-(length:--text-xs) text-(--ink-faint)">predicted crossing height (0 top → 1 bottom)</p>
            <AimTrack aim={decision?.aim ?? null} paddle={input?.paddleY ?? null} />
          </div>

          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-(length:--text-xs) text-(--ink-dim)">confidence</span>
              <span className="tnum text-(length:--text-xs) text-(--ink)">{decision ? `${Math.round(decision.confidence * 100)}%` : '—'}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-(--panel-line)">
              <div className="h-full rounded-full bg-(--jev) transition-[width] duration-100" style={{ width: decision ? `${Math.round(decision.confidence * 100)}%` : '0%' }} />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-(length:--text-xs) leading-relaxed text-(--ink-faint)">
        Unstructured state in, one typed decision out — a single calibrated number, no tokens and nothing to parse, and, per TypeSafe, no way to answer outside the valid range.
      </p>
    </div>
  )
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-(length:--text-xs) text-(--ink-dim)">{label}</dt>
      <dd className="tnum text-(length:--text-sm) text-(--ink)">{value}</dd>
    </div>
  )
}

/**
 * A horizontal 0..1 track showing Jev's `aim` (solid marker) against the
 * paddle's current position (hollow marker), so you can watch the paddle close
 * the gap to the target each tick.
 */
function AimTrack({ aim, paddle }: { aim: number | null; paddle: number | null }) {
  return (
    <div className="relative mt-2 h-2.5 rounded-full bg-(--panel-line)">
      {paddle != null ? <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-(--ink-dim) bg-(--panel)" style={{ left: `${paddle * 100}%` }} title="paddle now" /> : null}
      {aim != null ? <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--jev) shadow-[0_0_8px_var(--jev-glow)]" style={{ left: `${aim * 100}%` }} title="Jev's aim" /> : null}
    </div>
  )
}

const fmt = (n: number) => n.toFixed(2)
const signed = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2))
