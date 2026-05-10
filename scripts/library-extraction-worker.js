#!/usr/bin/env node

// Phase 33E — Library Extraction Worker
//
// Local worker that polls library_extraction_jobs and processes
// image OCR, audio transcription, and video audio transcription.
//
// Extraction is not Memory. OCR is not Memory. Transcript is not Memory.
// Searchable media text is not RAG. Library media content is Library material only.
//
// Usage:
//   node scripts/library-extraction-worker.js
//
// Requirements:
//   - Node.js 18+
//   - npm install (in scripts/ directory for tesseract.js)
//   - For audio/video: ffmpeg on PATH, faster-whisper or whisper CLI
//
// Environment (reads from project .env.local or set manually):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   WHISPER_CMD       — whisper CLI command (default: 'faster-whisper')
//   WHISPER_MODEL     — whisper model name (default: 'base')
//   FFMPEG_CMD        — ffmpeg path (default: 'ffmpeg')
//   POLL_INTERVAL_MS  — poll interval (default: 5000)

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

// ─── Load env from project .env.local ──────────────────────────────────────

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.substring(0, eq).trim();
    let val = trimmed.substring(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = 'library-files';
const MAX_CHARS = 200_000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const WHISPER_CMD = process.env.WHISPER_CMD || 'faster-whisper';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';
const FFMPEG_CMD = process.env.FFMPEG_CMD || 'ffmpeg';
const WORKER_ID = `worker-${os.hostname()}-${process.pid}`;

// ─── Helpers ───────────────────────────────────────────────────────────────

function tmpFile(ext) {
  return path.join(os.tmpdir(), `lib-extract-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${err.message}\n${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

// ─── Image OCR (tesseract.js) ──────────────────────────────────────────────

async function processImageOcr(buffer, mimeType) {
  let Tesseract;
  try {
    Tesseract = require('tesseract.js');
  } catch {
    throw new Error('tesseract.js not installed. Run: cd scripts && npm install tesseract.js');
  }

  const worker = await Tesseract.createWorker('eng');
  try {
    const { data } = await worker.recognize(buffer);
    const text = (data.text || '').trim();
    return {
      text: text || null,
      confidence: data.confidence / 100,
      language: 'en',
      method: 'image_ocr',
    };
  } finally {
    await worker.terminate();
  }
}

// ─── Audio Transcript (whisper CLI) ────────────────────────────────────────

async function processAudioTranscript(buffer, fileName) {
  const ext = path.extname(fileName) || '.wav';
  const inputPath = tmpFile(ext.replace('.', ''));

  fs.writeFileSync(inputPath, buffer);
  try {
    // Try faster-whisper first, fall back to whisper
    const outputJson = inputPath + '.json';
    try {
      await exec(WHISPER_CMD, [
        inputPath,
        '--model', WHISPER_MODEL,
        '--output_format', 'json',
        '--output_dir', path.dirname(inputPath),
      ]);
    } catch (whisperErr) {
      // Try plain whisper command
      if (WHISPER_CMD === 'faster-whisper') {
        await exec('whisper', [
          inputPath,
          '--model', WHISPER_MODEL,
          '--output_format', 'json',
          '--output_dir', path.dirname(inputPath),
        ]);
      } else {
        throw whisperErr;
      }
    }

    // Parse output
    const jsonPath = inputPath.replace(/\.[^.]+$/, '.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error('Whisper output not found. Ensure whisper or faster-whisper is installed.');
    }

    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    let text = '';
    let language = null;
    let duration = null;

    if (raw.segments) {
      text = raw.segments.map(s => s.text).join(' ').trim();
      language = raw.language || null;
      const lastSeg = raw.segments[raw.segments.length - 1];
      if (lastSeg) duration = lastSeg.end;
    } else if (raw.text) {
      text = raw.text.trim();
      language = raw.language || null;
    }

    // Clean up output file
    try { fs.unlinkSync(jsonPath); } catch { /* ok */ }

    return {
      text: text || null,
      language,
      duration,
      method: 'audio_transcript',
    };
  } finally {
    try { fs.unlinkSync(inputPath); } catch { /* ok */ }
  }
}

// ─── Video Audio Transcript (ffmpeg + whisper) ─────────────────────────────

async function processVideoAudioTranscript(buffer, fileName) {
  const ext = path.extname(fileName) || '.mp4';
  const videoPath = tmpFile(ext.replace('.', ''));
  const audioPath = tmpFile('wav');

  fs.writeFileSync(videoPath, buffer);
  try {
    // Extract audio track with ffmpeg
    await exec(FFMPEG_CMD, [
      '-i', videoPath,
      '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
      '-y', audioPath,
    ]);

    if (!fs.existsSync(audioPath)) {
      throw new Error('ffmpeg audio extraction failed. Ensure ffmpeg is installed.');
    }

    // Run whisper on extracted audio
    const audioBuf = fs.readFileSync(audioPath);
    const result = await processAudioTranscript(audioBuf, 'extracted.wav');
    result.method = 'video_audio_transcript';
    return result;
  } finally {
    try { fs.unlinkSync(videoPath); } catch { /* ok */ }
    try { fs.unlinkSync(audioPath); } catch { /* ok */ }
  }
}

// ─── Job Processing ────────────────────────────────────────────────────────

async function processJob(job) {
  console.log(`  Processing job ${job.id} (${job.job_type}) for file ${job.file_id}`);

  // 1. Claim the job
  const { error: claimErr } = await sb
    .from('library_extraction_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      worker_id: WORKER_ID,
    })
    .eq('id', job.id)
    .eq('status', 'queued'); // Optimistic lock

  if (claimErr) {
    console.log(`  Could not claim job ${job.id}: ${claimErr.message}`);
    return;
  }

  // Mark file as processing
  await sb.from('library_item_files').update({
    extraction_status: 'processing',
  }).eq('id', job.file_id);

  try {
    // 2. Get file record
    const { data: fileRecord } = await sb
      .from('library_item_files')
      .select('*')
      .eq('id', job.file_id)
      .single();

    if (!fileRecord) throw new Error('File record not found');

    // 3. Download from storage
    const { data: dlData, error: dlErr } = await sb.storage
      .from(BUCKET)
      .download(fileRecord.file_path);

    if (dlErr || !dlData) throw new Error(`Download failed: ${dlErr?.message || 'unknown'}`);

    const buffer = Buffer.from(await dlData.arrayBuffer());

    // 4. Process based on job type
    let result;
    switch (job.job_type) {
      case 'image_ocr':
        result = await processImageOcr(buffer, fileRecord.mime_type);
        break;
      case 'audio_transcript':
        result = await processAudioTranscript(buffer, fileRecord.file_name);
        break;
      case 'video_audio_transcript':
        result = await processVideoAudioTranscript(buffer, fileRecord.file_name);
        break;
      default:
        throw new Error(`Unknown job type: ${job.job_type}`);
    }

    // 5. Save results
    const text = result.text || '';
    const charCount = text.length;
    const truncated = charCount > MAX_CHARS;
    const storedText = truncated ? text.substring(0, MAX_CHARS) : text;
    const status = text ? 'extracted' : 'empty';

    await sb.from('library_item_files').update({
      extraction_status: status,
      extracted_text: storedText || null,
      extracted_at: new Date().toISOString(),
      extraction_error: null,
      extraction_char_count: charCount,
      extraction_truncated: truncated,
      extraction_method: result.method,
      extraction_confidence: result.confidence ?? null,
      extraction_language: result.language ?? null,
      media_duration_seconds: result.duration ?? null,
    }).eq('id', job.file_id);

    await sb.from('library_extraction_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result_char_count: charCount,
      result_truncated: truncated,
    }).eq('id', job.id);

    console.log(`  ✓ Job ${job.id} completed: ${status}, ${charCount} chars`);

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Job ${job.id} failed: ${errMsg}`);

    // Don't show raw stack traces — clean error message
    const cleanErr = errMsg.length > 500 ? errMsg.substring(0, 500) : errMsg;

    await sb.from('library_item_files').update({
      extraction_status: 'failed',
      extraction_error: cleanErr,
      extracted_at: new Date().toISOString(),
    }).eq('id', job.file_id);

    await sb.from('library_extraction_jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: cleanErr,
    }).eq('id', job.id);
  }
}

// ─── Poll Loop ─────────────────────────────────────────────────────────────

async function resetStaleJobs() {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await sb
    .from('library_extraction_jobs')
    .update({ status: 'queued', started_at: null, worker_id: null })
    .eq('status', 'processing')
    .lt('started_at', tenMinAgo)
    .select('id');

  if (data && data.length > 0) {
    console.log(`Reset ${data.length} stale processing job(s)`);
    for (const j of data) {
      await sb.from('library_item_files').update({ extraction_status: 'queued' })
        .eq('id', j.file_id);
    }
  }
}

async function pollOnce() {
  const { data: jobs, error } = await sb
    .from('library_extraction_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('Poll error:', error.message);
    return;
  }

  if (jobs && jobs.length > 0) {
    await processJob(jobs[0]);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Library Extraction Worker — Phase 33E          ║');
  console.log('║  Extraction is not Memory. OCR is not Memory.   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Worker ID: ${WORKER_ID}`);
  console.log(`Poll interval: ${POLL_INTERVAL}ms`);
  console.log(`Whisper: ${WHISPER_CMD} (model: ${WHISPER_MODEL})`);
  console.log('');

  // Reset stale jobs on startup
  await resetStaleJobs();

  // Check tool availability
  let hasTestract = false;
  try { require('tesseract.js'); hasTestract = true; } catch { /* */ }
  console.log(`tesseract.js: ${hasTestract ? '✓ available' : '✗ not installed (cd scripts && npm install tesseract.js)'}`);

  let hasWhisper = false;
  try { await exec(WHISPER_CMD, ['--help']); hasWhisper = true; } catch { /* */ }
  if (!hasWhisper) {
    try { await exec('whisper', ['--help']); hasWhisper = true; } catch { /* */ }
  }
  console.log(`whisper: ${hasWhisper ? '✓ available' : '✗ not found (install faster-whisper or whisper)'}`);

  let hasFfmpeg = false;
  try { await exec(FFMPEG_CMD, ['-version']); hasFfmpeg = true; } catch { /* */ }
  console.log(`ffmpeg: ${hasFfmpeg ? '✓ available' : '✗ not found (install ffmpeg)'}`);

  console.log('\nPolling for jobs...\n');

  // Poll loop
  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      console.error('Poll cycle error:', err.message);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch(err => {
  console.error('Worker fatal error:', err);
  process.exit(1);
});
