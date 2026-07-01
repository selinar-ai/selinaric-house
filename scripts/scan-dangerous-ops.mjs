/**
 * Phase 36J — Dangerous Operations Scanner
 *
 * Scans the codebase for hard-delete paths, unguarded .delete() calls,
 * CASCADE references, and other patterns that could cause data loss.
 *
 * Usage:
 *   node scripts/scan-dangerous-ops.mjs           # report mode (default)
 *   node scripts/scan-dangerous-ops.mjs --strict   # exit 1 on new critical findings
 *
 * This is a READ-ONLY static analysis tool. It modifies nothing.
 *
 * v1 behaviour (report-only by default):
 *   - Always exits 0 unless --strict is passed.
 *   - Known historical files are flagged as KNOWN (not CRITICAL).
 *   - Use --strict to make non-allowlisted critical findings fail the run.
 *
 * Exit codes (--strict mode only):
 *   0 — No new critical findings outside the allowlist
 *   1 — New critical findings that must be addressed
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { resolve, join, relative, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const STRICT = process.argv.includes('--strict')

// ─── Category A tables (no hard delete allowed) ───────────────────────────

const CATEGORY_A_TABLES = [
  'room_messages',
  'lounge_threads',
  'lounge_messages',
  'lounge_carrybacks',
  'presence_journal',
  'presence_timeline',
  'room_memories',
  'sessions',
  'interior_notes',
  'living_state',
  'held_truths',
  'cross_room_events',
  'cross_room_event_impacts',
  'cross_room_impact_propagation_candidates',
  'cross_room_prompt_carryforwards',
  'archive_items',
  'archive_sources',
  'archive_entry_drafts',
]

// ─── Allowlist: known historical files with expected critical findings ─────
// Findings in these files are reported as KNOWN, not CRITICAL.
// They do not block --strict runs.
// To add a file: include the relative path (forward-slash, from project root).

const ALLOWLISTED_FILES = new Set([
  // Phase 36I recovery — historical artifact, already executed, kept as record
  'scripts/036i-guarded-reconstruction.sql',
  // Pre-36J test scripts that hard-delete test-owned rows (created before safety rules)
  'scripts/test-cross-room-events.ts',
  'scripts/test-cross-room-impact.ts',
  'scripts/test-cross-room-prompt-carryforward.ts',
  'scripts/test-cross-room-propagation.ts',
  'scripts/test-lounge-capture.ts',
  'scripts/test-lounge-attachments-36f4.ts',
  'scripts/test-lounge-context-36g.ts',
  'scripts/test-lounge-library-rag-36f2.ts',
  'scripts/test-lounge-parity-36f1.ts',
  'scripts/test-lounge-web-search-36f3.ts',
  'scripts/test-room-carry-in-36f6.ts',
  'scripts/validate-36i-post-migration.ts',
  // Pre-36J migration files that originally used CASCADE (historical, immutable records)
  // Active CASCADE protections are in migration 066 (lounge) and 067 (cross-room)
  'supabase-migrations/011_memory_graph.sql',
  'supabase-migrations/017_reflection_feedback.sql',
  'supabase-migrations/018_living_state_suggestions.sql',
  'supabase-migrations/019_timeline_drafts.sql',
  'supabase-migrations/020_archive_sources_and_drafts.sql',
  'supabase-migrations/021_build_history.sql',
  'supabase-migrations/025_archive_recall_tables.sql',
  'supabase-migrations/029_memory_promotion_assurance.sql',
  'supabase-migrations/030_archive_semantic_recall.sql',
  'supabase-migrations/038_library_item_files.sql',
  'supabase-migrations/041_multimodal_extraction.sql',
  'supabase-migrations/045_library_chunks.sql',
  'supabase-migrations/049_archive_item_edit_events.sql',
  'supabase-migrations/055_lounge_tables.sql',
  'supabase-migrations/059_cross_room_event_impacts.sql',
  'supabase-migrations/060_cross_room_impact_propagation_candidates.sql',
  'supabase-migrations/061_cross_room_prompt_carryforwards.sql',
  // Legacy test scripts
  'scripts/test-pulse-detail-11e1.ts',
  'test-33e.js',
  'test-33e1.js',
  'test-33f.js',
  'test-33g.js',
])

/** Normalize path to forward-slash for cross-platform allowlist matching */
function normalizePath(p) {
  return p.replace(/\\/g, '/')
}

// ─── Scan patterns ─────────────────────────────────────────────────────────

const PATTERNS = [
  {
    id: 'hard_delete_category_a',
    severity: 'CRITICAL',
    description: 'Hard .delete() on Category A table',
    // Match .from('table_name') followed by .delete() — check if table is Cat A
    test: (content, filePath) => {
      const findings = []
      const fromDeletePattern = /\.from\(['"`](\w+)['"`]\)[\s\S]{0,200}?\.delete\(\)/g
      let match
      while ((match = fromDeletePattern.exec(content)) !== null) {
        const table = match[1]
        if (CATEGORY_A_TABLES.includes(table)) {
          const line = content.slice(0, match.index).split('\n').length
          findings.push({
            table,
            line,
            snippet: match[0].slice(0, 80),
          })
        }
      }
      return findings
    },
  },
  {
    id: 'delete_from_sql',
    severity: 'CRITICAL',
    description: 'DELETE FROM on Category A table in SQL',
    test: (content, filePath) => {
      const findings = []
      for (const table of CATEGORY_A_TABLES) {
        const pattern = new RegExp(`DELETE\\s+FROM\\s+${table}`, 'gi')
        let match
        while ((match = pattern.exec(content)) !== null) {
          // Skip if in a comment
          const lineStart = content.lastIndexOf('\n', match.index) + 1
          const lineContent = content.slice(lineStart, content.indexOf('\n', match.index))
          if (lineContent.trim().startsWith('--')) continue

          const line = content.slice(0, match.index).split('\n').length
          findings.push({ table, line, snippet: match[0] })
        }
      }
      return findings
    },
  },
  {
    id: 'unguarded_delete',
    severity: 'WARNING',
    description: 'Any .delete() call (review for safety)',
    test: (content, filePath) => {
      const findings = []
      const pattern = /\.delete\(\)/g
      let match
      while ((match = pattern.exec(content)) !== null) {
        const line = content.slice(0, match.index).split('\n').length
        // Get surrounding context to identify the table
        const contextStart = Math.max(0, match.index - 200)
        const context = content.slice(contextStart, match.index + 10)
        const fromMatch = context.match(/\.from\(['"`](\w+)['"`]\)/)
        const table = fromMatch ? fromMatch[1] : 'unknown'

        // Skip if already caught as Category A
        if (CATEGORY_A_TABLES.includes(table)) continue

        findings.push({ table, line, snippet: context.slice(-60) })
      }
      return findings
    },
  },
  {
    id: 'cascade_in_migration',
    severity: 'CRITICAL',
    description: 'ON DELETE CASCADE in migration (must be RESTRICT for protected tables)',
    test: (content, filePath) => {
      if (!filePath.includes('supabase-migrations')) return []
      const findings = []
      const pattern = /on\s+delete\s+cascade/gi
      let match
      while ((match = pattern.exec(content)) !== null) {
        // Skip if on a comment line (SQL -- comments)
        const lineStart = content.lastIndexOf('\n', match.index) + 1
        const lineContent = content.slice(lineStart, content.indexOf('\n', match.index))
        if (lineContent.trim().startsWith('--')) continue

        const line = content.slice(0, match.index).split('\n').length
        // Get surrounding context to find the referenced table
        const contextStart = Math.max(0, match.index - 200)
        const context = content.slice(contextStart, match.index + 20)
        const refMatch = context.match(/references\s+(\w+)/)
        const parentTable = refMatch ? refMatch[1] : 'unknown'

        findings.push({ table: parentTable, line, snippet: match[0] })
      }
      return findings
    },
  },
  {
    id: 'drop_table',
    severity: 'CRITICAL',
    description: 'DROP TABLE statement',
    test: (content, filePath) => {
      const findings = []
      const pattern = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/gi
      let match
      while ((match = pattern.exec(content)) !== null) {
        // Skip comments
        const lineStart = content.lastIndexOf('\n', match.index) + 1
        const lineContent = content.slice(lineStart, content.indexOf('\n', match.index))
        if (lineContent.trim().startsWith('--')) continue

        const line = content.slice(0, match.index).split('\n').length
        findings.push({ table: match[1], line, snippet: match[0] })
      }
      return findings
    },
  },
  {
    id: 'truncate_table',
    severity: 'CRITICAL',
    description: 'TRUNCATE TABLE statement',
    test: (content, filePath) => {
      // Only scan SQL files — "truncate" in .ts/.tsx is almost always CSS or string ops
      if (!filePath.endsWith('.sql')) return []
      const findings = []
      const pattern = /TRUNCATE\s+(?:TABLE\s+)?(\w+)/gi
      let match
      while ((match = pattern.exec(content)) !== null) {
        const lineStart = content.lastIndexOf('\n', match.index) + 1
        const lineContent = content.slice(lineStart, content.indexOf('\n', match.index))
        if (lineContent.trim().startsWith('--')) continue

        const line = content.slice(0, match.index).split('\n').length
        findings.push({ table: match[1], line, snippet: match[0] })
      }
      return findings
    },
  },
  {
    id: 'hardcoded_production_id',
    severity: 'WARNING',
    description: 'Hardcoded production thread/resource UUID',
    test: (content, filePath) => {
      const findings = []
      // Known production IDs
      const PRODUCTION_IDS = [
        '04a63187-059b-4563-bc68-02270c022a85', // Original lounge thread
      ]
      for (const id of PRODUCTION_IDS) {
        let idx = content.indexOf(id)
        while (idx !== -1) {
          const line = content.slice(0, idx).split('\n').length
          findings.push({ table: 'n/a', line, snippet: `Production ID: ${id.slice(0, 12)}...` })
          idx = content.indexOf(id, idx + 1)
        }
      }
      return findings
    },
  },
]

// ─── File walker ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'coverage', '.git',
  '.vercel', '.venv-whisper', 'piper-server',
  '.claude', // gitignored, untracked session tooling (may contain session-injected symlinks)
])

// Files to exclude from scanning (self-references, historical artifacts)
const SKIP_FILES = new Set([
  'scan-dangerous-ops.mjs',  // This scanner (avoid self-referential false positives)
])

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.sql',
])

function walkFiles(dir) {
  const files = []

  function recurse(current) {
    const entries = readdirSync(current)
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      const fullPath = join(current, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        recurse(fullPath)
      } else if (SCAN_EXTENSIONS.has(extname(entry)) && !SKIP_FILES.has(entry)) {
        files.push(fullPath)
      }
    }
  }

  recurse(dir)
  return files
}

// ─── Main ──────────────────────────────────────────────────────────────────

function run() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Phase 36J — Dangerous Operations Scanner')
  console.log('═══════════════════════════════════════════════════════════')
  console.log()

  const files = walkFiles(ROOT)
  console.log(`Scanning ${files.length} files...\n`)

  const allFindings = []

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8')
    const relPath = relative(ROOT, filePath)

    for (const pattern of PATTERNS) {
      const findings = pattern.test(content, relPath)
      for (const finding of findings) {
        allFindings.push({
          severity: pattern.severity,
          patternId: pattern.id,
          description: pattern.description,
          file: relPath,
          line: finding.line,
          table: finding.table,
          snippet: finding.snippet,
        })
      }
    }
  }

  // Classify findings: split criticals into NEW vs KNOWN (allowlisted)
  const newCritical = []
  const knownCritical = []
  const warnings = []

  for (const f of allFindings) {
    const normalFile = normalizePath(f.file)
    if (f.severity === 'CRITICAL') {
      if (ALLOWLISTED_FILES.has(normalFile)) {
        knownCritical.push(f)
      } else {
        newCritical.push(f)
      }
    } else {
      warnings.push(f)
    }
  }

  // Sort each group by file
  const sortByFile = (a, b) => a.file.localeCompare(b.file)
  newCritical.sort(sortByFile)
  knownCritical.sort(sortByFile)
  warnings.sort(sortByFile)

  // Print findings
  if (newCritical.length > 0) {
    console.log(`🔴 NEW CRITICAL FINDINGS: ${newCritical.length}`)
    console.log('─────────────────────────────────────────────')
    for (const f of newCritical) {
      console.log(`  [${f.patternId}] ${f.file}:${f.line}`)
      console.log(`    ${f.description}`)
      console.log(`    Table: ${f.table} | ${f.snippet}`)
      console.log()
    }
  }

  if (knownCritical.length > 0) {
    console.log(`📋 KNOWN (allowlisted): ${knownCritical.length}`)
    console.log('─────────────────────────────────────────────')
    for (const f of knownCritical) {
      console.log(`  [${f.patternId}] ${f.file}:${f.line}`)
      console.log(`    ${f.description}`)
      console.log(`    Table: ${f.table} | ${f.snippet}`)
      console.log()
    }
  }

  if (warnings.length > 0) {
    console.log(`⚠️  WARNINGS: ${warnings.length}`)
    console.log('─────────────────────────────────────────────')
    for (const f of warnings) {
      console.log(`  [${f.patternId}] ${f.file}:${f.line}`)
      console.log(`    ${f.description}`)
      console.log(`    Table: ${f.table} | ${f.snippet}`)
      console.log()
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Mode: ${STRICT ? '--strict (blocking)' : 'report-only (default)'}`)
  console.log(`  Files scanned: ${files.length}`)
  console.log(`  New critical: ${newCritical.length}`)
  console.log(`  Known (allowlisted): ${knownCritical.length}`)
  console.log(`  Warnings: ${warnings.length}`)
  console.log('═══════════════════════════════════════════════════════════')

  if (newCritical.length > 0 && STRICT) {
    console.log('\n❌ STRICT MODE: New critical findings must be addressed or allowlisted.\n')
    process.exit(1)
  } else if (newCritical.length > 0) {
    console.log('\n⚠️  New critical findings exist. Review recommended. (Pass --strict to make this a failure.)\n')
    process.exit(0)
  } else {
    console.log('\n✅ No new critical findings. Known items and warnings should be reviewed periodically.\n')
    process.exit(0)
  }
}

run()
