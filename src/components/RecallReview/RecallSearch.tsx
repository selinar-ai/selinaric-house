'use client'

// Recall Review — search field
// Searches recall query + normalised query server-side via the events API.

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function RecallSearch({ value, onChange }: Props) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search recall queries…"
        className="
          w-full bg-house-bg border border-house-border
          font-body text-sm text-text-primary placeholder:text-text-muted
          px-3 py-1.5 h-8
          focus:outline-none focus:border-house-muted transition-colors
        "
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary text-xs"
          title="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  )
}
