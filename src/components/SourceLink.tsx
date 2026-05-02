'use client'

// Phase 28E — Source traceability link.
// Renders a subtle navigation action that opens a source conversation in Archives.
// Hard constraint: navigation only. No data mutation. No content injection.
//
// States:
//   source_id present    → "Open source" link → /archives?archive=X&tab=conversations&sourceId=Y
//   source removed       → "Source removed" (no action)
//   no source_id, has source_document → "Source document noted: [name]" + "No linked source"
//   no source_id, no source_document  → "No linked source"

import Link from 'next/link'

interface Props {
  sourceId:       string | null | undefined
  archiveName:    string | null | undefined
  sourceDocument: string | null | undefined
  sourceRemoved?: boolean
  className?:     string
}

export function buildSourceUrl(archiveName: string, sourceId: string): string {
  return `/archives?archive=${encodeURIComponent(archiveName)}&tab=conversations&sourceId=${encodeURIComponent(sourceId)}`
}

export default function SourceLink({
  sourceId,
  archiveName,
  sourceDocument,
  sourceRemoved = false,
  className = '',
}: Props) {
  const base = `font-body text-[10px] ${className}`

  if (sourceRemoved) {
    return (
      <span className={`${base} text-text-muted italic`}>
        Source removed
      </span>
    )
  }

  if (sourceId && archiveName) {
    return (
      <Link
        href={buildSourceUrl(archiveName, sourceId)}
        title="Open the source conversation behind this entry."
        className={`${base} text-text-muted hover:text-text-secondary transition-colors underline-offset-2 hover:underline`}
      >
        Open source
      </Link>
    )
  }

  if (sourceDocument) {
    return (
      <span className={`${base} text-text-muted`}>
        Source document noted: {sourceDocument}
        <span className="block text-text-muted opacity-60">No linked source conversation.</span>
      </span>
    )
  }

  return (
    <span className={`${base} text-text-muted opacity-60`}>
      No linked source
    </span>
  )
}
