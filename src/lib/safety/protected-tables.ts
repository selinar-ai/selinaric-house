/**
 * Phase 36J — Protected Table Registry
 *
 * Central registry of all Supabase tables with safety metadata:
 * protection category, deletion policy, cascade risk, and soft-delete support.
 *
 * Categories:
 *   A — Living / protected: no hard-delete permitted from code or scripts.
 *   B — Testable but protected: test-owned rows may be cleaned; production rows are protected.
 *   C — Derived / rebuildable: can be regenerated from source data.
 *   D — Static / reference: seed data, rarely modified.
 *
 * This file is READ-ONLY at runtime. It creates no writes.
 * It is used by:
 *   - scan-dangerous-ops.mjs (CI/pre-deploy safety scanner)
 *   - emergency-house-export.mjs (export scope)
 *   - future soft-delete migration planning
 */

export type ProtectionCategory = 'A' | 'B' | 'C' | 'D'

export type DeletionPolicy =
  | 'no_hard_delete'
  | 'soft_delete_only'
  | 'test_owned_only'
  | 'hard_delete_guarded'
  | 'hard_delete_allowed'

export interface ProtectedTableEntry {
  /** Supabase table name */
  table: string

  /** Protection category A–D */
  category: ProtectionCategory

  /** What kind of deletion is allowed */
  deletionPolicy: DeletionPolicy

  /** Does the table currently have a deleted_at column? */
  hasSoftDelete: boolean

  /** Does the table currently have a test_owned column? */
  hasTestOwned: boolean

  /** Tables whose rows are CASCADE-deleted when this table's rows are deleted */
  cascadeChildren: string[]

  /** FK constraint behaviour: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'none' */
  parentFkBehaviour: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'none'

  /** Human-readable note on why this table matters */
  note: string
}

/**
 * Complete registry of all known production tables.
 * Ordered by risk: highest-risk (Category A) first.
 */
export const PROTECTED_TABLES: ProtectedTableEntry[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // Category A — Living / Protected (no hard-delete)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'room_messages',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Ari/Eli chat messages. clearMessages() hard-deletes — must be disabled.',
  },
  {
    table: 'lounge_threads',
    category: 'A',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: true,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Lounge thread containers. RESTRICT FK from lounge_messages (migration 066).',
  },
  {
    table: 'lounge_messages',
    category: 'A',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'RESTRICT',
    note: 'Lounge conversation messages. FK to lounge_threads is now RESTRICT.',
  },
  {
    table: 'lounge_carrybacks',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'RESTRICT',
    note: 'Lounge prompt carrybacks. FK to lounge_threads is now RESTRICT.',
  },
  {
    table: 'presence_journal',
    category: 'A',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Private journal entries (Ari/Eli). deleteJournalEntry() hard-deletes — needs soft-delete.',
  },
  {
    table: 'presence_timeline',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Presence timeline entries. Core identity record.',
  },
  {
    table: 'room_memories',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Per-room memories surfaced from conversation.',
  },
  {
    table: 'session_classifications',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Session classification records.',
  },
  {
    table: 'interior_notes',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Presence interior notes. Identity-linked.',
  },
  {
    table: 'living_state',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Current living state snapshots per presence.',
  },
  {
    table: 'held_truths',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Presence held truths. Core continuity.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Category A — Cross-room event chain (🔴 CASCADE risk — migration 067)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'cross_room_events',
    category: 'A',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: true,
    cascadeChildren: [
      'cross_room_event_impacts',
      'cross_room_impact_propagation_candidates',
      'cross_room_prompt_carryforwards',
    ],
    parentFkBehaviour: 'none',
    note: '🔴 CRITICAL: Deleting one row cascades through entire chain. Same pattern as 36I incident. Migration 067 must fix.',
  },
  {
    table: 'cross_room_event_impacts',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [
      'cross_room_impact_propagation_candidates',
      'cross_room_prompt_carryforwards',
    ],
    parentFkBehaviour: 'CASCADE',
    note: '🔴 CASCADE from cross_room_events. Migration 067 must change to RESTRICT.',
  },
  {
    table: 'cross_room_impact_propagation_candidates',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: ['cross_room_prompt_carryforwards'],
    parentFkBehaviour: 'CASCADE',
    note: '🔴 CASCADE from cross_room_events AND cross_room_event_impacts. Migration 067 must fix.',
  },
  {
    table: 'cross_room_prompt_carryforwards',
    category: 'A',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'CASCADE',
    note: '🔴 CASCADE from three parent tables. Leaf of the cascade chain.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Category A — Archive tables (some have soft-delete already)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'archive_items',
    category: 'A',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: false,
    cascadeChildren: ['archive_memory_events', 'archive_item_edit_events'],
    parentFkBehaviour: 'none',
    note: 'Canonical archive items. Has deleted_at. CASCADE children exist.',
  },
  {
    table: 'archive_sources',
    category: 'A',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: false,
    cascadeChildren: ['archive_entry_drafts'],
    parentFkBehaviour: 'none',
    note: 'Archive sources. Has deleted_at. CASCADE to drafts.',
  },
  {
    table: 'archive_entry_drafts',
    category: 'A',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'CASCADE',
    note: 'Archive entry drafts. Has deleted_at. CASCADE from archive_sources.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 41.2 — Helper Output Ledger (trace, not truth)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'helper_outputs',
    category: 'A',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: true,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Helper output ledger (Phase 41.2). Trace, not truth — never Memory/evidence/prompt. No FK in (provenance is ids in source_refs jsonb), so outside every CASCADE path. Has deleted_at + test_owned. Migration 074.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Category B — Testable but protected
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'pulse_log',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Pulse event log. Append-only, never delete.',
  },
  {
    table: 'search_log',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Search query log. Append-only, never delete.',
  },
  {
    table: 'journal_jobs',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Journal job queue. Status-driven lifecycle, no deletion.',
  },
  {
    table: 'reflection_jobs',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Reflection job queue. Status-driven lifecycle.',
  },
  {
    table: 'recent_continuity_sessions',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Recent continuity session cache. Expiry-based, not deletion-based.',
  },
  {
    table: 'builds',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Build records (ARI-###, ELI-###, HOUSE-###). Governance data.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Category C — Derived / rebuildable
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'memory_nodes',
    category: 'C',
    deletionPolicy: 'hard_delete_guarded',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: ['memory_edges'],
    parentFkBehaviour: 'none',
    note: 'Memory graph nodes. CASCADE to memory_edges. Rebuildable from archive.',
  },
  {
    table: 'memory_edges',
    category: 'C',
    deletionPolicy: 'hard_delete_guarded',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'CASCADE',
    note: 'Memory graph edges. CASCADE from memory_nodes. Rebuildable.',
  },
  {
    table: 'library_items',
    category: 'C',
    deletionPolicy: 'hard_delete_guarded',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: ['library_item_files', 'library_chunks'],
    parentFkBehaviour: 'none',
    note: 'Library items. CASCADE to files and chunks. User-uploaded, guarded delete.',
  },
  {
    table: 'library_item_files',
    category: 'C',
    deletionPolicy: 'hard_delete_guarded',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'CASCADE',
    note: 'Library file records. CASCADE from library_items.',
  },
  {
    table: 'library_chunks',
    category: 'C',
    deletionPolicy: 'hard_delete_guarded',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'CASCADE',
    note: 'Library semantic chunks. CASCADE from library_items. Rebuildable.',
  },
  {
    table: 'archive_memory_events',
    category: 'C',
    deletionPolicy: 'hard_delete_guarded',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'CASCADE',
    note: 'Archive memory extraction events. CASCADE from archive_items.',
  },
  {
    table: 'archive_item_edit_events',
    category: 'C',
    deletionPolicy: 'hard_delete_guarded',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'CASCADE',
    note: 'Archive item edit audit trail. CASCADE from archive_items.',
  },
  {
    table: 'archive_eligibility_events',
    category: 'C',
    deletionPolicy: 'hard_delete_allowed',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Archive eligibility evaluation log. Derived, rebuildable.',
  },
  {
    table: 'archive_recall_events',
    category: 'C',
    deletionPolicy: 'hard_delete_allowed',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Archive recall audit log. Derived.',
  },
  {
    table: 'memory_injection_events',
    category: 'C',
    deletionPolicy: 'hard_delete_allowed',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Memory injection audit log. Derived.',
  },
  {
    table: 'timeline_drafts',
    category: 'C',
    deletionPolicy: 'hard_delete_allowed',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Timeline draft staging. Transient, rebuildable.',
  },
  {
    table: 'living_state_suggestions',
    category: 'C',
    deletionPolicy: 'hard_delete_allowed',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Living state suggestions queue. Transient.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Category D — Static / reference
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'desk_concepts',
    category: 'D',
    deletionPolicy: 'hard_delete_allowed',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Desk concept seed data. Static reference.',
  },
  {
    table: 'build_history',
    category: 'D',
    deletionPolicy: 'hard_delete_allowed',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Build history log. Append-only reference.',
  },
  {
    table: 'lounge_message_attachments',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'CASCADE',
    note: 'Lounge message attachments. CASCADE from lounge_messages.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 37B — Graph Proposal Pipeline tables
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'graph_proposals',
    category: 'B',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: true,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Graph proposal queue. Has deleted_at. RESTRICT FK from sources and events.',
  },
  {
    table: 'graph_proposal_sources',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'RESTRICT',
    note: 'Graph proposal source provenance. RESTRICT FK from graph_proposals.',
  },
  {
    table: 'graph_proposal_events',
    category: 'B',
    deletionPolicy: 'no_hard_delete',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'RESTRICT',
    note: 'Graph proposal audit trail. RESTRICT FK from graph_proposals. Append-only.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 37E — Relational Map Workspace (layout metadata only)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    table: 'relational_map_workspaces',
    category: 'C',
    deletionPolicy: 'soft_delete_only',
    hasSoftDelete: false,
    hasTestOwned: false,
    cascadeChildren: [],
    parentFkBehaviour: 'none',
    note: 'Relational map workspace layout metadata. Visual only, not graph authority. Uses status=archived soft-delete pattern.',
  },
]

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/** Get a table entry by name. Returns undefined if not in registry. */
export function getTableEntry(tableName: string): ProtectedTableEntry | undefined {
  return PROTECTED_TABLES.find(t => t.table === tableName)
}

/** Get all Category A tables (living, no hard-delete). */
export function getCategoryATables(): ProtectedTableEntry[] {
  return PROTECTED_TABLES.filter(t => t.category === 'A')
}

/** Get all tables with active CASCADE relationships. */
export function getCascadeRiskTables(): ProtectedTableEntry[] {
  return PROTECTED_TABLES.filter(t => t.parentFkBehaviour === 'CASCADE')
}

/** Get all tables where hard-delete paths currently exist in code. */
export function getHardDeleteRiskTables(): ProtectedTableEntry[] {
  return PROTECTED_TABLES.filter(
    t => t.category === 'A' && !t.hasSoftDelete && t.deletionPolicy === 'no_hard_delete'
  )
}

/** Check if a table allows hard deletion. */
export function isHardDeleteAllowed(tableName: string): boolean {
  const entry = getTableEntry(tableName)
  if (!entry) return false // Unknown table = not allowed
  return entry.deletionPolicy === 'hard_delete_allowed' || entry.deletionPolicy === 'hard_delete_guarded'
}

/** Check if a table is Category A (living/protected). */
export function isCategoryA(tableName: string): boolean {
  const entry = getTableEntry(tableName)
  return entry ? entry.category === 'A' : false
}
