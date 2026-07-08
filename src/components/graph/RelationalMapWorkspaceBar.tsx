'use client'

// Phase 37E — Workspace bar: selector, save, save-as, reset, arrange toggle.
//
// Layout is not ontology.
// Position is not relationship.
// Distance is not strength.
// Cluster is not truth.
// Dragging does not mutate graph semantics.

import { useState, useCallback } from 'react'
import type { RelationalMapWorkspace } from '@/lib/graph/relationalMapWorkspaceTypes'
import { WORKSPACE_SCOPE_LABELS, WORKSPACE_SCOPES } from '@/lib/graph/relationalMapWorkspaceTypes'
import type { RelationalMapWorkspaceScope } from '@/lib/graph/relationalMapWorkspaceTypes'

// ─── Types ────────────────────────────────────────────────────────────────

interface WorkspaceBarProps {
  workspaces: RelationalMapWorkspace[]
  activeWorkspaceId: string | null
  arrangeMode: boolean
  isDirty: boolean
  onSelectWorkspace: (id: string | null) => void
  onToggleArrangeMode: () => void
  onArrangeVisible: () => void
  onSave: () => void
  onSaveAs: (name: string, scope: RelationalMapWorkspaceScope) => void
  onResetLayout: () => void
  onArchiveWorkspace: (id: string) => void
  disabled: boolean
  /** True when there are visible nodes to arrange (disables the button otherwise). */
  canArrange: boolean
}

// ─── Component ────────────────────────────────────────────────────────────

export default function RelationalMapWorkspaceBar({
  workspaces,
  activeWorkspaceId,
  arrangeMode,
  isDirty,
  onSelectWorkspace,
  onToggleArrangeMode,
  onArrangeVisible,
  onSave,
  onSaveAs,
  onResetLayout,
  onArchiveWorkspace,
  disabled,
  canArrange,
}: WorkspaceBarProps) {
  const [showSaveAs, setShowSaveAs] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [saveAsScope, setSaveAsScope] = useState<RelationalMapWorkspaceScope>('tara_workspace')

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) ?? null

  const handleSaveAs = useCallback(() => {
    if (saveAsName.trim().length === 0) return
    onSaveAs(saveAsName.trim(), saveAsScope)
    setSaveAsName('')
    setShowSaveAs(false)
  }, [saveAsName, saveAsScope, onSaveAs])

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Workspace selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-text-muted text-[10px] uppercase tracking-wider font-mono">
          Workspace
        </span>
        <select
          value={activeWorkspaceId ?? ''}
          onChange={e => onSelectWorkspace(e.target.value || null)}
          disabled={disabled}
          className="
            bg-house-surface border border-house-border rounded px-2 py-1.5
            text-text-secondary text-xs font-body
            focus:outline-none focus:border-house-muted
            min-w-[140px]
          "
        >
          <option value="">Default Layout</option>
          {workspaces.map(w => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Arrange mode toggle */}
      <button
        onClick={onToggleArrangeMode}
        disabled={disabled}
        className={`
          px-3 py-1.5 text-xs font-body rounded border transition-colors
          ${arrangeMode
            ? 'bg-purple-900/40 border-purple-600/60 text-purple-300'
            : 'bg-house-surface border-house-border text-text-muted hover:text-text-secondary'
          }
        `}
        title={arrangeMode
          ? 'Exit Arrange Mode (layout changes only, not graph meaning)'
          : 'Enter Arrange Mode to move nodes (layout only)'
        }
      >
        {arrangeMode ? '✦ Arranging' : '↕ Arrange'}
      </button>

      {/* Arrange visible — layout-only action, Arrange Mode only (Phase 43 5B) */}
      {arrangeMode && (
        <button
          onClick={onArrangeVisible}
          disabled={disabled || !canArrange}
          className="
            px-3 py-1.5 text-xs font-body rounded border transition-colors
            bg-house-surface border-purple-600/40 text-purple-300
            hover:border-purple-500/70 hover:text-purple-200
            disabled:opacity-30 disabled:hover:border-purple-600/40
          "
          title="Arrange the currently visible nodes (skips pinned; layout only, not graph meaning)"
        >
          ✦ Arrange visible
        </button>
      )}

      {/* Arrange mode warning */}
      {arrangeMode && (
        <span className="text-[10px] text-purple-400/70 italic">
          Layout only — not graph meaning
        </span>
      )}

      {/* Dirty indicator */}
      {isDirty && (
        <span className="text-[10px] text-amber-400/70">
          Unsaved changes
        </span>
      )}

      <div className="flex-1" />

      {/* Save */}
      {activeWorkspaceId && isDirty && (
        <button
          onClick={onSave}
          disabled={disabled}
          className="
            text-text-secondary text-xs px-3 py-1.5
            border border-house-border rounded
            hover:border-purple-600/50 hover:text-purple-300
            transition-colors font-body
          "
        >
          Save
        </button>
      )}

      {/* Save As */}
      {!showSaveAs ? (
        <button
          onClick={() => setShowSaveAs(true)}
          disabled={disabled}
          className="
            text-text-muted text-xs px-3 py-1.5
            border border-house-border rounded
            hover:text-text-secondary transition-colors font-body
          "
        >
          Save As
        </button>
      ) : (
        <div className="flex items-center gap-1.5 bg-house-surface/80 border border-house-border rounded px-2 py-1">
          <input
            type="text"
            value={saveAsName}
            onChange={e => setSaveAsName(e.target.value)}
            placeholder="Workspace name…"
            className="
              bg-transparent border-0 text-text-secondary text-xs font-body
              placeholder:text-text-muted focus:outline-none
              w-[120px]
            "
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveAs()
              if (e.key === 'Escape') setShowSaveAs(false)
            }}
          />
          <select
            value={saveAsScope}
            onChange={e => setSaveAsScope(e.target.value as RelationalMapWorkspaceScope)}
            className="
              bg-house-bg border border-house-border/50 rounded
              text-text-muted text-[10px] font-body px-1 py-0.5
              focus:outline-none
            "
          >
            {WORKSPACE_SCOPES.map(s => (
              <option key={s} value={s}>{WORKSPACE_SCOPE_LABELS[s]}</option>
            ))}
          </select>
          <button
            onClick={handleSaveAs}
            disabled={saveAsName.trim().length === 0}
            className="text-purple-300 text-xs hover:text-purple-200 disabled:opacity-30"
          >
            Save
          </button>
          <button
            onClick={() => setShowSaveAs(false)}
            className="text-text-muted text-xs hover:text-text-secondary"
          >
            ✕
          </button>
        </div>
      )}

      {/* Reset Layout */}
      <button
        onClick={onResetLayout}
        disabled={disabled}
        className="
          text-text-muted text-xs px-3 py-1.5
          border border-house-border rounded
          hover:text-text-secondary transition-colors font-body
        "
        title="Reset to default deterministic layout"
      >
        Reset
      </button>

      {/* Archive current workspace */}
      {activeWorkspaceId && (
        <button
          onClick={() => {
            if (activeWorkspaceId) onArchiveWorkspace(activeWorkspaceId)
          }}
          disabled={disabled}
          className="
            text-text-muted text-[10px] px-2 py-1
            border border-house-border/50 rounded
            hover:text-red-400/70 hover:border-red-400/30
            transition-colors font-mono
          "
          title="Archive this workspace"
        >
          Archive
        </button>
      )}
    </div>
  )
}
