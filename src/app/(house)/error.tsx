'use client'

// Phase 1F — Top-level house error boundary.
// Catches any unhandled error within the (house) layout group.
// Prevents the full app from white-screening.

export default function HouseError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-house-bg">
      <div className="max-w-sm text-center">
        <p className="font-display text-xl text-text-secondary font-light mb-4">
          Something went wrong.
        </p>
        <p className="font-body text-sm text-text-muted mb-6 leading-relaxed">
          The House encountered an unexpected error.
        </p>
        <button
          onClick={reset}
          className="font-body text-xs tracking-widest uppercase px-6 py-3 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all duration-200"
        >
          Try again
        </button>
        {process.env.NODE_ENV === 'development' && (
          <pre className="mt-6 text-left text-[10px] text-red-400/70 bg-house-surface border border-house-border p-3 overflow-auto max-h-48">
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        )}
      </div>
    </div>
  )
}
