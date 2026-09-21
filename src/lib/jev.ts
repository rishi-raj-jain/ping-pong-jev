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

import { clamp, type JevAction, type JevDecision, type JevInput } from '@/lib/pong'

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
 * Describe the current tick to Jev the way a human commentator would: the ball,
 * its heading, and where both paddles sit — all normalized, all in one short
 * paragraph. Jev reads this "unstructured state" and returns the typed move.
 */
function describe(s: JevInput): string {
  const xdir = s.ballVX > 0 ? 'toward YOU (moving right)' : s.ballVX < 0 ? 'toward the opponent (moving left)' : 'flat'
  const ydir = s.ballVY > 0.02 ? 'and downward' : s.ballVY < -0.02 ? 'and upward' : 'and level'
  return [
    'You are the RIGHT paddle in a game of Pong. Coordinates are normalized: 0 is the top/left edge, 1 is the bottom/right edge.',
    `Ball position: x=${r2(s.ballX)}, y=${r2(s.ballY)}.`,
    `Ball velocity: vx=${r2(s.ballVX)} (${xdir}), vy=${r2(s.ballVY)} (${ydir}).`,
    `Your paddle center is at y=${r2(s.paddleY)}. The opponent paddle center is at y=${r2(s.opponentY)}.`,
    'Goal: position your paddle to return the ball and, when you can, aim it away from the opponent.',
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
        instructions: 'Choose how to move your paddle THIS tick to best defend your goal and return the ball.',
        criteria: {
          MOVE_UP: 'move the paddle up, toward y=0, because the ball will arrive above the paddle center',
          MOVE_DOWN: 'move the paddle down, toward y=1, because the ball will arrive below the paddle center',
          STAY: 'hold position because the paddle is already lined up, or the ball is heading away',
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
