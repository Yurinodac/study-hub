/**
 * Whether a background refresh should overwrite in-progress form fields.
 * Dirty drafts must never be wiped by list reloads or parent re-renders.
 */
export function shouldApplyServerSnapshot(dirty: boolean): boolean {
  return !dirty
}
