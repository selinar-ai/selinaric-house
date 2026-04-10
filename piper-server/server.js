const express = require('express')
const cors = require('cors')
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

const PIPER_PATH = process.env.PIPER_PATH
const VOICES_PATH = process.env.VOICES_PATH
const PORT = process.env.PORT || 5000

const VOICE_MAP = {
  eli: process.env.ELI_VOICE || 'en_US-ryan-high',
  ari: process.env.ARI_VOICE || 'en_US-kusal-medium'
}

// Max characters before truncation
const MAX_CHARS = 800

// Strip markdown and clean text before synthesis
function sanitiseForSpeech(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/[-*+]\s/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/={2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

app.post('/synthesize', async (req, res) => {
  const { text, presence } = req.body
  if (!text || !presence) {
    return res.status(400).json({ error: 'text and presence required' })
  }

  const voiceName = VOICE_MAP[presence]
  if (!voiceName) {
    return res.status(400).json({ error: 'unknown presence' })
  }

  const clean = sanitiseForSpeech(text)
  if (clean.length === 0) {
    return res.status(400).json({ error: 'no speakable text after sanitisation' })
  }
  const speakable = clean.length > MAX_CHARS
    ? clean.slice(0, MAX_CHARS) + '...'
    : clean

  const modelPath = path.join(VOICES_PATH, `${voiceName}.onnx`)
  const outputPath = path.join(os.tmpdir(), `piper_${Date.now()}.wav`)

  try {
    await new Promise((resolve, reject) => {
      const proc = execFile(
        PIPER_PATH,
        ['--model', modelPath, '--output_file', outputPath],
        (err) => err ? reject(err) : resolve()
      )
      proc.stdin.write(speakable)
      proc.stdin.end()
    })

    const audio = fs.readFileSync(outputPath)
    fs.unlinkSync(outputPath)

    res.set('Content-Type', 'audio/wav')
    res.send(audio)
  } catch (err) {
    console.error('Piper error:', err)
    res.status(500).json({ error: 'synthesis failed' })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Piper server running on 0.0.0.0:${PORT}`)
)
