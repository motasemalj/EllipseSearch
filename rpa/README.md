# RPA Worker for EllipseSearch AEO Platform

Automatic real-browser automation for AI engine analysis. The platform **automatically uses RPA when the worker is running**, with seamless fallback to API mode when it's not.

## How It Works (Automatic)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User clicks "Run Analysis"                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   Platform checks: Is RPA online?                   │
│                      (via heartbeat endpoint)                       │
└─────────────────────────────────────────────────────────────────────┘
                    │                          │
           RPA Online ✓                  RPA Offline ✗
                    │                          │
                    ↓                          ↓
┌───────────────────────────┐    ┌───────────────────────────────────┐
│   Uses YOUR Chrome        │    │    Uses API mode                  │
│   - Real cookies/session  │    │    - Direct API calls             │
│   - Human fingerprint     │    │    - Works without RPA setup      │
│   - Bypasses bot detect   │    │    - Automatic fallback           │
└───────────────────────────┘    └───────────────────────────────────┘
```

**No mode selection needed** - the platform automatically:
1. Checks if RPA worker is running (heartbeat every 10s)
2. Uses RPA if available (real browser, best results)
3. Falls back to API if not (still works, just less reliable)

## Quick Start

### 1. Install Dependencies

```bash
cd rpa
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

Create `.env` in the rpa folder:

```bash
PLATFORM_URL=http://localhost:3000
RPA_WEBHOOK_SECRET=your_secret_here
```

Add the same secret to your main project `.env`:
```bash
RPA_WEBHOOK_SECRET=your_secret_here
```

### 3. Start Chrome with Debugging

```bash
./start_chrome.sh
```

In the Chrome window that opens, **log in to all AI platforms**:
- https://chat.openai.com (ChatGPT)
- https://gemini.google.com (Gemini)  
- https://perplexity.ai (Perplexity)
- https://grok.x.ai (Grok)

### 4. Run the Worker

```bash
python worker.py
```

That's it! The worker will:
- Connect to your Chrome browser
- Send heartbeats to the platform (every 10s)
- Process any analysis jobs automatically
- Keep running until you stop it (Ctrl+C)

### 5. Use the Platform Normally

Just click "Run Analysis" in the platform. It will automatically use RPA since your worker is running. When you stop the worker, it automatically falls back to API mode.

## CLI Options

```bash
python worker.py --help
```

| Option | Default | Description |
|--------|---------|-------------|
| `--platform-url` | `http://localhost:3000` | Platform URL |
| `--secret` | from `.env` | Webhook secret |
| `--poll-interval` | `10` | Seconds between polling |
| `--min-delay` | `5` | Min delay between prompts |
| `--max-delay` | `10` | Max delay between prompts |
| `--verbose` | off | Show debug output |

## Troubleshooting

### "Chrome is not running with remote debugging"

1. Close ALL Chrome windows completely (check Activity Monitor/Task Manager)
2. Run `./start_chrome.sh`
3. Verify at http://localhost:9222/json/version

### Worker shows "No pending jobs"

This is normal! It means:
- The worker is connected and waiting
- When you run analysis in the platform, jobs will appear

### Analysis still uses API mode

Check that:
1. Worker is running and showing heartbeat messages
2. `RPA_WEBHOOK_SECRET` matches in both `.env` files
3. Platform can reach the worker (same network)

### Engine-specific issues

- **ChatGPT**: Must be logged in, may need Plus for rate limits
- **Gemini**: Must be logged into Google account
- **Perplexity**: Free tier has rate limits
- **Grok**: Must be logged into X (Twitter)

## Project Structure

```
rpa/
├── worker.py           # Main worker (run this!)
├── main.py             # Redirects to worker.py
├── config.py           # Configuration
├── browser_connection.py  # Chrome CDP connection
├── start_chrome.sh     # Chrome launcher
├── engines/            # Engine-specific automation
└── utils/              # Logging, human behavior
```

## Security

- Webhook secret authenticates worker ↔ platform
- Chrome debug port (9222) is local only
- Never commit `.env` files
