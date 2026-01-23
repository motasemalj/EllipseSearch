"""
Logging utilities for RPA automation.

Provides rich console output and file logging with timestamps.
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme

# Custom theme for console output
custom_theme = Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "bold red",
    "success": "bold green",
    "engine.chatgpt": "green",
    "engine.gemini": "blue",
    "engine.perplexity": "magenta",
    "engine.grok": "white",
})

console = Console(theme=custom_theme)

# Global logger instance
logger = logging.getLogger("rpa")


def setup_logging(log_file: str = "./rpa_log.txt", level: int = logging.INFO) -> None:
    """
    Set up logging with both console (rich) and file handlers.
    
    Args:
        log_file: Path to log file
        level: Logging level
    """
    # Create log directory if needed
    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Clear existing handlers
    logger.handlers = []
    logger.setLevel(level)
    
    # Rich console handler
    console_handler = RichHandler(
        console=console,
        show_time=True,
        show_path=False,
        rich_tracebacks=True,
    )
    console_handler.setLevel(level)
    console_format = logging.Formatter("%(message)s")
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)
    
    # File handler
    file_handler = logging.FileHandler(log_file, mode="a", encoding="utf-8")
    file_handler.setLevel(level)
    file_format = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    file_handler.setFormatter(file_format)
    logger.addHandler(file_handler)
    
    # Prevent propagation to root logger
    logger.propagate = False
    
    logger.info(f"Logging initialized. File: {log_file}")


def log_engine(engine: str, message: str, level: str = "info") -> None:
    """Log a message with engine-specific styling."""
    styled_engine = f"[engine.{engine}][{engine.upper()}][/]"
    full_message = f"{styled_engine} {message}"
    
    if level == "info":
        logger.info(full_message)
    elif level == "warning":
        logger.warning(full_message)
    elif level == "error":
        logger.error(full_message)
    elif level == "debug":
        logger.debug(full_message)


def log_success(message: str) -> None:
    """Log a success message."""
    console.print(f"[success]✓[/] {message}")
    logger.info(f"✓ {message}")


def log_error(message: str, exc: Exception = None) -> None:
    """Log an error message, optionally with exception."""
    console.print(f"[error]✗[/] {message}")
    if exc:
        logger.error(f"✗ {message}: {str(exc)}", exc_info=True)
    else:
        logger.error(f"✗ {message}")


def log_progress(current: int, total: int, message: str = "") -> None:
    """Log progress indicator."""
    percentage = (current / total) * 100 if total > 0 else 0
    bar_length = 30
    filled = int(bar_length * current / total) if total > 0 else 0
    bar = "█" * filled + "░" * (bar_length - filled)
    
    progress_msg = f"[{bar}] {current}/{total} ({percentage:.1f}%)"
    if message:
        progress_msg += f" - {message}"
    
    console.print(progress_msg)
    logger.info(progress_msg)

