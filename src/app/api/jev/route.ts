/**
 * The opponent's brain, one tick at a time.
 *
 * The browser posts the normalized {@link JevInput} it just measured and gets
 * back a single typed move. We keep this server-side because the TypeSafe key
 * must never reach the client, and because the round trip is the whole point of
 * the demo: this is a "frontier-intelligence function call" — state in, a typed
 * decision out — sitting in the game loop.
 *
 * When the key is missing (`no_key`) we say so with a 503 and a JSON body the
 * client recognizes, so it can drop to the local reflex without a scary error.
 */

import { askJev, JevError } from '@/lib/jev'
import type { JevInput } from '@/lib/pong'

// Decisions depend entirely on the posted body, so never cache or prerender.
export const dynamic = 'force-dynamic'

function coord(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function POST(request: Request) {
  let body: Partial<JevInput>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const input: JevInput = {
    ballX: coord(body.ballX),
    ballY: coord(body.ballY),
    ballVX: coord(body.ballVX),
    ballVY: coord(body.ballVY),
    paddleY: coord(body.paddleY),
    opponentY: coord(body.opponentY),
  }

  try {
    const decision = await askJev(input)
    return Response.json(decision)
  } catch (err) {
    if (err instanceof JevError) return Response.json({ error: err.code, message: err.message }, { status: err.status })
    return Response.json({ error: 'unavailable', message: 'Unexpected error asking Jev.' }, { status: 502 })
  }
}
