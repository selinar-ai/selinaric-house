// Phase 37E — Workspace API (list + create)
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
import {
  validateCreatePayload,
  isValidWorkspaceScope,
  isValidWorkspaceStatus,
} from '@/lib/graph/relationalMapWorkspaceValidation'
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

// ─── GET /api/relational-map/workspaces ──────────────────────────────────

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const scopeParam = url.searchParams.get('workspace_scope') || undefined
  const statusParam = url.searchParams.get('status') || 'active'

  // Validate params
  if (scopeParam && !isValidWorkspaceScope(scopeParam)) {
    return NextResponse.json(
      { error: `Invalid workspace_scope: "${scopeParam}"` },
      { status: 400 }
    )
  }
  if (!isValidWorkspaceStatus(statusParam)) {
    return NextResponse.json(
      { error: `Invalid status: "${statusParam}"` },
      { status: 400 }
    )
  }

  let query = supabase
    .from('relational_map_workspaces')
    .select('*')
    .eq('status', statusParam)
    .order('updated_at', { ascending: false })

  if (scopeParam) {
    query = query.eq('workspace_scope', scopeParam)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch workspaces: ${error.message}` },
      { status: 500 }
    )
  }

  const workspaces = (data ?? []).map((row: RelationalMapWorkspaceRow) => rowToWorkspace(row))

  return NextResponse.json({ workspaces })
}

// ─── POST /api/relational-map/workspaces ─────────────────────────────────

export async function POST(request: NextRequest) {
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
  const validation = validateCreatePayload(body)
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Validation failed.', details: validation.errors },
      { status: 400 }
    )
  }

  const payload = body as {
    name: string
    description?: string
    workspaceScope: string
    isDefault?: boolean
    layoutData: unknown
    filterPreset?: unknown
    viewport?: unknown
  }

  // If setting as default, use RPC for atomicity
  if (payload.isDefault) {
    // First insert the workspace, then set it as default via RPC
    const { data: inserted, error: insertErr } = await supabase
      .from('relational_map_workspaces')
      .insert({
        name: payload.name.trim(),
        description: payload.description?.trim() ?? null,
        workspace_scope: payload.workspaceScope,
        is_default: false, // Will be set by RPC
        layout_version: 1,
        layout_data: payload.layoutData,
        filter_preset: payload.filterPreset ?? {},
        viewport: payload.viewport ?? null,
        status: 'active',
        created_by: 'tara',
      })
      .select('*')
      .single()

    if (insertErr) {
      return NextResponse.json(
        { error: `Failed to create workspace: ${insertErr.message}` },
        { status: 500 }
      )
    }

    // Set as default atomically
    const { error: rpcErr } = await supabase.rpc('set_default_workspace', {
      target_id: inserted.id,
    })

    if (rpcErr) {
      return NextResponse.json(
        { error: `Failed to set default: ${rpcErr.message}` },
        { status: 500 }
      )
    }

    // Re-fetch to get updated is_default
    const { data: refreshed } = await supabase
      .from('relational_map_workspaces')
      .select('*')
      .eq('id', inserted.id)
      .single()

    return NextResponse.json(
      { workspace: rowToWorkspace(refreshed as RelationalMapWorkspaceRow) },
      { status: 201 }
    )
  }

  // Standard insert (not default)
  const { data: inserted, error: insertErr } = await supabase
    .from('relational_map_workspaces')
    .insert({
      name: payload.name.trim(),
      description: payload.description?.trim() ?? null,
      workspace_scope: payload.workspaceScope,
      is_default: false,
      layout_version: 1,
      layout_data: payload.layoutData,
      filter_preset: payload.filterPreset ?? {},
      viewport: payload.viewport ?? null,
      status: 'active',
      created_by: 'tara',
    })
    .select('*')
    .single()

  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to create workspace: ${insertErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { workspace: rowToWorkspace(inserted as RelationalMapWorkspaceRow) },
    { status: 201 }
  )
}
