# Pong — Human vs Jev

Classic Pong where the **left paddle is you** and the **right paddle is [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)**, TypeSafe's System One model.

Jev isn't a chatbot. It's a _System One_ model: unstructured state in, a typed
decision out. Here it plays Pong. Every tick it receives the ball's position and
velocity and both paddle positions — all normalized to `0..1` — and returns a
single calibrated number: `aim`, the height where it predicts the ball will
cross its line. The paddle homes straight to it.

```
ball position       ->
ball velocity       ->   Jev   ->   aim ∈ [0, 1]  (where to meet the ball)
paddle position     ->
opponent position   ->
```

There are no tokens to parse and, per TypeSafe, no way for the model to answer
outside the valid range — so the paddle acts on the answer directly. Asking Jev
for a precise target (rather than a coarse up/down/stay) is what lets the paddle
position exactly instead of hunting around the ball.

## Playing

- **Move:** drag/tap on the table, or use `↑`/`↓` (also `W`/`S`).
- **Serve:** press `Space`/`Enter`, tap, or hit the **Serve** button.
- First to **11** wins.

## Live Jev vs. local reflex

The right paddle's brain lives behind `POST /api/jev`, which forwards the
normalized state to TypeSafe and returns the typed `aim` target.

- **With `TYPESAFE_API_KEY` set**, you play against **live Jev** and the
  decision feed shows the real latency. Tick "compare local reflex" to A/B it.
- **Without a key**, the route replies `503` and the client transparently falls
  back to a **local System One reflex** (`src/lib/pong.ts`) that speaks the exact
  same typed contract. The demo stays fully playable everywhere.

```bash
cp .env.example .env   # then set TYPESAFE_API_KEY to play live Jev
npm install
npm run dev
```

## How it fits together

| Path                                 | Role                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/lib/pong.ts`                    | Field geometry, the typed `JevInput`/`JevDecision` contract, local reflex.         |
| `src/lib/jev.ts`                     | Server-side call to Jev (`api.typesafe.ai`), mirrors the hn-thread-judge pipeline. |
| `src/app/api/jev/route.ts`           | `POST` endpoint: normalized state in, one typed move out.                          |
| `src/components/game-arena.tsx`      | Canvas engine — physics, the ping-pong table, and the decision loop.               |
| `src/components/telemetry-panel.tsx` | The live "state in / decision out" feed.                                           |

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run typecheck` — `tsc`
- `npm run format` — Prettier over the repo

## Deploying

Ships to Vercel; `vercel.json` pins the `iad1` region. Set `TYPESAFE_API_KEY`
in the project's environment variables to enable live Jev.
