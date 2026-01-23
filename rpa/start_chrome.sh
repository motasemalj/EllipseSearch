#!/bin/bash
# ===========================================
# Start Chrome with Remote Debugging
# ===========================================

echo "🔄 Closing any existing Chrome instances..."
pkill -9 "Google Chrome" 2>/dev/null || true
sleep 2

echo "🚀 Starting Chrome with debugging on port 9222..."
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/ChromeDebugProfile" \
  --no-first-run \
  &

sleep 3

# Check if it worked
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
  echo "✅ Chrome debugging is ready!"
  echo ""
  echo "Next steps:"
  echo "  1. Log in to ChatGPT, Gemini, Perplexity, Grok in the Chrome window"
  echo "  2. Run: python main.py --csv prompts.csv --engine chatgpt"
else
  echo "❌ Chrome debugging failed to start"
  echo "Try manually: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222"
fi

