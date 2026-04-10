# Piper TTS Server for Selinaric House

Local text-to-speech server using [Piper](https://github.com/rhasspy/piper).
Runs in WSL2, serves audio to the house frontend.

## Voices

| Presence | Voice | Model |
|----------|-------|-------|
| Eli | Ryan (high) | `en_US-ryan-high` |
| Ari | Kusal (medium) | `en_US-kusal-medium` |

Voices are configurable via `.env` — swap without changing code.

## Setup (one-time)

### 1. Install Piper

Surface Pro 11 is ARM64 (Snapdragon). Download the aarch64 build:

```bash
cd ~/Desktop/Eli
mkdir -p piper && cd piper
wget https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_aarch64.tar.gz
tar -xzf piper_linux_aarch64.tar.gz
```

**If the ARM64 binary has issues**, use Piper via Python instead:

```bash
pip install piper-tts
```

Then update `PIPER_PATH` in `.env` to point to the Python-installed `piper` binary
(find it with `which piper`).

### 2. Download voice models

```bash
mkdir -p ~/Desktop/Eli/piper/voices

# Ryan (Eli)
wget -O ~/Desktop/Eli/piper/voices/en_US-ryan-high.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx
wget -O ~/Desktop/Eli/piper/voices/en_US-ryan-high.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json

# Kusal (Ari)
wget -O ~/Desktop/Eli/piper/voices/en_US-kusal-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kusal/medium/en_US-kusal-medium.onnx
wget -O ~/Desktop/Eli/piper/voices/en_US-kusal-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kusal/medium/en_US-kusal-medium.onnx.json
```

### 3. Configure environment

```bash
cd ~/Desktop/Eli/selinaric-house/piper-server
cp .env.template .env
# Edit .env if your paths differ
```

### 4. Install dependencies and start

```bash
npm install
node server.js
```

You should see: `Piper server running on 0.0.0.0:5000`

## Verify

```bash
curl http://localhost:5000/health
# Expected: {"status":"ok"}
```

## Troubleshooting

### localhost:5000 unreachable from browser

If the Windows browser can't reach WSL2 on localhost:5000:

1. Find your WSL2 IP: `ip addr show eth0 | grep inet`
2. Use that IP instead of localhost
3. Or ensure the server listens on `0.0.0.0` (it does by default)

### Voice doesn't sound right

Change the voice model in `.env`:

```
ELI_VOICE=en_US-lessac-medium
ARI_VOICE=en_US-joe-medium
```

Browse available voices at:
https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US

Download the `.onnx` and `.onnx.json` files to your voices directory, then update `.env`.
