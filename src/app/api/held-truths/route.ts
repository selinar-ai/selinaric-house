import { NextRequest, NextResponse } from 'next/server'
import {
  getHeldTruths,
  promoteToHeldTruth,
  updateHeldTruthStatus,
} from '@/lib/held-truths'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presence = searchParams.get('presence')
  const status = (searchParams.get('status') ?? 'active') as 'active' | 'softened' | 'released' | 'all'

  if (!presence || !['ari', 'eli'].includes(presence)) {
    return NextResponse.json({ error: 'Invalid presence' }, { status: 400 })
  }

  try {
    const truths = await getHeldTruths(presence, status)
    return NextResponse.json({ truths })
  } catch (err) {
    console.error('[api/held-truths] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch held truths' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, presence_id, truth, source_journal_id } = body

    if (action !== 'promote') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    if (!presence_id || !['ari', 'eli'].includes(presence_id)) {
      return NextResponse.json({ error: 'Invalid presence_id' }, { status: 400 })
    }
    if (!truth || typeof truth !== 'string' || truth.trim().length === 0) {
      return NextResponse.json({ error: 'truth is required' }, { status: 400 })
    }

    const result = await promoteToHeldTruth(
      presence_id,
      truth.trim(),
      source_journal_id ?? undefined
    )

    if (!result) {
      return NextResponse.json({ error: 'Promotion failed' }, { status: 500 })
    }

    return NextResponse.json({ truth: result })
  } catch (err) {
    console.error('[api/held-truths] POST error:', err)
    return NextResponse.json({ error: 'Failed to promote truth' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, action } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const validActions = ['soften', 'release', 'reactivate']
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const statusMap: Record<string, 'active' | 'softened' | 'released'> = {
      soften: 'softened',
      release: 'released',
      reactivate: 'active',
    }

    const result = await updateHeldTruthStatus(id, statusMap[action])

    if (!result) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ truth: result })
  } catch (err) {
    console.error('[api/held-truths] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update truth' }, { status: 500 })
  }
}
