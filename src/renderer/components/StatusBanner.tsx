import { useEffect } from 'react'

/** Fixed top-of-page status / error banner — always visible without scrolling. */
export default function StatusBanner({
  message,
  tone = 'ok',
  onDismiss
}: {
  message: string
  tone?: 'ok' | 'warn'
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 6000)
    return () => window.clearTimeout(t)
  }, [message, onDismiss])

  return (
    <div
      className="status-banner"
      data-tone={tone === 'warn' ? 'warn' : undefined}
      role="status"
      aria-live="polite"
    >
      <p className="status-banner-text">{message}</p>
      <button type="button" className="btn btn-ghost status-banner-dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
