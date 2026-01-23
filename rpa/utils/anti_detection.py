"""
Advanced Anti-Detection System for RPA Automation.

Implements best practices to avoid bot detection and rate limiting:
- Intelligent request queuing with natural spacing
- Human-like activity simulation
- Session fingerprint consistency
- Adaptive rate limiting with backoff
- Time-aware behavior patterns
- Request deduplication to prevent spam signals

OpenAI and other AI platforms use sophisticated detection including:
- Request frequency analysis
- Behavioral biometrics (typing, mouse patterns)
- Session anomaly detection
- Browser fingerprinting
- Time-of-day patterns

This module helps maintain a natural, human-like profile.
"""

import random
import time
import math
import hashlib
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from threading import Lock
from collections import deque
import json

from utils.logging import logger


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""
    
    # Base delays
    min_delay_seconds: float = 8.0      # Minimum delay between requests
    max_delay_seconds: float = 20.0     # Maximum delay between requests
    
    # Burst protection
    burst_window_seconds: int = 300     # 5 minute window
    max_requests_per_window: int = 8    # Max requests per window
    
    # Backoff settings
    enable_backoff: bool = True
    backoff_base: float = 1.5           # Exponential backoff multiplier
    max_backoff_minutes: int = 10       # Maximum backoff time
    
    # Natural patterns
    add_thinking_pauses: bool = True    # Add "reading" pauses
    vary_session_patterns: bool = True  # Vary behavior within session
    
    # Time of day awareness
    reduce_night_activity: bool = True  # Slow down during "unusual" hours
    night_hours: tuple = (1, 6)         # 1 AM to 6 AM


@dataclass
class SessionProfile:
    """Maintains consistent session profile to avoid fingerprint anomalies."""
    
    session_id: str = ""
    started_at: datetime = field(default_factory=datetime.now)
    
    # Behavioral profile (consistent within session)
    typing_speed_factor: float = 1.0        # 0.8 - 1.2
    reading_speed_factor: float = 1.0       # How fast user "reads"
    mouse_precision: float = 1.0            # Click accuracy
    scroll_behavior: str = "moderate"       # slow/moderate/fast
    
    # Activity tracking
    requests_count: int = 0
    last_request_time: Optional[datetime] = None
    consecutive_errors: int = 0
    
    def __post_init__(self):
        if not self.session_id:
            self.session_id = hashlib.md5(
                str(datetime.now().timestamp()).encode()
            ).hexdigest()[:12]
        
        # Generate consistent but varied profile
        self.typing_speed_factor = random.uniform(0.85, 1.15)
        self.reading_speed_factor = random.uniform(0.8, 1.2)
        self.mouse_precision = random.uniform(0.9, 1.0)
        self.scroll_behavior = random.choice(["slow", "moderate", "moderate", "fast"])


class RequestQueue:
    """
    Intelligent request queue with natural spacing.
    
    Ensures requests are spaced appropriately to avoid:
    - Burst detection
    - Unnaturally consistent timing
    - Rate limit triggers
    """
    
    def __init__(self, config: RateLimitConfig = None):
        self.config = config or RateLimitConfig()
        self.lock = Lock()
        
        # Request history for rate analysis
        self.request_history: deque = deque(maxlen=100)
        self.last_request_time: Optional[float] = None
        self.current_backoff_level = 0
        
        # Per-engine tracking (some engines more sensitive)
        self.engine_last_request: Dict[str, float] = {}
        self.engine_request_counts: Dict[str, int] = {}
    
    def calculate_delay(self, engine: str = "default") -> float:
        """
        Calculate optimal delay before next request.
        
        Considers:
        - Base delay with jitter
        - Recent request frequency
        - Time of day
        - Backoff level
        - Engine-specific limits
        """
        with self.lock:
            now = time.time()
            
            # Base delay with gaussian jitter (more natural than uniform)
            base_delay = random.gauss(
                (self.config.min_delay_seconds + self.config.max_delay_seconds) / 2,
                (self.config.max_delay_seconds - self.config.min_delay_seconds) / 4
            )
            base_delay = max(self.config.min_delay_seconds, 
                           min(self.config.max_delay_seconds, base_delay))
            
            # Apply backoff if needed
            if self.config.enable_backoff and self.current_backoff_level > 0:
                backoff_multiplier = self.config.backoff_base ** self.current_backoff_level
                max_backoff = self.config.max_backoff_minutes * 60
                backoff_delay = min(base_delay * backoff_multiplier, max_backoff)
                base_delay = backoff_delay
                logger.debug(f"Backoff level {self.current_backoff_level}: delay = {base_delay:.1f}s")
            
            # Check burst window
            recent_requests = self._count_recent_requests(
                self.config.burst_window_seconds
            )
            if recent_requests >= self.config.max_requests_per_window:
                # Near burst limit - add significant delay
                burst_delay = random.uniform(30, 60)
                base_delay = max(base_delay, burst_delay)
                logger.warning(f"Near burst limit ({recent_requests} requests) - adding {burst_delay:.0f}s delay")
            
            # Time of day adjustment
            if self.config.reduce_night_activity:
                hour = datetime.now().hour
                if self.config.night_hours[0] <= hour < self.config.night_hours[1]:
                    # Night time - double delays
                    base_delay *= 2
                    logger.debug("Night hours - doubling delay")
            
            # Engine-specific cooldown
            engine_last = self.engine_last_request.get(engine, 0)
            engine_cooldown = 15  # 15 seconds minimum between same-engine requests
            time_since_engine = now - engine_last
            if time_since_engine < engine_cooldown:
                additional = engine_cooldown - time_since_engine
                base_delay = max(base_delay, additional + random.uniform(2, 5))
            
            # Add "human thinking" variance
            if self.config.add_thinking_pauses:
                # 20% chance of longer "thinking" pause
                if random.random() < 0.2:
                    thinking_pause = random.uniform(5, 15)
                    base_delay += thinking_pause
                    logger.debug(f"Adding thinking pause: +{thinking_pause:.1f}s")
            
            return base_delay
    
    def _count_recent_requests(self, window_seconds: int) -> int:
        """Count requests in recent time window."""
        cutoff = time.time() - window_seconds
        return sum(1 for t in self.request_history if t > cutoff)
    
    def record_request(self, engine: str = "default", success: bool = True):
        """Record a completed request for rate tracking."""
        with self.lock:
            now = time.time()
            self.request_history.append(now)
            self.last_request_time = now
            self.engine_last_request[engine] = now
            self.engine_request_counts[engine] = self.engine_request_counts.get(engine, 0) + 1
            
            # Update backoff level
            if success:
                # Successful - gradually reduce backoff
                self.current_backoff_level = max(0, self.current_backoff_level - 0.5)
            else:
                # Failed - increase backoff
                self.current_backoff_level = min(5, self.current_backoff_level + 1)
    
    def wait_for_slot(self, engine: str = "default") -> float:
        """
        Wait for appropriate time slot, then return the actual wait time.
        
        This is the main entry point - call before each request.
        """
        delay = self.calculate_delay(engine)
        
        if delay > 0:
            # Add micro-variations during wait to appear more natural
            remaining = delay
            while remaining > 0:
                chunk = min(remaining, random.uniform(1.0, 3.0))
                time.sleep(chunk)
                remaining -= chunk
        
        return delay


class AntiDetectionManager:
    """
    Main anti-detection manager that coordinates all evasion techniques.
    
    Usage:
        anti_detect = AntiDetectionManager()
        
        for prompt in prompts:
            # Wait for natural timing
            anti_detect.pre_request_routine(page, engine)
            
            # Do your automation
            result = engine.run_prompt(prompt)
            
            # Post-request behavior
            anti_detect.post_request_routine(page, success=result.success)
    """
    
    def __init__(
        self,
        rate_config: RateLimitConfig = None,
        session_profile: SessionProfile = None
    ):
        self.rate_config = rate_config or RateLimitConfig()
        self.session = session_profile or SessionProfile()
        self.request_queue = RequestQueue(self.rate_config)
        
        # Track activity patterns
        self.prompts_this_session = 0
        self.session_start = datetime.now()
        
        logger.info(f"Anti-detection initialized (session: {self.session.session_id})")
        logger.debug(f"Profile: typing={self.session.typing_speed_factor:.2f}x, "
                    f"reading={self.session.reading_speed_factor:.2f}x")
    
    def pre_request_routine(self, page, engine: str = "default") -> float:
        """
        Execute pre-request routine to appear natural.
        
        Returns:
            Actual delay in seconds
        """
        # 1. Wait for appropriate time slot
        delay = self.request_queue.wait_for_slot(engine)
        
        # 2. Simulate natural "finding the right tab" behavior
        if random.random() < 0.3:  # 30% chance
            self._simulate_tab_focus_delay()
        
        # 3. Maybe do some "idle" activity on the page
        if page and random.random() < 0.25:  # 25% chance
            self._simulate_idle_behavior(page)
        
        self.prompts_this_session += 1
        self.session.requests_count += 1
        
        return delay
    
    def post_request_routine(
        self, 
        page, 
        engine: str = "default",
        success: bool = True,
        response_length: int = 0
    ):
        """
        Execute post-request routine (reading response, etc.)
        
        Args:
            page: Playwright page
            engine: Engine name
            success: Whether request succeeded
            response_length: Length of response (for reading time calc)
        """
        # Record for rate limiting
        self.request_queue.record_request(engine, success)
        self.session.last_request_time = datetime.now()
        
        if not success:
            self.session.consecutive_errors += 1
            
            # If multiple consecutive errors, take a break
            if self.session.consecutive_errors >= 3:
                break_time = random.uniform(30, 60)
                logger.warning(f"Multiple errors - taking {break_time:.0f}s break")
                time.sleep(break_time)
        else:
            self.session.consecutive_errors = 0
        
        # Simulate "reading" the response
        if success and response_length > 0 and page:
            self._simulate_reading_response(page, response_length)
    
    def _simulate_tab_focus_delay(self):
        """Simulate delay of user switching to/focusing the tab."""
        delay = random.uniform(0.5, 2.0)
        time.sleep(delay)
    
    def _simulate_idle_behavior(self, page):
        """Simulate brief idle behavior (scrolling, mouse movement)."""
        try:
            viewport = page.viewport_size or {"width": 1280, "height": 720}
            
            behavior = random.choice(["scroll", "mouse_move", "nothing"])
            
            if behavior == "scroll":
                # Small scroll up/down
                scroll_amount = random.randint(-100, 100)
                page.mouse.wheel(0, scroll_amount)
                time.sleep(random.uniform(0.2, 0.5))
                
            elif behavior == "mouse_move":
                # Move mouse slightly
                x = random.randint(100, viewport["width"] - 100)
                y = random.randint(100, viewport["height"] - 100)
                page.mouse.move(x, y)
                time.sleep(random.uniform(0.1, 0.3))
        except:
            pass  # Ignore errors in idle behavior
    
    def _simulate_reading_response(self, page, response_length: int):
        """Simulate user reading the AI response."""
        # Estimate reading time (average 200 words/min = 3.3 chars/second)
        # Adjusted by user's reading speed factor
        chars_per_second = 3.3 * self.session.reading_speed_factor
        
        # Calculate reading time with some variance
        reading_time = (response_length / chars_per_second) * random.uniform(0.5, 1.5)
        
        # Cap it to reasonable bounds
        reading_time = min(max(reading_time, 1), 30)
        
        logger.debug(f"Simulating reading: {reading_time:.1f}s for {response_length} chars")
        
        # During "reading", occasionally scroll
        elapsed = 0
        while elapsed < reading_time:
            chunk = min(reading_time - elapsed, random.uniform(2, 5))
            time.sleep(chunk)
            elapsed += chunk
            
            # 40% chance to scroll while reading
            if random.random() < 0.4:
                try:
                    page.mouse.wheel(0, random.randint(50, 150))
                except:
                    pass
    
    def should_take_break(self) -> Optional[float]:
        """
        Check if we should take a longer break.
        
        Returns:
            Break duration in seconds, or None if no break needed
        """
        # Take break after many prompts
        if self.prompts_this_session > 0 and self.prompts_this_session % 10 == 0:
            break_duration = random.uniform(60, 120)
            logger.info(f"Session break after {self.prompts_this_session} prompts: {break_duration:.0f}s")
            return break_duration
        
        # Take break based on session duration
        session_duration = (datetime.now() - self.session_start).total_seconds()
        if session_duration > 1800 and random.random() < 0.1:  # 30+ minutes, 10% chance
            break_duration = random.uniform(30, 90)
            logger.info(f"Random session break: {break_duration:.0f}s")
            return break_duration
        
        return None
    
    def get_typing_delay(self, base_ms: float = 80) -> float:
        """Get typing delay adjusted for session profile."""
        return base_ms / self.session.typing_speed_factor
    
    def reset_session(self):
        """Reset session profile (e.g., at start of new batch)."""
        self.session = SessionProfile()
        self.prompts_this_session = 0
        self.session_start = datetime.now()
        self.request_queue.current_backoff_level = 0
        logger.info(f"Session reset (new ID: {self.session.session_id})")


class RequestDeduplicator:
    """
    Prevents duplicate/similar requests that could trigger spam detection.
    
    OpenAI monitors for:
    - Identical prompts in short succession
    - Very similar prompts (slight variations)
    - Repetitive patterns
    """
    
    def __init__(self, similarity_threshold: float = 0.85, window_minutes: int = 60):
        self.recent_prompts: deque = deque(maxlen=50)
        self.similarity_threshold = similarity_threshold
        self.window_minutes = window_minutes
    
    def _normalize_prompt(self, prompt: str) -> str:
        """Normalize prompt for comparison."""
        return " ".join(prompt.lower().split())
    
    def _calculate_similarity(self, a: str, b: str) -> float:
        """Calculate Jaccard similarity between two prompts."""
        words_a = set(a.split())
        words_b = set(b.split())
        
        if not words_a or not words_b:
            return 0.0
        
        intersection = words_a & words_b
        union = words_a | words_b
        
        return len(intersection) / len(union)
    
    def check_and_record(self, prompt: str, engine: str) -> dict:
        """
        Check if prompt is too similar to recent ones.
        
        Returns:
            {
                "is_duplicate": bool,
                "is_similar": bool,
                "similarity_score": float,
                "recommendation": str
            }
        """
        normalized = self._normalize_prompt(prompt)
        now = datetime.now()
        cutoff = now - timedelta(minutes=self.window_minutes)
        
        result = {
            "is_duplicate": False,
            "is_similar": False,
            "similarity_score": 0.0,
            "recommendation": "proceed"
        }
        
        # Check against recent prompts
        for entry in self.recent_prompts:
            if entry["time"] < cutoff:
                continue
            
            if entry["engine"] != engine:
                continue
            
            # Check exact duplicate
            if entry["normalized"] == normalized:
                result["is_duplicate"] = True
                result["similarity_score"] = 1.0
                result["recommendation"] = "skip_or_delay"
                logger.warning(f"Duplicate prompt detected for {engine}")
                break
            
            # Check similarity
            similarity = self._calculate_similarity(entry["normalized"], normalized)
            if similarity > result["similarity_score"]:
                result["similarity_score"] = similarity
            
            if similarity > self.similarity_threshold:
                result["is_similar"] = True
                result["recommendation"] = "add_delay"
                logger.warning(f"Similar prompt detected ({similarity:.0%} similar)")
        
        # Record this prompt
        self.recent_prompts.append({
            "normalized": normalized,
            "engine": engine,
            "time": now
        })
        
        return result


# Convenience functions

def create_anti_detection_system(
    min_delay: float = 8.0,
    max_delay: float = 20.0,
    enable_night_mode: bool = True
) -> AntiDetectionManager:
    """
    Create an anti-detection system with standard settings.
    
    Args:
        min_delay: Minimum seconds between requests
        max_delay: Maximum seconds between requests
        enable_night_mode: Whether to slow down at night
        
    Returns:
        Configured AntiDetectionManager
    """
    config = RateLimitConfig(
        min_delay_seconds=min_delay,
        max_delay_seconds=max_delay,
        reduce_night_activity=enable_night_mode,
    )
    
    return AntiDetectionManager(rate_config=config)


def calculate_safe_batch_size(
    total_prompts: int,
    engines: List[str],
    max_duration_hours: float = 2.0
) -> int:
    """
    Calculate safe batch size to avoid detection.
    
    Args:
        total_prompts: Total prompts to process
        engines: List of engines to use
        max_duration_hours: Maximum acceptable duration
        
    Returns:
        Recommended batch size
    """
    # Average 30 seconds per prompt (including delays)
    prompts_per_hour = 120
    
    max_prompts = int(max_duration_hours * prompts_per_hour)
    
    # Divide by number of engines
    prompts_per_engine = max_prompts // max(len(engines), 1)
    
    # Add safety margin
    safe_size = int(prompts_per_engine * 0.8)
    
    return min(total_prompts, safe_size)

