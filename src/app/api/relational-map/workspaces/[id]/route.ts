// Phase 37E — Workspace API (get, update, archive)
//
// Layout is not ontology.
// Position is not relationship.
// Distance is not strength.
// Cluster is not truth.
// Dragging does not mutate graph semantics.
//
// Reads/writes ONLY relational_map_workspaces.
// No graph proposal writes. No Memory/Archive writes. No prompt mutation.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateUpdatePayload } from '@/lib/graph/relationalMapWorkspaceValidation'
import type {
  RelationalMapWorkspace,
  RelationalMapWorkspaceRow,
} from '@/lib/graph/relationalMapWorkspaceTypes'

// ─── Row → Client Transform ──────────────────────────────────────────────

function rowToWorkspace(row: RelationalMapWorkspaceRow): RelationalMapWorkspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workspaceScope: row.workspace_scope as RelationalMapWorkspace['workspaceScope'],
    isDefault: row.is_default,
    layoutVersion: row.layout_version,
    layoutData: row.layout_data as RelationalMapWorkspace['layoutData'],
    filterPreset: (row.filter_preset ?? {}) as RelationalMapWorkspace['filterPreset'],
    viewport: (row.viewport ?? null) as RelationalMapWorkspace['viewport'],
    status: row.status as RelationalMapWorkspace['status'],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── Route Context ────────────────────────────────────────────────────────

type RouteContext = { params: Promise<{ id: string }> }

// ─── GET /api/relational-map/workspaces/[id] ─────────────────────────────

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params

  const { data, error } = await supabase
    .from('relational_map_workspaces')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Workspace not found.' },
      { status: 404 }
    )
  }

  return NextResponse.json({ workspace: rowToWorkspace(data as RelationalMapWorkspaceRow) })
}

// ─── PATCH /api/relational-map/workspaces/[id] ───────────────────────────

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }

  // Validate payload
  const validation = validateUpdatePayload(body)
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Validation failed.', details: validation.errors },
      { status: 400 }
    )
  }

  // Check workspace exists
  const { data: existing, error: fetchErr } = await supabase
    .from('relational_map_workspaces')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json(
      { error: 'Workspace not found.' },
      { status: 404 }
    )
  }

  const payload = body as Record<string, unknown>

  // Handle isDefault via RPC if being set to true
  if (payload.isDefault === true) {
    const { error: rpcErr } = await supabase.rpc('set_default_workspace', {
      target_id: id,
    })

    if (rpcErr) {
      return NextResponse.json(
        { error: `Failed to set default: ${rpcErr.message}` },
        { status: 500 }
      )
    }
  }

  // Build update object — only layout metadata fields
  const updateObj: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (payload.name !== undefined) updateObj.name = (payload.name as string).trim()
  if (payload.description !== undefined) updateObj.description = payload.description
  if (payload.layoutData !== undefined) updateObj.layout_data = payload.layoutData
  if (payload.filterPreset !== undefined) updateObj.filter_preset = payload.filterPreset
  if (payload.viewport !== undefined) updateObj.viewport = payload.viewport
  if (payload.status !== undefined) updateObj.status = payload.status
  // isDefault handled by RPC above, but if setting to false directly:
  if (payload.isDefault === false) updateObj.is_default = false

  const { data: updated, error: updateErr } = await supabase
    .from('relational_map_workspaces')
    .update(updateObj)
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr) {
    return NextResponse.json(
      { error: `Failed to update workspace: ${updateErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ workspace: rowToWorkspace(updated as RelationalMapWorkspaceRow) })
}

// ─── DELETE /api/relational-map/workspaces/[id] ──────────────────────────
// Soft archive only — sets status to 'archived'.
// No hard delete.

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params

  // Check workspace exists
  const { data: existing, error: fetchErr } = await supabase
    .from('relational_map_workspaces')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json(
      { error: 'Workspace not found.' },
      { status: 404 }
    )
  }

  if ((existing as Record<string, unknown>).status === 'archived') {
    return NextResponse.json(
      { error: 'Workspace is already archived.' },
      { status: 400 }
    )
  }

  // Soft archive — update status, do not hard delete
  const { error: archiveErr } = await supabase
    .from('relational_map_workspaces')
    .update({
      status: 'archived',
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (archiveErr) {
    return NextResponse.json(
      { error: `Failed to archive workspace: ${archiveErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
