"""
Base Engine class for AI platform automation.

Provides common functionality for all AI engine implementations.
"""

import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any
from playwright.sync_api import Page

from config import ENGINE_SELECTORS, TimingConfig
from utils.logging import logger, log_engine, log_error
from utils.human_behavior import HumanBehavior


@dataclass
class EngineResponse:
    """Response from an AI engine."""
    
    # Content
    response_html: str = ""
    response_text: str = ""
    
    # Sources/Citations
    sources: List[Dict[str, str]] = field(default_factory=list)
    citation_count: int = 0
    
    # Timing
    response_time_ms: float = 0.0
    
    # Status
    success: bool = False
    error_message: str = ""
    
    # Engine info
    engine: str = ""
    was_streaming: bool = False


class BaseEngine(ABC):
    """
    Abstract base class for AI engine automation.
    
    Subclasses must implement:
    - send_prompt()
    - wait_for_response()
    - extract_response()
    """
    
    def __init__(self, engine_name: str):
        self.engine_name = engine_name
        self.selectors = ENGINE_SELECTORS.get(engine_name, {})
        self.timing = TimingConfig()
        self.human: Optional[HumanBehavior] = None
        self.page: Optional[Page] = None
    
    def setup(self, page: Page) -> None:
        """
        Set up the engine with a page.
        
        Args:
            page: Playwright Page object
        """
        self.page = page
        self.human = HumanBehavior(page)
    
    def run_prompt(self, prompt: str) -> EngineResponse:
        """
        Execute a prompt and get the response.
        
        This is the main entry point for running prompts.
        
        Args:
            prompt: The prompt text to send
            
        Returns:
            EngineResponse with the result
        """
        if not self.page:
            raise RuntimeError("Engine not set up. Call setup(page) first.")
        
        response = EngineResponse(engine=self.engine_name)
        start_time = time.time()
        
        try:
            log_engine(self.engine_name, f"Sending prompt: {prompt[:50]}...")
            
            # Check if we're ready to send
            if not self._is_ready():
                log_engine(self.engine_name, "Waiting for page to be ready...", "warning")
                self._wait_for_ready()
            
            # Send the prompt
            self.send_prompt(prompt)
            
            # Wait for response
            log_engine(self.engine_name, "Waiting for response...")
            self.wait_for_response()
            
            # Extract response
            log_engine(self.engine_name, "Extracting response...")
            response = self.extract_response()
            response.engine = self.engine_name
            if not response.success:
                # Treat any non-empty extraction as a success, even if short
                response.success = bool(response.response_html or response.response_text)
            response.response_time_ms = (time.time() - start_time) * 1000
            
            log_engine(
                self.engine_name,
                f"Response received ({response.response_time_ms:.0f}ms, "
                f"{response.citation_count} citations)"
            )
            
        except Exception as e:
            log_error(f"[{self.engine_name}] Error: {e}")
            response.success = False
            response.error_message = str(e)
            response.response_time_ms = (time.time() - start_time) * 1000
            
            # Take screenshot on error
            self._take_error_screenshot()
        
        return response
    
    @abstractmethod
    def send_prompt(self, prompt: str) -> None:
        """
        Send a prompt to the AI.
        
        Args:
            prompt: The prompt text to send
        """
        pass
    
    @abstractmethod
    def wait_for_response(self) -> None:
        """Wait for the AI to finish generating its response."""
        pass
    
    @abstractmethod
    def extract_response(self) -> EngineResponse:
        """
        Extract the response from the page.
        
        Returns:
            EngineResponse with the extracted content
        """
        pass
    
    def _is_ready(self) -> bool:
        """Check if the page is ready for input."""
        if not self.page:
            return False
        
        # Try to find input element
        input_selectors = self.selectors.get("prompt_input", [])
        if isinstance(input_selectors, str):
            input_selectors = [input_selectors]
        
        for selector in input_selectors:
            try:
                element = self.page.locator(selector).first
                if element.is_visible(timeout=1000):
                    return True
            except:
                pass
        
        return False
    
    def _wait_for_ready(self, timeout: int = 30) -> None:
        """Wait for the page to be ready for input."""
        input_selectors = self.selectors.get("prompt_input", [])
        if isinstance(input_selectors, str):
            input_selectors = [input_selectors]
        
        start = time.time()
        while time.time() - start < timeout:
            for selector in input_selectors:
                try:
                    self.page.wait_for_selector(
                        selector,
                        state="visible",
                        timeout=5000
                    )
                    return
                except:
                    pass
            time.sleep(1)
        
        raise TimeoutError(f"{self.engine_name} input not found after {timeout}s")
    
    def _find_element(self, selector_key: str, timeout: int = 5000) -> Optional[Any]:
        """
        Find an element using the selectors for this engine.
        
        Args:
            selector_key: Key in the selectors dict
            timeout: Timeout in ms
            
        Returns:
            Element or None
        """
        selectors = self.selectors.get(selector_key, [])
        if isinstance(selectors, str):
            selectors = [selectors]
        
        for selector in selectors:
            try:
                element = self.page.locator(selector).first
                if element.is_visible(timeout=timeout):
                    return element
            except:
                pass
        
        return None
    
    def _click_element(self, selector_key: str) -> bool:
        """
        Click an element using human-like behavior.
        
        Returns:
            True if clicked successfully
        """
        selectors = self.selectors.get(selector_key, [])
        if isinstance(selectors, str):
            selectors = [selectors]
        
        for selector in selectors:
            try:
                element = self.page.locator(selector).first
                if element.is_visible(timeout=2000):
                    if self.human:
                        self.human.click_like_human(selector)
                    else:
                        element.click()
                    return True
            except:
                pass
        
        return False
    
    def _type_text(self, selector_key: str, text: str) -> bool:
        """
        Type text into an element using human-like behavior.
        
        Returns:
            True if typed successfully
        """
        selectors = self.selectors.get(selector_key, [])
        if isinstance(selectors, str):
            selectors = [selectors]
        
        for selector in selectors:
            try:
                element = self.page.locator(selector).first
                if element.is_visible(timeout=2000):
                    if self.human:
                        self.human.type_like_human(selector, text)
                    else:
                        element.click()
                        element.fill(text)
                    return True
            except Exception as e:
                logger.debug(f"Failed with selector {selector}: {e}")
        
        return False
    
    def _wait_for_streaming_complete(self, timeout: int = 120) -> bool:
        """
        Wait for streaming response to complete.
        
        Returns:
            True if streaming completed, False if timed out
        """
        streaming_selector = self.selectors.get("streaming_indicator", "")
        if not streaming_selector:
            return True
        
        start = time.time()
        was_streaming = False
        
        while time.time() - start < timeout:
            try:
                streaming = self.page.locator(streaming_selector)
                if streaming.count() > 0 and streaming.first.is_visible():
                    was_streaming = True
                    time.sleep(0.5)
                else:
                    if was_streaming:
                        # Was streaming but stopped - wait a bit more to be sure
                        time.sleep(1)
                        if streaming.count() == 0 or not streaming.first.is_visible():
                            return True
                    else:
                        # Never saw streaming, maybe already done
                        time.sleep(1)
                        return True
            except:
                time.sleep(0.5)
        
        return False
    
    def _extract_sources(self) -> List[Dict[str, str]]:
        """
        Extract source citations from the response.
        
        Returns:
            List of source dictionaries with url, title, snippet
        """
        sources = []
        
        citation_selector = self.selectors.get("citation_link", "")
        if not citation_selector:
            return sources
        
        try:
            links = self.page.locator(citation_selector).all()
            
            for link in links:
                try:
                    url = link.get_attribute("href") or ""
                    title = link.inner_text() or ""
                    
                    if url and url.startswith("http"):
                        sources.append({
                            "url": url,
                            "title": title.strip(),
                            "domain": self._extract_domain(url),
                        })
                except:
                    pass
        except:
            pass
        
        return sources
    
    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc
            if domain.startswith("www."):
                domain = domain[4:]
            return domain
        except:
            return ""
    
    def _take_error_screenshot(self) -> None:
        """Take a screenshot for debugging errors."""
        try:
            from config import config
            import os
            
            if config.error.screenshot_on_error and self.page:
                os.makedirs(config.error.screenshot_dir, exist_ok=True)
                
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"{config.error.screenshot_dir}/{self.engine_name}_{timestamp}.png"
                
                self.page.screenshot(path=filename)
                logger.info(f"Error screenshot saved: {filename}")
        except Exception as e:
            logger.debug(f"Could not take screenshot: {e}")
    
    def check_visibility(
        self,
        response: EngineResponse,
        brand_domain: str,
        brand_name: str = "",
        brand_aliases: List[str] = None
    ) -> bool:
        """
        Check if a brand is visible in the response.
        
        Args:
            response: The engine response
            brand_domain: Primary brand domain
            brand_name: Brand name
            brand_aliases: List of alternative names
            
        Returns:
            True if brand is visible
        """
        if not response.success:
            return False
        
        text_lower = response.response_text.lower()
        html_lower = response.response_html.lower()
        aliases = brand_aliases or []
        
        # Check in text
        checks = [
            brand_domain.lower(),
            brand_name.lower() if brand_name else "",
            brand_domain.replace("www.", "").split(".")[0].lower(),
        ] + [a.lower() for a in aliases]
        
        for check in checks:
            if check and len(check) > 2:
                if check in text_lower or check in html_lower:
                    return True
        
        # Check in sources
        for source in response.sources:
            source_domain = source.get("domain", "").lower()
            if brand_domain.lower() in source_domain:
                return True
        
        return False
    
    def start_new_chat(self) -> bool:
        """
        Start a new conversation/chat.
        
        Returns:
            True if successful
        """
        return self._click_element("new_chat_button")

