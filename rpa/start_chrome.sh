#!/bin/bash
# ===========================================
# Start Chrome with Remote Debugging
# Uses your existing Chrome profile (keeps cookies, passwords, sessions)
# ===========================================

echo "🔄 Closing any existing Chrome instances..."
# More thorough cleanup
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
echo "   (Using your default Chrome profile - cookies and passwords preserved)"

# Start Chrome with remote debugging
# Note: On macOS, Chrome may need a moment to initialize the CDP server
# If this fails, try using a separate profile: --user-data-dir="$HOME/ChromeDebugProfile"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --no-first-run \
  --disable-background-networking \
  --disable-features=TranslateUI \
  2>&1 | grep -v "GpuProcessHost" | grep -v "Renderer" &

CHROME_PID=$!
echo "   Chrome started with PID: $CHROME_PID"

# Wait longer for Chrome to fully initialize
echo "⏳ Waiting for Chrome to initialize (up to 15 seconds)..."
for i in {1..15}; do
  if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "✅ Chrome debugging is ready! (after ${i}s)"
    break
  fi
  if [ $i -eq 15 ]; then
    echo "❌ Chrome debugging failed to start after 15 seconds"
    echo ""
    echo "Diagnostics:"
    echo "  - Chrome PID: $CHROME_PID"
    echo "  - Chrome running: $(ps -p $CHROME_PID > /dev/null 2>&1 && echo 'Yes' || echo 'No')"
    echo "  - Port 9222 status: $(lsof -i :9222 > /dev/null 2>&1 && echo 'In use' || echo 'Not in use')"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check Chrome process: ps aux | grep 'Google Chrome' | grep 9222"
    echo "  2. Test CDP endpoint: curl http://localhost:9222/json/version"
    echo "  3. Check Chrome logs for errors"
    echo "  4. On macOS, try using a separate profile: ./start_chrome_alt.sh"
    echo "  5. Try manually: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222"
    echo ""
    echo "If the default profile doesn't work, use: ./start_chrome_alt.sh"
    echo "  (You'll need to log in again, but it's more reliable)"
    exit 1
  fi
  sleep 1
  echo -n "."
done
echo ""

# Verify it's actually working
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
  echo ""
  echo "✅ Chrome debugging is ready!"
  echo ""
  echo "Your existing Chrome profile is loaded (cookies, passwords, sessions preserved)"
  echo ""
  echo "Next steps:"
  echo "  1. If not already logged in, log in to ChatGPT, Gemini, Perplexity, Grok"
  echo "  2. Run: python worker_v2.py"
else
  echo ""
  echo "❌ Chrome debugging endpoint is not responding"
  echo "   Chrome may be running but CDP is not accessible"
  echo "   Try restarting Chrome manually"
  exit 1
fi

