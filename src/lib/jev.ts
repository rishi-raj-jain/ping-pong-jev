/**
 * Server-side bridge to Jev (TypeSafe System One), used by `/api/jev`.
 *
 * This is the same shape as the hn-thread-judge pipeline: a single state is
 * described in words, a set of typed `questions` is attached, and Jev returns
 * typed `answers` — here a single `choice` over MOVE_UP / MOVE_DOWN / STAY with
 * a calibrated confidence. There is no free-text generation and, per TypeSafe,
 * no way for the model to return a value outside the choice set, which is why
 * the paddle can trust the answer without validation gymnastics.
 */

import { clamp, FIELD, JEV_FACE_X, type JevAction, type JevDecision, type JevInput } from '@/lib/pong'

const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const ACTIONS: JevAction[] = ['MOVE_UP', 'MOVE_DOWN', 'STAY']

/** Error with a stable code so the route can map it to an HTTP status. */
export class JevError extends Error {
  constructor(
    readonly code: 'no_key' | 'unavailable',
    message: string,
    readonly status = 502,
  ) {
    super(message)
    this.name = 'JevError'
  }
}

function jevKey(): string {
  const key = process.env.TYPESAFE_API_KEY
  if (!key) throw new JevError('no_key', 'Live Jev is not configured (missing TYPESAFE_API_KEY).', 503)
  return key
}

/** Round to keep the prompt compact and deterministic across ticks. */
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Describe the current tick to Jev.
 *
 * We give it more than the six raw numbers: we also reframe them the way the
 * decision actually wants them — the vertical GAP between the ball and Jev's own
 * paddle, whether the ball is approaching, and roughly how long until it arrives
 * — and we spell out the field's physics (the ball reflects off the top and
 * bottom rails; Jev can only move up or down). Every one of these is a one-step
 * consequence of the inputs, so it is context, not the answer: we deliberately
 * do NOT fold the wall bounces and hand over the final crossing height — working
 * out where the ball actually arrives is the judgment we want from Jev.
 */
function describe(s: JevInput): string {
  const xdir = s.ballVX > 0.0001 ? 'toward YOU, the right paddle (moving right)' : s.ballVX < -0.0001 ? 'toward the opponent (moving left)' : 'not horizontally'
  const ydir = s.ballVY > 0.02 ? 'downward (toward the bottom rail)' : s.ballVY < -0.02 ? 'upward (toward the top rail)' : 'level'

  const gap = s.ballY - s.paddleY // + => ball is below your center, - => above
  const side =
    Math.abs(gap) < 0.02
      ? 'almost exactly level with your paddle center'
      : gap > 0
        ? `${r2(Math.abs(gap))} BELOW your paddle center (nearer the bottom, y=1)`
        : `${r2(Math.abs(gap))} ABOVE your paddle center (nearer the top, y=0)`

  let arrival: string
  if (s.ballVX > 0.0001) {
    const t = (JEV_FACE_X / FIELD.w - s.ballX) / s.ballVX // seconds until it reaches your line
    arrival = `It is approaching your side and, ignoring rail bounces, would reach your line in about ${r2(Math.max(0, t))} seconds.`
  } else {
    arrival = 'It is moving away from you; you have time to recover toward the middle before it comes back.'
  }

  return [
    'You are the RIGHT paddle in Pong. Coordinates are normalized 0..1: x runs left (0) to right (1); y runs top (0) to bottom (1). You may only move your paddle UP (toward y=0) or DOWN (toward y=1). The ball reflects off the top rail (y=0) and the bottom rail (y=1) — it never wraps around.',
    `Ball position: x=${r2(s.ballX)}, y=${r2(s.ballY)}. Ball velocity: vx=${r2(s.ballVX)}, vy=${r2(s.ballVY)} — it is heading ${xdir}, and ${ydir}.`,
    `Your paddle center is at y=${r2(s.paddleY)}; the opponent's is at y=${r2(s.opponentY)}. Right now the ball is ${side}.`,
    arrival,
    'Aim your paddle center at the height where the ball will actually cross your line — anticipate its path, folding in any bounce off the top or bottom rail before it gets to you, rather than just chasing its current height.',
  ].join(' ')
}

/** Body sent to Jev — one `choice` question over the three legal moves. */
function buildBody(s: JevInput) {
  return {
    model: 'jev-latest',
    state: describe(s),
    questions: {
      action: {
        type: 'choice',
        instructions:
          'Pick the single move that best lines your paddle center up with where the ball will cross your line. Be decisive: choose MOVE_UP or MOVE_DOWN whenever the predicted crossing is clearly off-center, and reserve STAY for when you are genuinely already lined up (or the ball is heading away and you are near the middle). Do not oscillate.',
        criteria: {
          MOVE_UP: 'the ball will cross your line ABOVE your paddle center (nearer y=0), so move up to meet it',
          MOVE_DOWN: 'the ball will cross your line BELOW your paddle center (nearer y=1), so move down to meet it',
          STAY: 'your paddle center is already at the predicted crossing height, or the ball is moving away and you are already near the middle',
        },
      },
    },
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

/**
 * Ask live Jev for one move. Retries briefly on the transient statuses (the same
 * ones the judge pipeline retries), then gives up with an {@link JevError} the
 * client turns into a graceful fall back to the local reflex.
 */
export async function askJev(input: JevInput): Promise<JevDecision> {
  const key = jevKey()
  const body = buildBody(input)

  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(JEV_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) {
        if ([429, 500, 502, 503].includes(res.status) && attempt < 2) {
          await sleep(300 * (attempt + 1))
          continue
        }
        throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }
      const answer = (await res.json()).answers?.action
      const action: JevAction = ACTIONS.includes(answer?.choice) ? answer.choice : 'STAY'
      return { action, confidence: clamp(Number(answer?.confidence ?? 0), 0, 1), mode: 'live' }
    } catch (err) {
      lastErr = err
      if (attempt < 2) await sleep(300 * (attempt + 1))
    }
  }
  throw new JevError('unavailable', `Jev did not respond: ${lastErr instanceof Error ? lastErr.message : 'unknown error'}`)
}
