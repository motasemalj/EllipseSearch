"""
RPA Browser Automation for AEO Analysis

A Python-based Robotic Process Automation (RPA) solution that connects
to your existing Chrome browser to automate interactions with AI platforms.

Supported Engines:
- ChatGPT (chatgpt.com)
- Gemini (gemini.google.com)
- Perplexity (perplexity.ai)
- Grok (grok.x.ai)
"""

__version__ = "1.0.0"
__author__ = "EllipseSearch"

from .browser_connection import BrowserConnection
from .engines import get_engine, ENGINES
from .config import config, RPAConfig

__all__ = [
    "BrowserConnection",
    "get_engine",
    "ENGINES",
    "config",
    "RPAConfig",
]

