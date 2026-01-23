"""
Gemini Browser Engine for RPA.

Handles automation of gemini.google.com including:
- Prompt submission (rich-textarea handling)
- Response capture with grounding
- Source chip extraction (Google Search grounding)
"""

import time
from typing import Optional, List, Dict
from playwright.sync_api import Page

from .base_engine import BaseEngine, EngineResponse
from utils.logging import logger, log_engine


class GeminiEngine(BaseEngine):
    """
    Gemini browser automation engine.
    
    Works with Google's Gemini web interface.
    Handles the rich-textarea component and grounding sources.
    """
    
    def __init__(self):
        super().__init__("gemini")
        
        # Gemini-specific selectors
        self.extra_selectors = {
            "rich_textarea": "rich-textarea",
            "contenteditable": "[contenteditable='true']",
            "grounding_section": ".grounding-sources, [class*='grounding']",
            "source_chip": ".source-chip, [class*='source-chip'], [class*='citation-chip']",
            "search_query_display": "[class*='search-query']",
            "extension_indicator": "[class*='extension'], [class*='google-search']",
            "login_required": "a[href*='accounts.google.com']",
        }
    
    def send_prompt(self, prompt: str) -> None:
        """
        Send a prompt to Gemini.
        
        Gemini uses a custom rich-textarea component that needs special handling.
        """
        # Check for Google login requirement
        self._check_for_login()
        
        if self.human:
            self.human.think_pause()
        
        # Find and interact with the input
        input_found = self._type_into_gemini_input(prompt)
        
        if not input_found:
            raise RuntimeError("Could not find Gemini input field")
        
        if self.human:
            self.human.micro_pause()
        
        # Submit
        self._submit_prompt()
    
    def _check_for_login(self) -> None:
        """Check if Google login is required."""
        try:
            login_link = self.page.locator(self.extra_selectors["login_required"])
            # Just check for presence, don't necessarily block
            if login_link.count() > 0:
                log_engine(self.engine_name, "Google account may be required", "warning")
        except:
            pass
    
    def _type_into_gemini_input(self, text: str) -> bool:
        """
        Type into Gemini's rich-textarea.
        
        Gemini uses a custom web component that needs special handling.
        """
        # Try rich-textarea first
        try:
            rich_textarea = self.page.locator(self.extra_selectors["rich_textarea"]).first
            if rich_textarea.is_visible(timeout=3000):
                rich_textarea.click()
                time.sleep(0.3)
                
                # Try to fill via contenteditable
                editable = rich_textarea.locator("[contenteditable='true']").first
                if editable.count() > 0:
                    editable.evaluate(
                        "(el, text) => { el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })); }",
                        text
                    )
                    return True
                else:
                    # Direct keyboard input
                    self.page.keyboard.type(text, delay=50)
                    return True
        except Exception as e:
            logger.debug(f"rich-textarea method failed: {e}")
        
        # Fallback to regular textarea
        return self._type_text("prompt_input", text)
    
    def _submit_prompt(self) -> None:
        """Submit the prompt."""
        # Try clicking submit button
        submitted = self._click_element("submit_button")
        
        if not submitted:
            # Try Enter key
            self.page.keyboard.press("Enter")
    
    def wait_for_response(self) -> None:
        """Wait for Gemini to finish responding."""
        timeout = self.timing.response_timeout
        
        # Wait for response container
        response_selector = self.selectors.get("response_container", "")
        try:
            self.page.wait_for_selector(
                response_selector,
                state="visible",
                timeout=30000
            )
        except:
            pass
        
        # Wait for streaming to complete
        self._wait_for_streaming_complete(timeout)
        
        # Wait for grounding sources if present
        self._wait_for_grounding()
        
        # Stabilization delay
        time.sleep(1)
    
    def _wait_for_grounding(self, timeout: int = 5) -> None:
        """Wait for grounding sources to load."""
        grounding_selector = self.extra_selectors["grounding_section"]
        
        try:
            self.page.wait_for_selector(
                grounding_selector,
                state="visible",
                timeout=timeout * 1000
            )
            log_engine(self.engine_name, "Grounding sources detected", "debug")
            time.sleep(1)  # Let chips fully render
        except:
            pass
    
    def extract_response(self) -> EngineResponse:
        """Extract response content from Gemini."""
        response = EngineResponse(engine=self.engine_name)
        
        response_selector = self.selectors.get("response_container", "")
        response_text_selector = self.selectors.get("response_text", "")
        
        try:
            # Get all response containers
            containers = self.page.locator(response_selector).all()
            
            if not containers:
                response.error_message = "No response found"
                return response
            
            # Get the last response
            last_container = containers[-1]
            
            # Extract HTML
            response.response_html = last_container.inner_html()
            
            # Extract text
            text_element = last_container.locator(response_text_selector).first
            if text_element.count() > 0:
                response.response_text = text_element.inner_text()
            else:
                response.response_text = last_container.inner_text()
            
            response.success = True
            
        except Exception as e:
            response.error_message = f"Failed to extract response: {e}"
            return response
        
        # Extract grounding sources
        response.sources = self._extract_grounding_sources()
        response.citation_count = len(response.sources)
        
        return response
    
    def _extract_grounding_sources(self) -> List[Dict[str, str]]:
        """Extract grounding sources (Google Search citations)."""
        sources = []
        
        try:
            # Get source chips
            chip_selector = self.extra_selectors["source_chip"]
            chips = self.page.locator(chip_selector).all()
            
            for chip in chips:
                try:
                    link = chip.locator("a").first
                    if link.count() > 0:
                        url = link.get_attribute("href") or ""
                        title = chip.inner_text().strip()
                        
                        if url and url.startswith("http"):
                            sources.append({
                                "url": url,
                                "title": title,
                                "domain": self._extract_domain(url),
                            })
                except:
                    pass
            
            # Also get regular citation links
            inline_sources = self._extract_sources()
            existing_urls = {s["url"] for s in sources}
            
            for source in inline_sources:
                if source["url"] not in existing_urls:
                    sources.append(source)
            
        except Exception as e:
            logger.debug(f"Error extracting grounding sources: {e}")
        
        return sources
    
    def get_search_queries(self) -> List[str]:
        """
        Get the search queries Gemini ran for grounding.
        
        Returns:
            List of search query strings
        """
        queries = []
        
        try:
            query_selector = self.extra_selectors["search_query_display"]
            query_elements = self.page.locator(query_selector).all()
            
            for el in query_elements:
                text = el.inner_text().strip()
                if text:
                    queries.append(text)
        except:
            pass
        
        return queries

