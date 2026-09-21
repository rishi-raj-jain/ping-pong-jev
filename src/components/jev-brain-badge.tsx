import type { JevMode } from '@/lib/pong'

/**
 * The one honest label on the page: is the right paddle being driven by live
 * Jev over the network, or by the local reflex fallback? Everything else about
 * the two is identical, so this is how a viewer knows which they are watching.
 */
export function JevBrainBadge({ mode, size = 'sm' }: { mode: JevMode; size?: 'sm' | 'lg' }) {
  const live = mode === 'live'
  const pad = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${pad} ${live ? 'border-(--jev)/40 bg-(--jev)/10 text-(--jev)' : 'border-(--warn)/40 bg-(--warn)/10 text-(--warn)'}`}
      title={
        live ? 'The right paddle is calling live Jev on api.typesafe.ai, one typed decision per tick.' : 'No TYPESAFE_API_KEY set, so the right paddle uses a local System One reflex that speaks the same typed contract.'
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-(--jev)' : 'bg-(--warn)'}`} />
      {live ? 'LIVE JEV' : 'LOCAL REFLEX'}
    </span>
  )
}
