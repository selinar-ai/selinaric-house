/**
 * Phase 42.3.1 — Library pack: read-only data layer
 *
 * The ONLY file in the slice that reads the database — and it reads only. It runs
 * `.select()` queries against `library_items` / `library_item_files`, maps rows to
 * metadata-only records, and applies the scan-scope caps.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * READ-ONLY. Only `.select()` is used. No write operation of any kind, no rpc,
 *     no client construction (the runner injects the client).
 *   * METADATA ONLY. File `extracted_text` body is never selected — only status,
 *     char-count, truncated flag, and needs_review.
 *   * NEVER touches helper_outputs, archive, graph, memory, recall, or any
 *     authority surface.
 *   * `applyScopeCaps` is PURE (no client) so caps are unit-testable on their own.
 */

import type { AgentReportScope } from '../../kernel/types'
import {
  MAX_FILES_SCANNED,
  MAX_ITEMS_PER_REPORT,
  type LibraryFileRecord,
  type LibraryItemRecord,
  type LibraryScopeDescriptor,
  type LibraryScopeInput,
} from './payloads'

/**
 * Minimal STRUCTURAL read-only client interface — only the query surface this
 * layer uses (`.from().select()` + `.eq()/.in()/.limit()`, awaitable). Defined
 * here (not imported from @supabase) so the lib is decoupled from any specific
 * supabase-js install, and so it is read-only by construction (no insert/update/
 * delete/upsert/rpc method exists on this type). A real Supabase client satisfies
 * it structurally; the runner injects one.
 */
type ReadResult = { data: unknown[] | null; error: { message: string } | null }
interface ReadFilter extends PromiseLike<ReadResult> {
  eq(column: string, value: string): ReadFilter
  in(column: string, values: string[]): ReadFilter
  limit(count: number): ReadFilter
}
interface ReadTable {
  select(columns: string): ReadFilter
}
export interface ReadOnlyDb {
  from(table: string): ReadTable
}

const ITEM_COLUMNS =
  'id,title,description,tags,presence_scope,collection,item_type,phase_code,phase_number,phase_label,source_url,file_path,content_text,authority_status,archive_item_id'

// Metadata only — NO extracted_text (file body is never read).
const FILE_COLUMNS =
  'id,library_item_id,file_name,file_type,file_path,storage_bucket,extraction_status,extraction_char_count,extraction_truncated,needs_review'

// ─── value coercion (defensive, no `any`) ───────────────────────────────────

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function asStrOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}
function asNumOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null
}
function asBool(v: unknown): boolean {
  return v === true
}
function asStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function mapItem(row: Record<string, unknown>): LibraryItemRecord {
  return {
    id: asStr(row.id),
    title: asStr(row.title),
    description: asStrOrNull(row.description),
    tags: asStrArray(row.tags),
    presence_scope: asStr(row.presence_scope),
    collection: asStr(row.collection),
    item_type: asStr(row.item_type),
    phase_code: asStrOrNull(row.phase_code),
    phase_number: asNumOrNull(row.phase_number),
    phase_label: asStrOrNull(row.phase_label),
    source_url: asStrOrNull(row.source_url),
    file_path: asStrOrNull(row.file_path),
    content_text: asStrOrNull(row.content_text),
    authority_status: asStr(row.authority_status),
    archive_item_id: asStrOrNull(row.archive_item_id),
  }
}

function mapFile(row: Record<string, unknown>): LibraryFileRecord {
  return {
    id: asStr(row.id),
    library_item_id: asStr(row.library_item_id),
    file_name: asStr(row.file_name),
    file_type: asStr(row.file_type),
    file_path: asStrOrNull(row.file_path),
    storage_bucket: asStrOrNull(row.storage_bucket),
    extraction_status: asStr(row.extraction_status),
    extraction_char_count: asNumOrNull(row.extraction_char_count),
    extraction_truncated: asBool(row.extraction_truncated),
    needs_review: asBool(row.needs_review),
  }
}

function describeRef(descriptor: LibraryScopeDescriptor): string | undefined {
  switch (descriptor.type) {
    case 'item':
      return descriptor.itemId
    case 'collection':
      return descriptor.collection
    case 'manual_batch':
      return descriptor.itemIds.join(',')
    default:
      return undefined
  }
}

/**
 * PURE: apply scan-scope caps to already-fetched rows. Truncates items to
 * MAX_ITEMS_PER_REPORT and the scoped files to MAX_FILES_SCANNED, and reports any
 * truncation explicitly (never silent). Unit-testable without a client.
 */
export function applyScopeCaps(
  rawItems: LibraryItemRecord[],
  rawFiles: LibraryFileRecord[],
  descriptor: LibraryScopeDescriptor,
): { input: LibraryScopeInput; scope: AgentReportScope } {
  const itemsCapped = rawItems.length > MAX_ITEMS_PER_REPORT
  const items = itemsCapped ? rawItems.slice(0, MAX_ITEMS_PER_REPORT) : rawItems

  const itemIds = new Set(items.map((i) => i.id))
  const scopedFiles = rawFiles.filter((f) => itemIds.has(f.library_item_id))
  const filesCapped = scopedFiles.length > MAX_FILES_SCANNED
  const files = filesCapped ? scopedFiles.slice(0, MAX_FILES_SCANNED) : scopedFiles

  const reasons: string[] = []
  if (itemsCapped) {
    reasons.push(`items capped at ${MAX_ITEMS_PER_REPORT} (resolved ${rawItems.length})`)
  }
  if (filesCapped) {
    reasons.push(`files capped at ${MAX_FILES_SCANNED} (scoped ${scopedFiles.length})`)
  }

  return {
    input: { items, files },
    scope: {
      type: descriptor.type,
      ref: describeRef(descriptor),
      resolved_count: items.length,
      capped: itemsCapped || filesCapped,
      cap_reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    },
  }
}

async function fetchItems(
  sb: ReadOnlyDb,
  descriptor: LibraryScopeDescriptor,
): Promise<LibraryItemRecord[]> {
  // Over-fetch by one so applyScopeCaps can detect (and declare) truncation.
  const overFetch = MAX_ITEMS_PER_REPORT + 1

  if (descriptor.type === 'item') {
    const { data, error } = await sb.from('library_items').select(ITEM_COLUMNS).eq('id', descriptor.itemId)
    if (error) throw new Error(`library_items read failed: ${error.message}`)
    return (data ?? []).map((r) => mapItem(r as Record<string, unknown>))
  }

  if (descriptor.type === 'collection') {
    const { data, error } = await sb
      .from('library_items')
      .select(ITEM_COLUMNS)
      .eq('collection', descriptor.collection)
      .limit(overFetch)
    if (error) throw new Error(`library_items read failed: ${error.message}`)
    return (data ?? []).map((r) => mapItem(r as Record<string, unknown>))
  }

  if (descriptor.type === 'manual_batch') {
    const { data, error } = await sb
      .from('library_items')
      .select(ITEM_COLUMNS)
      .in('id', descriptor.itemIds)
    if (error) throw new Error(`library_items read failed: ${error.message}`)
    return (data ?? []).map((r) => mapItem(r as Record<string, unknown>))
  }

  if (descriptor.type === 'items_with_files') {
    const { data: fileRows, error: fileErr } = await sb
      .from('library_item_files')
      .select('library_item_id')
      .limit(MAX_FILES_SCANNED + 1)
    if (fileErr) throw new Error(`library_item_files read failed: ${fileErr.message}`)
    const ids = Array.from(
      new Set((fileRows ?? []).map((r) => asStr((r as Record<string, unknown>).library_item_id))),
    ).filter((id) => id.length > 0)
    if (ids.length === 0) return []
    const { data, error } = await sb.from('library_items').select(ITEM_COLUMNS).in('id', ids)
    if (error) throw new Error(`library_items read failed: ${error.message}`)
    return (data ?? []).map((r) => mapItem(r as Record<string, unknown>))
  }

  // whole_library
  const { data, error } = await sb.from('library_items').select(ITEM_COLUMNS).limit(overFetch)
  if (error) throw new Error(`library_items read failed: ${error.message}`)
  return (data ?? []).map((r) => mapItem(r as Record<string, unknown>))
}

async function fetchFilesForItems(
  sb: ReadOnlyDb,
  itemIds: string[],
): Promise<LibraryFileRecord[]> {
  if (itemIds.length === 0) return []
  const { data, error } = await sb
    .from('library_item_files')
    .select(FILE_COLUMNS)
    .in('library_item_id', itemIds)
    .limit(MAX_FILES_SCANNED + 1)
  if (error) throw new Error(`library_item_files read failed: ${error.message}`)
  return (data ?? []).map((r) => mapFile(r as Record<string, unknown>))
}

/**
 * Read-only fetch + cap for a scope. The injected client is used for SELECT only.
 * Returns the input bundle and the resolved (possibly capped) scope descriptor.
 */
export async function fetchLibraryScope(
  sb: ReadOnlyDb,
  descriptor: LibraryScopeDescriptor,
): Promise<{ input: LibraryScopeInput; scope: AgentReportScope }> {
  const rawItems = await fetchItems(sb, descriptor)
  const itemIds = rawItems.map((i) => i.id)
  const rawFiles = await fetchFilesForItems(sb, itemIds)
  return applyScopeCaps(rawItems, rawFiles, descriptor)
}
