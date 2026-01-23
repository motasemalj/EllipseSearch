#!/bin/bash
# ===========================================
# RPA Browser Automation Quick Start Script
# ===========================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  RPA Browser Automation for AEO${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is required but not installed.${NC}"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies if needed
if ! python -c "import playwright" 2>/dev/null; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pip install -r requirements.txt
    playwright install chromium
fi

# Check Chrome debugging
echo -e "${YELLOW}Checking Chrome debugging port...${NC}"
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Chrome debugging is available${NC}"
else
    echo -e "${RED}✗ Chrome debugging is not available${NC}"
    echo ""
    echo "Please start Chrome with remote debugging enabled:"
    echo ""
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "  google-chrome --remote-debugging-port=9222"
    else
        echo '  "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222'
    fi
    
    echo ""
    echo "Then log in to the AI platforms you want to use."
    exit 1
fi

# Run the main script with all arguments
echo ""
echo -e "${GREEN}Starting RPA automation...${NC}"
echo ""

python main.py "$@"

