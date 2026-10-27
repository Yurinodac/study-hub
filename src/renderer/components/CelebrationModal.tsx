export default function CelebrationModal({
  open,
  message,
  imageUrl,
  onClose
}: {
  open: boolean
  message: string
  imageUrl: string | null
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card celebration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="celebration-title">Nice work!</h2>
        <p>{message}</p>
        {imageUrl ? (
          <img className="celebration-image" src={imageUrl} alt="Your celebration picture" />
        ) : (
          <div className="celebration-default" aria-hidden="true">
            <span className="celebration-star">★</span>
            <p>Task complete</p>
          </div>
        )}
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}
