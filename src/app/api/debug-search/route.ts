import { NextRequest, NextResponse } from 'next/server'
import { braveSearch } from '@/lib/web-search'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? 'melbourne weather'

  try {
    const results = await braveSearch(q)

    return NextResponse.json({
      success: true,
      query: q,
      result_count: results.length,
      first_result: results[0] ?? null,
      error: null,
    })
  } catch (err) {
    return NextResponse.json({
      success: false,
      query: q,
      result_count: 0,
      first_result: null,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
