import { getCompletionBar } from '../../shared/progress'
import type { Resource } from '../../shared/types'

/** Completion/activity bar — shows % only when a meaningful total exists. */
export default function CompletionBar({
  resource,
  sectionProgress
}: {
  resource: Pick<Resource, 'type' | 'config'>
  sectionProgress?: { done: number; total: number } | null
}) {
  const bar = getCompletionBar(resource, sectionProgress)
  const hasPct = bar.percent != null && bar.total != null

  return (
    <div className="completion-bar" aria-label={`${bar.label} progress`}>
      <div className="completion-bar-head">
        <span className="completion-bar-label">{bar.label}</span>
        {hasPct ? (
          <span className="completion-bar-pct">
            {bar.done} / {bar.total} · {bar.percent}%
          </span>
        ) : bar.activity ? (
          <span className="completion-bar-pct">{bar.activity}</span>
        ) : null}
      </div>
      {hasPct ? (
        <div className="progress-meter" role="progressbar" aria-valuenow={bar.percent!} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${bar.percent}%` }} />
        </div>
      ) : (
        <div className="progress-meter progress-meter-empty" aria-hidden="true">
          <span style={{ width: '0%' }} />
        </div>
      )}
      {hasPct && bar.activity ? <p className="meta completion-bar-extra">{bar.activity}</p> : null}
      {bar.secondary ? <p className="meta completion-bar-extra">{bar.secondary}</p> : null}
    </div>
  )
}
