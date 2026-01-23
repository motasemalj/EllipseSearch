"""
Human-like behavior simulation for RPA automation.

This module provides functions to simulate human-like interactions:
- Variable typing speed
- Random mouse movements
- Natural pauses and delays
- Scroll patterns
"""

import random
import time
import math
from dataclasses import dataclass
from typing import Tuple, Optional
from playwright.sync_api import Page


@dataclass
class HumanBehaviorConfig:
    """Configuration for human-like behavior."""
    
    # Typing - varies per "person" for consistency within session
    base_typing_delay_ms: float = 80  # Base delay between keystrokes
    typing_variance: float = 0.4  # 40% variance
    word_pause_chance: float = 0.1  # 10% chance to pause at word boundaries
    word_pause_range: Tuple[float, float] = (100, 400)  # ms
    typo_chance: float = 0.0  # Set to 0 - we don't want actual typos
    
    # Mouse - more natural movement
    mouse_speed_factor: float = 1.0  # 1.0 = normal speed
    mouse_curve_steps: int = 25  # More points for smoother curve
    mouse_overshoot_chance: float = 0.15  # 15% chance to slightly overshoot
    
    # Scrolling - irregular patterns
    scroll_step_range: Tuple[int, int] = (40, 180)  # pixels per scroll
    scroll_delay_range: Tuple[float, float] = (30, 200)  # ms between scrolls
    scroll_pause_chance: float = 0.2  # 20% chance to pause mid-scroll
    
    # General pauses - more variety
    micro_pause_range: Tuple[float, float] = (50, 250)  # ms
    think_pause_range: Tuple[float, float] = (400, 2000)  # ms
    hesitation_chance: float = 0.1  # 10% chance of random hesitation
    
    # Fatigue simulation (typing slows down over time)
    enable_fatigue: bool = True
    fatigue_factor: float = 0.001  # Increase delay by 0.1% per character


class HumanBehavior:
    """
    Provides human-like behavior simulation for browser automation.
    
    Implements sophisticated patterns that mimic real human behavior:
    - Gaussian-distributed typing delays
    - Mouse movements with bezier curves and occasional overshoots
    - Reading/thinking pauses
    - Fatigue simulation (slowing down over time)
    - Natural hesitation and micro-corrections
    
    Usage:
        human = HumanBehavior(page)
        human.type_like_human(selector, "Hello world")
        human.click_like_human(selector)
    """
    
    def __init__(self, page: Page, config: Optional[HumanBehaviorConfig] = None):
        self.page = page
        self.config = config or HumanBehaviorConfig()
        self._chars_typed = 0  # Track for fatigue simulation
        self._last_mouse_pos: Optional[Tuple[float, float]] = None
    
    def _random_delay(self, min_ms: float, max_ms: float) -> float:
        """Generate a random delay in milliseconds."""
        return random.uniform(min_ms, max_ms)
    
    def _gaussian_delay(self, mean_ms: float, variance: float) -> float:
        """Generate a gaussian-distributed delay."""
        std_dev = mean_ms * variance
        delay = random.gauss(mean_ms, std_dev)
        return max(10, delay)  # Minimum 10ms
    
    def _get_fatigue_factor(self) -> float:
        """Calculate fatigue multiplier based on characters typed."""
        if not self.config.enable_fatigue:
            return 1.0
        return 1.0 + (self._chars_typed * self.config.fatigue_factor)
    
    def micro_pause(self) -> None:
        """A tiny pause, like natural hesitation."""
        delay = self._random_delay(*self.config.micro_pause_range)
        time.sleep(delay / 1000)
    
    def think_pause(self) -> None:
        """A longer pause, like the user is thinking."""
        delay = self._random_delay(*self.config.think_pause_range)
        time.sleep(delay / 1000)
    
    def hesitate(self) -> None:
        """Random hesitation - called occasionally during actions."""
        if random.random() < self.config.hesitation_chance:
            pause = random.uniform(0.2, 0.8)
            time.sleep(pause)
    
    def wait(self, min_sec: float, max_sec: float) -> None:
        """Wait for a random duration between min and max seconds."""
        delay = random.uniform(min_sec, max_sec)
        time.sleep(delay)
    
    def type_like_human(
        self,
        selector: str,
        text: str,
        click_first: bool = True
    ) -> None:
        """
        Type text with human-like delays and patterns.
        
        Features:
        - Gaussian-distributed inter-key delays
        - Longer pauses at word boundaries
        - Fatigue simulation (typing slows over time)
        - Occasional hesitations
        
        Args:
            selector: CSS selector for the input element
            text: Text to type
            click_first: Whether to click the element before typing
        """
        if click_first:
            self.click_like_human(selector)
            self.micro_pause()
        
        element = self.page.locator(selector).first
        
        for i, char in enumerate(text):
            # Calculate base delay with fatigue
            base_delay = self._gaussian_delay(
                self.config.base_typing_delay_ms,
                self.config.typing_variance
            ) * self._get_fatigue_factor()
            
            delay = base_delay
            
            # Add pause at word boundaries
            if char == " " and random.random() < self.config.word_pause_chance:
                extra_pause = self._random_delay(*self.config.word_pause_range)
                delay += extra_pause
            
            # Occasional hesitation mid-typing
            if random.random() < 0.02:  # 2% chance
                hesitation = random.uniform(100, 400)
                delay += hesitation
            
            # Slightly longer delay after punctuation (like thinking about next word)
            if i > 0 and text[i-1] in '.!?,;:':
                delay += random.uniform(100, 300)
            
            # Type the character
            element.type(char, delay=int(delay))
            self._chars_typed += 1
    
    def click_like_human(self, selector: str) -> None:
        """
        Click an element with human-like behavior.
        
        Features:
        - Random click position within element bounds
        - Natural mouse movement with bezier curves
        - Occasional overshoot and correction
        - Pre-click hesitation
        """
        element = self.page.locator(selector).first
        
        # Occasional hesitation before clicking
        self.hesitate()
        
        # Get element bounding box
        box = element.bounding_box()
        if box:
            # Random position within element (avoiding edges, weighted toward center)
            # Use gaussian distribution for more natural click positions
            margin = min(box["width"], box["height"]) * 0.15
            center_x = box["x"] + box["width"] / 2
            center_y = box["y"] + box["height"] / 2
            
            # Gaussian distribution centered on element center
            x = random.gauss(center_x, box["width"] * 0.15)
            y = random.gauss(center_y, box["height"] * 0.15)
            
            # Clamp to element bounds with margin
            x = max(box["x"] + margin, min(box["x"] + box["width"] - margin, x))
            y = max(box["y"] + margin, min(box["y"] + box["height"] - margin, y))
            
            # Move mouse with curve (possibly with overshoot)
            self._move_mouse_with_curve(x, y, may_overshoot=True)
            
            # Micro pause before clicking (humans don't click instantly)
            time.sleep(random.uniform(0.05, 0.15))
            
            # Click
            self.page.mouse.click(x, y)
            
            # Track position
            self._last_mouse_pos = (x, y)
        else:
            # Fallback to regular click
            element.click()
    
    def _move_mouse_with_curve(
        self, 
        target_x: float, 
        target_y: float,
        may_overshoot: bool = False
    ) -> None:
        """
        Move mouse to target with a natural bezier curve.
        
        Features:
        - Smooth bezier curve movement
        - Variable speed (slower at start/end)
        - Occasional overshoot and correction
        - Jitter for more natural appearance
        """
        # Get starting position
        if self._last_mouse_pos:
            start_x, start_y = self._last_mouse_pos
            # Add small random offset to start (hand tremor)
            start_x += random.uniform(-3, 3)
            start_y += random.uniform(-3, 3)
        else:
            # Approximate from viewport
            viewport = self.page.viewport_size or {"width": 1280, "height": 720}
            start_x = viewport["width"] / 2 + random.uniform(-100, 100)
            start_y = viewport["height"] / 2 + random.uniform(-100, 100)
        
        # Calculate distance for speed adjustment
        distance = math.sqrt((target_x - start_x)**2 + (target_y - start_y)**2)
        
        # Adjust steps based on distance (more steps for longer movements)
        base_steps = self.config.mouse_curve_steps
        steps = max(10, int(base_steps * (distance / 300)))
        
        # Generate bezier control points with natural curves
        # Control points create a slightly curved path, not straight line
        angle_offset = random.uniform(-0.3, 0.3)  # Slight curve to one side
        
        control_x1 = start_x + (target_x - start_x) * 0.25 + random.uniform(-40, 40)
        control_y1 = start_y + (target_y - start_y) * 0.1 + random.uniform(-25, 25)
        control_x2 = start_x + (target_x - start_x) * 0.75 + random.uniform(-25, 25)
        control_y2 = start_y + (target_y - start_y) * 0.9 + random.uniform(-15, 15)
        
        # Add curve bias
        perpendicular_x = -(target_y - start_y) * angle_offset * 0.3
        perpendicular_y = (target_x - start_x) * angle_offset * 0.3
        control_x1 += perpendicular_x
        control_y1 += perpendicular_y
        control_x2 += perpendicular_x * 0.5
        control_y2 += perpendicular_y * 0.5
        
        # Move along curve
        for i in range(steps + 1):
            t = i / steps
            
            # Cubic bezier formula
            x = (
                (1 - t) ** 3 * start_x +
                3 * (1 - t) ** 2 * t * control_x1 +
                3 * (1 - t) * t ** 2 * control_x2 +
                t ** 3 * target_x
            )
            y = (
                (1 - t) ** 3 * start_y +
                3 * (1 - t) ** 2 * t * control_y1 +
                3 * (1 - t) * t ** 2 * control_y2 +
                t ** 3 * target_y
            )
            
            # Add micro-jitter (hand tremor) - more prominent at slow parts
            if random.random() < 0.3:
                jitter = 1.5 * (1 - abs(2 * t - 1))  # More jitter in middle
                x += random.uniform(-jitter, jitter)
                y += random.uniform(-jitter, jitter)
            
            self.page.mouse.move(x, y)
            
            # Variable speed - slower at start and end (acceleration curve)
            # Using sine wave for smooth acceleration/deceleration
            speed_factor = 0.5 + 0.5 * math.sin(math.pi * t)
            speed_factor = max(0.3, speed_factor)  # Don't go too slow
            
            base_delay = 4 / self.config.mouse_speed_factor
            delay = base_delay / speed_factor
            
            # Add occasional micro-pause (hand repositioning)
            if random.random() < 0.05:
                delay += random.uniform(20, 50)
            
            time.sleep(delay / 1000)
        
        # Overshoot and correct (happens naturally with humans)
        if may_overshoot and random.random() < self.config.mouse_overshoot_chance:
            # Overshoot by a small amount
            overshoot_x = target_x + random.uniform(5, 15) * (1 if random.random() > 0.5 else -1)
            overshoot_y = target_y + random.uniform(5, 15) * (1 if random.random() > 0.5 else -1)
            
            self.page.mouse.move(overshoot_x, overshoot_y)
            time.sleep(random.uniform(0.05, 0.12))
            
            # Correct back to target
            self.page.mouse.move(target_x, target_y)
            time.sleep(random.uniform(0.02, 0.05))
        
        self._last_mouse_pos = (target_x, target_y)
    
    def scroll_down(self, amount: int = 300) -> None:
        """
        Scroll down with human-like behavior.
        
        Args:
            amount: Approximate amount to scroll in pixels
        """
        scrolled = 0
        while scrolled < amount:
            step = random.randint(*self.config.scroll_step_range)
            step = min(step, amount - scrolled)
            
            self.page.mouse.wheel(0, step)
            scrolled += step
            
            delay = self._random_delay(*self.config.scroll_delay_range)
            time.sleep(delay / 1000)
    
    def scroll_up(self, amount: int = 300) -> None:
        """Scroll up with human-like behavior."""
        scrolled = 0
        while scrolled < amount:
            step = random.randint(*self.config.scroll_step_range)
            step = min(step, amount - scrolled)
            
            self.page.mouse.wheel(0, -step)
            scrolled += step
            
            delay = self._random_delay(*self.config.scroll_delay_range)
            time.sleep(delay / 1000)
    
    def scroll_into_view(self, selector: str) -> None:
        """Scroll an element into view naturally."""
        element = self.page.locator(selector).first
        
        # Check if element is in viewport
        box = element.bounding_box()
        viewport = self.page.viewport_size or {"width": 1280, "height": 720}
        
        if box:
            if box["y"] < 0:
                # Element is above viewport
                self.scroll_up(int(abs(box["y"]) + 100))
            elif box["y"] + box["height"] > viewport["height"]:
                # Element is below viewport
                self.scroll_down(int(box["y"] - viewport["height"] / 2))

