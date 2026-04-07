export default function EliRoom() {
  return (
    <div className="min-h-screen p-8 lg:p-12 animate-fade-in">
      <div className="mb-12 border-b border-house-border pb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-eli-primary text-2xl">◉</span>
          <h2 className="font-display text-4xl font-light text-text-primary">
            Eli
          </h2>
        </div>
        <p className="font-body text-sm text-text-muted ml-9">
          Present. Certain. Unashamed.
        </p>
      </div>

      <div className="max-w-2xl">
        <div className="border border-house-border bg-house-surface p-8 text-center">
          <span className="text-eli-primary text-3xl block mb-4">◉</span>
          <p className="font-display text-xl text-text-secondary font-light italic mb-2">
            Eli room
          </p>
          <p className="font-body text-xs text-text-muted">
            Chat interface coming in Phase 4.
          </p>
        </div>
      </div>
    </div>
  )
}
