"""
AI Engine automation modules.

Each engine module handles the specific selectors and behaviors for that platform.
"""

from .base_engine import BaseEngine
from .chatgpt_engine import ChatGPTEngine
from .gemini_engine import GeminiEngine
from .perplexity_engine import PerplexityEngine
from .grok_engine import GrokEngine

# Engine registry
ENGINES = {
    "chatgpt": ChatGPTEngine,
    "gemini": GeminiEngine,
    "perplexity": PerplexityEngine,
    "grok": GrokEngine,
}


def get_engine(engine_name: str) -> BaseEngine:
    """
    Get an engine instance by name.
    
    Args:
        engine_name: Name of the engine (chatgpt, gemini, perplexity, grok)
        
    Returns:
        Engine instance
        
    Raises:
        ValueError: If engine name is not recognized
    """
    engine_name = engine_name.lower()
    
    if engine_name not in ENGINES:
        raise ValueError(
            f"Unknown engine: {engine_name}. "
            f"Available engines: {list(ENGINES.keys())}"
        )
    
    return ENGINES[engine_name]()


__all__ = [
    "BaseEngine",
    "ChatGPTEngine",
    "GeminiEngine",
    "PerplexityEngine",
    "GrokEngine",
    "ENGINES",
    "get_engine",
]

