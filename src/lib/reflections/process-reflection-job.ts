// Phase 24 — Interior Reflection Engine: job processor
// Reads a pending job, loads its sources, generates a typed reflection,
// validates the output, routes it, and stores the result.
// Marks the job completed or failed — never leaves it in 'processing' on error.
//
// Core guarantees:
//   - One job = one reflection only
//   - Invalid output fails the job cleanly; nothing is written
//   - Reflections never mutate Timeline / Living State / Desk / Concepts
//   - Ari jobs only load Ari sources; Eli jobs only load Eli sources
//     (enforced in reflection-sources.ts — only matching presence_id rows are returned)

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import {
  isValidReflectionOutput,
  type ReflectionJob,
  type ReflectionOutput,
} from './reflection-types'
import { loadSources } from './reflection-sources'
import { buildReflectionPrompt } from './reflection-prompt'
import { classifyReflectionRoute } from './reflection-routing'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export interface ProcessResult {
  jobId: string
  status: 'completed' | 'failed'
  reflectionId?: string
  reflectionType?: string
  suggestedTarget?: string | null
  error?: string
}

/**
 * Process a single reflection job.
 * Assumes the job is in 'pending' status.
 */
export async function processReflectionJob(job: ReflectionJob): Promise<ProcessResult> {
  const supabase = getSupabase()

  // Mark as processing
  await supabase
    .from('reflection_jobs')
    .update({ status: 'processing' })
    .eq('id', job.id)

  try {
    // --- Load sources ---
    const sources = await loadSources(job.trigger_type, job.source_refs)
    if (sources.length === 0) {
      throw new Error(
        `No valid sources could be loaded for job ${job.id} (trigger: ${job.trigger_type}). ` +
        `Sources may have been deleted, have wrong status, or wrong presence.`
      )
    }

    // --- Build prompt ---
    const prompt = buildReflectionPrompt(job.presence_id, sources)

    // --- Call Claude ---
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable not set')

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    // --- Parse JSON ---
    let parsed: unknown
    try {
      // Strip any accidental markdown fences
      const clean = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      throw new Error(`Model returned non-JSON output: ${rawText.slice(0, 300)}`)
    }

    // --- Validate ---
    if (!isValidReflectionOutput(parsed)) {
      throw new Error(
        `Reflection output failed validation: ${JSON.stringify(parsed).slice(0, 400)}`
      )
    }

    const output = parsed as ReflectionOutput

    // --- Route (classify only, no writes) ---
    const routing = classifyReflectionRoute(output)

    // --- Store reflection ---
    const { data: reflection, error: insertError } = await supabase
      .from('reflections')
      .insert({
        presence_id: job.presence_id,
        reflection_type: output.reflection_type,
        content: output.content,
        confidence: output.confidence,
        source_refs: job.source_refs,
        suggested_target: routing.suggested_target,
        routing_rationale: routing.rationale,
      })
      .select()
      .single()

    if (insertError) throw new Error(`Failed to store reflection: ${insertError.message}`)

    // --- Mark job completed ---
    await supabase
      .from('reflection_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return {
      jobId: job.id,
      status: 'completed',
      reflectionId: reflection.id,
      reflectionType: output.reflection_type,
      suggestedTarget: routing.suggested_target,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[reflection] Job ${job.id} failed:`, message)

    await supabase
      .from('reflection_jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return { jobId: job.id, status: 'failed', error: message }
  }
}

/**
 * Fetch and process pending reflection jobs.
 * Optional presenceId filter ensures Ari and Eli are processed independently.
 * Limit prevents over-reflection: default max 5 per call.
 */
export async function processPendingJobs(
  presenceId?: 'ari' | 'eli',
  limit = 5
): Promise<ProcessResult[]> {
  const supabase = getSupabase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('reflection_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (presenceId) {
    query = query.eq('presence_id', presenceId)
  }

  const { data: jobs, error } = await query
  if (error) throw new Error(`Failed to fetch pending jobs: ${error.message}`)
  if (!jobs || jobs.length === 0) return []

  const results: ProcessResult[] = []
  for (const job of jobs as ReflectionJob[]) {
    const result = await processReflectionJob(job)
    results.push(result)
  }

  return results
}
