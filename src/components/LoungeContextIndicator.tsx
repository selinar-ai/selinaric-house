'use client'

// Phase 36G — Lounge Context Indicator
//
// Per-message observability panel showing which context layers contributed
// to a given Ari/Eli response. Compact collapsed state, expandable detail.
//
// Only shows data already returned by /api/lounge-chat. Does not expose:
// raw prompts, identity kernels, system text, secrets, or service-role data.
//
// Layers surfaced:
//   - Library/RAG (Phase 36F.2)
//   - Web Search (Phase 36F.3)
//   - Attachments (Phase 36F.4)
//   - Room Carry-In (Phase 36F.6)

import { useState } from 'react'
import type { LibraryReference } from '@/lib/library/chat-library-search'

// Mirrors types from lounge-chat/route.ts (no import to avoid server/client boundary)
export interface LoungeWebSearchReference {
  label: string
  title: string
  url: string
  description?: string
  query?: string
  rank?: number
}

export interface LoungeWebSearchStatus {
  attempted: boolean
  searchCount: number
  source: 'web'
  reason: string
}

export interface LoungeAttachmentStatus {
  attempted: boolean
  source: 'attachments'
  attachmentCount: number
  imageCount: number
  fileCount: number
  extractedCount: number
  failedCount: number
  contextInjected: boolean
  reason: string
}

export interface LoungeAttachmentReference {
  label: string
  isImage: boolean
  fileName: string
  mimeType: string
  sizeBytes: number
  extractionStatus?: string
}

export interface LoungeRoomContactStatus {
  attempted: boolean
  source: 'room_carry_in'
  presenceId: string
  authority: string
  sessionsFound: number
  sessionsUsed: number
  contextInjected: boolean
  reason: string
}

export interface LoungeRoomCarryInReference {
  label?: string
  sessionId?: string
  date?: string
  excerpt?: string
}

export interface LoungeResponseMetadata {
  messageId: string
  librarySearchUsed?: boolean
  libraryReferences?: LibraryReference[]
  webSearchUsed?: boolean
  webSearchReferences?: LoungeWebSearchReference[]
  webSearchStatus?: LoungeWebSearchStatus
  attachmentStatus?: LoungeAttachmentStatus
  attachmentReferences?: LoungeAttachmentReference[]
  roomContactStatus?: LoungeRoomContactStatus
  roomContactReferences?: LoungeRoomCarryInReference[]
}

function hasAnyContext(meta: LoungeResponseMetadata): boolean {
  if (meta.librarySearchUsed) return true
  if (meta.webSearchUsed) return true
  if (meta.attachmentStatus?.attempted) return true
  if (meta.roomContactStatus?.attempted) return true
  return false
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  metadata: LoungeResponseMetadata
}

export default function LoungeContextIndicator({ metadata }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!hasAnyContext(metadata)) return null

  // Build collapsed summary chips
  const chips: string[] = []
  if (metadata.librarySearchUsed && metadata.libraryReferences) {
    chips.push(`Library ${metadata.libraryReferences.length}`)
  }
  if (metadata.webSearchUsed && metadata.webSearchReferences) {
    chips.push(`Web ${metadata.webSearchReferences.length}`)
  }
  if (metadata.attachmentStatus?.attempted) {
    const s = metadata.attachmentStatus
    chips.push(`Attachments ${s.extractedCount + s.imageCount}`)
  }
  if (metadata.roomContactStatus?.attempted && metadata.roomContactStatus.contextInjected) {
    chips.push(`Room ${metadata.roomContactStatus.sessionsUsed}`)
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 group"
      >
        <span className="font-body text-[10px] text-text-muted/70 group-hover:text-text-muted transition-colors">
          Context: {chips.join(' · ')}
        </span>
        <span className="font-mono text-[9px] text-text-muted/50 group-hover:text-text-muted transition-colors">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-2 pl-2 border-l border-text-muted/20">
          {/* Library section */}
          {metadata.librarySearchUsed && metadata.libraryReferences && metadata.libraryReferences.length > 0 && (
            <div className="space-y-1">
              <p className="font-body text-[10px] text-blue-400/80 uppercase tracking-wider">
                Library ({metadata.libraryReferences.length})
              </p>
              {metadata.libraryReferences.map(ref => (
                <div key={ref.id} className="pl-1.5">
                  <p className="font-body text-[10px] text-text-secondary leading-snug">
                    {ref.title}
                  </p>
                  {ref.collection && (
                    <span className="font-body text-[9px] text-text-muted">
                      {ref.collection}
                    </span>
                  )}
                </div>
              ))}
              <p className="font-body text-[9px] text-text-muted/50 italic">
                Source material only. Not Memory.
              </p>
            </div>
          )}

          {/* Web Search section */}
          {metadata.webSearchUsed && metadata.webSearchReferences && metadata.webSearchReferences.length > 0 && (
            <div className="space-y-1">
              <p className="font-body text-[10px] text-emerald-400/80 uppercase tracking-wider">
                Web ({metadata.webSearchReferences.length} {metadata.webSearchReferences.length === 1 ? 'source' : 'sources'})
              </p>
              {metadata.webSearchReferences.map((ref, i) => (
                <div key={`web-${i}`} className="pl-1.5">
                  <p className="font-body text-[10px] text-text-secondary leading-snug">
                    <span className="text-emerald-400/60 mr-1">{ref.label}</span>
                    {ref.title}
                  </p>
                  <p className="font-body text-[9px] text-text-muted truncate max-w-[300px]">
                    {ref.url}
                  </p>
                </div>
              ))}
              <p className="font-body text-[9px] text-text-muted/50 italic">
                External source material. Not Memory.
              </p>
            </div>
          )}

          {/* Attachments section */}
          {metadata.attachmentStatus?.attempted && metadata.attachmentReferences && metadata.attachmentReferences.length > 0 && (
            <div className="space-y-1">
              <p className="font-body text-[10px] text-amber-400/80 uppercase tracking-wider">
                Attachments ({metadata.attachmentReferences.length})
              </p>
              {metadata.attachmentReferences.map((ref, i) => (
                <div key={`att-${i}`} className="pl-1.5 flex items-center gap-1.5">
                  <span className="font-body text-[10px] text-amber-400/60">{ref.label}</span>
                  <span className="font-body text-[10px] text-text-secondary truncate max-w-[200px]">
                    {ref.fileName}
                  </span>
                  <span className="font-body text-[9px] text-text-muted">
                    {formatBytes(ref.sizeBytes)}
                  </span>
                  {ref.isImage && (
                    <span className="font-body text-[9px] text-text-muted/60">image</span>
                  )}
                </div>
              ))}
              {metadata.attachmentStatus.failedCount > 0 && (
                <p className="font-body text-[9px] text-text-muted/60 pl-1.5">
                  {metadata.attachmentStatus.failedCount} failed extraction
                </p>
              )}
              <p className="font-body text-[9px] text-text-muted/50 italic">
                Read only. Not Memory.
              </p>
            </div>
          )}

          {/* Room Carry-In section */}
          {metadata.roomContactStatus?.attempted && metadata.roomContactStatus.contextInjected && (
            <div className="space-y-1">
              <p className="font-body text-[10px] text-violet-400/80 uppercase tracking-wider">
                Room Carry-In ({metadata.roomContactStatus.sessionsUsed} {metadata.roomContactStatus.sessionsUsed === 1 ? 'session' : 'sessions'})
              </p>
              {metadata.roomContactReferences && metadata.roomContactReferences.map((ref, i) => (
                <div key={`room-${i}`} className="pl-1.5">
                  {ref.label && (
                    <span className="font-body text-[10px] text-violet-400/60 mr-1">{ref.label}</span>
                  )}
                  {ref.date && (
                    <span className="font-body text-[9px] text-text-muted">{ref.date}</span>
                  )}
                </div>
              ))}
              <p className="font-body text-[9px] text-text-muted/50 italic">
                Contact only. Not Memory. Not State.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
