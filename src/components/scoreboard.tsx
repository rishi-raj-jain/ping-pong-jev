import { FIELD } from '@/lib/pong'

/** Live match state above the table: the two scores, the rally, and ball pace. */
export function Scoreboard({ humanScore, jevScore, rally, ballSpeed }: { humanScore: number; jevScore: number; rally: number; ballSpeed: number }) {
  return (
    <div className="flex items-stretch justify-between gap-3">
      <Side label="YOU" score={humanScore} accent="var(--human)" align="left" />

      <div className="flex flex-col items-center justify-center px-2 text-center">
        <div className="text-(length:--text-xs) tracking-widest text-(--ink-faint)">FIRST TO {FIELD.winScore}</div>
        <div className="tnum mt-0.5 text-(length:--text-xs) text-(--ink-dim)">
          rally <span className="text-(--ink)">{rally}</span>
        </div>
        <div className="tnum text-(length:--text-xs) text-(--ink-dim)">
          <span className="text-(--ink)">{Math.round(ballSpeed)}</span> px/s
        </div>
      </div>

      <Side label="JEV" score={jevScore} accent="var(--jev)" align="right" />
    </div>
  )
}

function Side({ label, score, accent, align }: { label: string; score: number; accent: string; align: 'left' | 'right' }) {
  return (
    <div className={`flex flex-1 flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <div className="text-(length:--text-xs) font-semibold tracking-widest" style={{ color: accent }}>
        {label}
      </div>
      <div className="tnum text-4xl leading-none font-bold sm:text-5xl" style={{ color: accent }}>
        {score}
      </div>
    </div>
  )
}
