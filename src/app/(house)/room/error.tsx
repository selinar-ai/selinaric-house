'use client'

// Phase 1F — Room-level error boundary.
// Catches any unhandled render-time error inside a room (Ari/Eli chat, Inside, State, etc.)
// and shows a contained recovery state instead of white-screening the entire app.

export default function RoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-8 items-center justify-center">
      <div className="max-w-sm text-center">
        <p className="font-display text-xl text-text-secondary font-light mb-4">
          Something went wrong.
        </p>
        <p className="font-body text-sm text-text-muted mb-6 leading-relaxed">
          The room encountered an error. Your conversation history is safe.
        </p>
        <button
          onClick={reset}
          className="font-body text-xs tracking-widest uppercase px-6 py-3 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all duration-200"
        >
          Try again
        </button>
        {process.env.NODE_ENV === 'development' && (
          <pre className="mt-6 text-left text-[10px] text-red-400/70 bg-house-bg border border-house-border p-3 overflow-auto max-h-48">
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        )}
      </div>
    </div>
  )
}
