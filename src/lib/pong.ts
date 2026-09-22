/**
 * Shared Pong model: field geometry, the typed decision contract, and a local
 * "System One" reflex used as a fallback opponent.
 *
 * The whole point of the demo is Jev's contract: unstructured state in, a typed
 * decision out. So we keep that contract in one place and make everything speak
 * it — the canvas that produces {@link JevInput} every tick, the `/api/jev`
 * route that forwards it to TypeSafe, and {@link decideLocally}, which answers
 * the exact same shape with no network and no key. That symmetry is what lets
 * the game keep playing when live Jev is not configured.
 */

/** The three moves Jev may return for the right paddle, per the prompt in the brief. */
export type JevAction = 'MOVE_UP' | 'MOVE_DOWN' | 'STAY'

/** Where a decision came from, so the UI can label the opponent honestly. */
export type JevMode = 'live' | 'local'

/**
 * The normalized world Jev is handed each tick. Everything is unitless and in a
 * stable range so the model (or the local reflex) never has to know the pixel
 * size of the table:
 * - positions are 0..1 (0 = top/left edge, 1 = bottom/right edge)
 * - velocities are in field-widths (vx) / field-heights (vy) per second, signed
 */
export type JevInput = {
  ballX: number
  ballY: number
  ballVX: number
  ballVY: number
  paddleY: number // Jev's own paddle, center, 0..1
  opponentY: number // the human paddle, center, 0..1
}

/** A typed judgment of the current tick: the move plus how sure of it we are. */
export type JevDecision = {
  action: JevAction
  confidence: number // 0..1
  mode: JevMode
}

/**
 * Fixed logical field. The canvas renders at a device-pixel multiple of this
 * and scales with CSS, but all physics and prediction run in these coordinates
 * so gameplay is identical on every screen.
 */
export const FIELD = {
  w: 900,
  h: 560,
  wall: 16, // top/bottom rail thickness that the ball bounces off
  paddleW: 16,
  paddleH: 104,
  paddleInset: 34, // gap from the side wall to the paddle face
  ballR: 9,
  winScore: 11,
} as const

/** Vertical travel of a paddle center, in logical px (top rail to bottom rail). */
export const PADDLE_SPAN = FIELD.h - 2 * FIELD.wall - FIELD.paddleH

/** The x of each paddle's *face* — the surface the ball actually contacts. */
export const HUMAN_FACE_X = FIELD.paddleInset + FIELD.paddleW
export const JEV_FACE_X = FIELD.w - FIELD.paddleInset - FIELD.paddleW

/** Clamp helper shared by physics and the reflex. */
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Predict, in normalized 0..1, where the ball will cross Jev's face — folding
 * top/bottom bounces so the reflex aims where the ball actually arrives, not
 * where it is now. When the ball is moving away (vx <= 0) there is nothing to
 * intercept, so we drift back toward the middle and wait.
 */
export function predictImpactY(s: JevInput): number {
  if (s.ballVX <= 0.0001) return 0.5

  // Distance to Jev's face as a fraction of field width, and the matching
  // vertical drift over that time. vx is widths/sec, vy is heights/sec, so the
  // time cancels cleanly into a single vertical delta.
  const faceX = JEV_FACE_X / FIELD.w
  const dx = Math.max(0, faceX - s.ballX)
  const time = dx / s.ballVX
  let y = s.ballY + s.ballVY * time

  // Fold the raw landing point back into [0,1] as a triangle wave: this is a
  // reflection off both rails, exactly what the ball does physically.
  y = Math.abs(y) % 2
  if (y > 1) y = 2 - y
  return y
}

/**
 * Local reflex opponent: the same typed decision Jev returns, computed with no
 * network. It aims the paddle at the predicted impact point with a small
 * dead-zone (so it does not jitter on the spot) and reports a confidence that
 * grows as the ball nears and the aim tightens — enough to make the telemetry
 * feel alive, and imperfect enough that a human can win.
 */
export function decideLocally(s: JevInput): JevDecision {
  const target = predictImpactY(s)
  const error = target - s.paddleY // + means target is below the paddle
  const dead = 0.035

  let action: JevAction = 'STAY'
  if (error > dead) action = 'MOVE_DOWN'
  else if (error < -dead) action = 'MOVE_UP'

  // More confident when the ball is close (small horizontal gap) and the aim is
  // already tight. Idle waiting near center reads as a calm, low-mid confidence.
  const closeness = s.ballVX > 0 ? clamp(1 - Math.abs(JEV_FACE_X / FIELD.w - s.ballX), 0, 1) : 0.4
  const tightness = clamp(1 - Math.abs(error) * 3, 0, 1)
  const confidence = action === 'STAY' ? clamp(0.55 + tightness * 0.4, 0, 0.99) : clamp(0.45 + closeness * 0.35 + tightness * 0.2, 0, 0.99)

  return { action, confidence, mode: 'local' }
}
