#!/usr/bin/env python3
"""
RPA Main Entry Point

This file redirects to worker.py which is the proper entry point
for the EllipseSearch RPA worker.

Usage:
    python worker.py

Or simply:
    python main.py  (redirects to worker.py)
"""

import sys
import os

# Add the rpa directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import and run worker
from worker import main

if __name__ == "__main__":
    print("=" * 60)
    print("NOTE: Running worker.py (main.py redirects here)")
    print("=" * 60)
    print()
    sys.exit(main())
