import { JevBrainBadge } from '@/components/jev-brain-badge'
import type { JevAction, JevDecision, JevInput } from '@/lib/pong'

/**
 * The "what Jev sees / what Jev chose" panel — the demo's whole thesis made
 * visible. On the left, the exact normalized state that goes into the model
 * every tick; on the right, the single typed decision that comes back. It is
 * deliberately the same six numbers named in the brief (ball position, ball
 * velocity, paddle position, opponent position) and the same three moves.
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
          <div className="mt-2 space-y-1.5">
            <ActionRow action="MOVE_UP" current={decision?.action} confidence={decision?.action === 'MOVE_UP' ? decision.confidence : 0} />
            <ActionRow action="STAY" current={decision?.action} confidence={decision?.action === 'STAY' ? decision.confidence : 0} />
            <ActionRow action="MOVE_DOWN" current={decision?.action} confidence={decision?.action === 'MOVE_DOWN' ? decision.confidence : 0} />
          </div>
        </div>
      </div>

      <p className="mt-3 text-(length:--text-xs) leading-relaxed text-(--ink-faint)">
        Unstructured state in, one typed decision out — no tokens, no parsing, and, per TypeSafe, no way to answer outside the three legal moves.
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

/** One of the three moves, lit up when it is the current choice, with a bar for its confidence. */
function ActionRow({ action, current, confidence }: { action: JevAction; current: JevAction | undefined; confidence: number }) {
  const active = action === current
  const pct = Math.round(confidence * 100)
  return (
    <div className={`rounded-md px-2 py-1 transition-colors ${active ? 'bg-(--jev)/10' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`text-(length:--text-sm) ${active ? 'font-semibold text-(--jev)' : 'text-(--ink-faint)'}`}>{action}</span>
        <span className={`tnum text-(length:--text-xs) ${active ? 'text-(--jev)' : 'text-transparent'}`}>{pct}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-(--panel-line)">
        <div className="h-full rounded-full bg-(--jev) transition-[width] duration-100" style={{ width: active ? `${pct}%` : '0%' }} />
      </div>
    </div>
  )
}

const fmt = (n: number) => n.toFixed(2)
const signed = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2))
