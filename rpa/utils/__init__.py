"""
RPA Utility modules
"""

from .logging import logger, setup_logging
from .output import OutputHandler

# NOTE: Avoid importing Playwright-dependent modules at package import time.
# This keeps lightweight utilities (e.g. text parsing) usable in environments
# where Playwright isn't installed (tests, CI, etc.).
try:
    from .human_behavior import HumanBehavior  # noqa: F401
except Exception:  # pragma: no cover
    HumanBehavior = None  # type: ignore

__all__ = ["logger", "setup_logging", "HumanBehavior", "OutputHandler"]

