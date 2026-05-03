// Phase 29A — embed-text Edge Function
//
// Provider: Supabase/gte-small (384 dims, cosine-normalised)
// Called by: Vercel server-side only (generateArchiveEmbedding in archive-semantic.ts)
// Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>  (server-side only; never exposed to browser)
//
// POST { text: string }
// → { embedding: number[] }  (length 384)
//
// This function does NOT write to the database.
// It does NOT change canonical_status.
// It does NOT create archive_memory_events.
// RAG retrieves. RAG does not decide.
//
// Deploy via:
//   supabase functions deploy embed-text
// or:
//   Supabase Dashboard → Edge Functions → New function → paste this file

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const session = new Supabase.ai.Session('gte-small')

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: { text?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
    return new Response(
      JSON.stringify({ error: 'text is required and must be a non-empty string' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const raw       = await session.run(body.text.trim(), { mean_pool: true, normalize: true })
  const embedding = Array.from(raw as Float32Array)

  return new Response(
    JSON.stringify({ embedding }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
