#!/bin/bash
# ===========================================
# Alternative: Start Chrome with Remote Debugging using separate profile
# This method is more reliable on macOS
# ===========================================

echo "🔄 Closing any existing Chrome instances..."
pkill -9 "Google Chrome" 2>/dev/null || true
pkill -9 "Chrome" 2>/dev/null || true
sleep 3

# Check if port is already in use
if lsof -i :9222 > /dev/null 2>&1; then
  echo "⚠️  Port 9222 is already in use. Attempting to free it..."
  lsof -ti :9222 | xargs kill -9 2>/dev/null || true
  sleep 2
fi

echo "🚀 Starting Chrome with debugging on port 9222..."
echo "   (Using separate profile for reliability)"

# Create profile directory if it doesn't exist
PROFILE_DIR="$HOME/ChromeDebugProfile"
mkdir -p "$PROFILE_DIR"

# Start Chrome with remote debugging and separate profile
# This is more reliable on macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  > /dev/null 2>&1 &

CHROME_PID=$!
echo "   Chrome started with PID: $CHROME_PID"

# Wait for Chrome to initialize
echo "⏳ Waiting for Chrome to initialize (up to 15 seconds)..."
for i in {1..15}; do
  if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "✅ Chrome debugging is ready! (after ${i}s)"
    break
  fi
  if [ $i -eq 15 ]; then
    echo "❌ Chrome debugging failed to start"
    exit 1
  fi
  sleep 1
  echo -n "."
done
echo ""

echo "✅ Chrome debugging is ready!"
echo ""
echo "NOTE: This uses a separate Chrome profile."
echo "You'll need to log in to ChatGPT, Gemini, Perplexity, Grok in this Chrome window."
echo ""
echo "Next step: Run python worker_v2.py"

