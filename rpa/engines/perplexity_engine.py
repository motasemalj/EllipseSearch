"""
Perplexity Browser Engine for RPA.

Handles automation of perplexity.ai including:
- Prompt submission
- Response capture with numbered citations
- Source card extraction
- Related questions
"""

import time
from typing import Optional, List, Dict
from playwright.sync_api import Page

from .base_engine import BaseEngine, EngineResponse
from utils.logging import logger, log_engine


class PerplexityEngine(BaseEngine):
    """
    Perplexity browser automation engine.
    
    Works with the Perplexity AI web interface.
    Handles inline citations [1], [2] and source cards.
    """
    
    def __init__(self):
        super().__init__("perplexity")
        
        # Perplexity-specific selectors
        self.extra_selectors = {
            "citation_number": "[class*='citation-number'], sup",
            "source_card": "[class*='source-card'], [class*='source-item']",
            "source_favicon": "[class*='favicon']",
            "source_title": "[class*='source-title'], h4",
            "source_domain": "[class*='domain'], [class*='hostname']",
            "source_snippet": "[class*='snippet'], p",
            "related_section": "[class*='related'], [class*='suggestions']",
            "related_question": "[class*='related-question'], button[class*='suggestion']",
            "focus_selector": "[class*='focus-selector']",
            "pro_badge": "[class*='pro-badge'], [class*='premium']",
        }
    
    def send_prompt(self, prompt: str) -> None:
        """Send a prompt to Perplexity."""
        if self.human:
            self.human.think_pause()
        
        # Type the prompt
        success = self._type_text("prompt_input", prompt)
        
        if not success:
            raise RuntimeError("Could not find Perplexity input field")
        
        if self.human:
            self.human.micro_pause()
        
        # Submit
        self._submit_prompt()
    
    def _submit_prompt(self) -> None:
        """Submit the prompt."""
        submitted = self._click_element("submit_button")
        
        if not submitted:
            self.page.keyboard.press("Enter")
    
    def wait_for_response(self) -> None:
        """Wait for Perplexity to finish responding."""
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
        
        # Wait for streaming
        self._wait_for_streaming_complete(timeout)
        
        # Wait for source cards to load
        self._wait_for_sources()
        
        # Stabilization
        time.sleep(1)
    
    def _wait_for_sources(self, timeout: int = 5) -> None:
        """Wait for source cards to appear."""
        source_selector = self.extra_selectors["source_card"]
        
        try:
            self.page.wait_for_selector(
                source_selector,
                state="visible",
                timeout=timeout * 1000
            )
            log_engine(self.engine_name, "Sources loaded", "debug")
        except:
            pass
    
    def extract_response(self) -> EngineResponse:
        """Extract response from Perplexity."""
        response = EngineResponse(engine=self.engine_name)
        
        response_selector = self.selectors.get("response_container", "")
        response_text_selector = self.selectors.get("response_text", "")
        
        try:
            # Get response containers
            containers = self.page.locator(response_selector).all()
            
            if not containers:
                response.error_message = "No response found"
                return response
            
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
        
        # Extract sources with rich data
        response.sources = self._extract_perplexity_sources()
        response.citation_count = len(response.sources)
        
        return response
    
    def _extract_perplexity_sources(self) -> List[Dict[str, str]]:
        """Extract detailed source information from Perplexity."""
        sources = []
        
        try:
            # Get source cards
            card_selector = self.extra_selectors["source_card"]
            cards = self.page.locator(card_selector).all()
            
            for i, card in enumerate(cards):
                try:
                    # Get URL from link
                    link = card.locator("a").first
                    url = link.get_attribute("href") or "" if link.count() > 0 else ""
                    
                    # Get title
                    title_el = card.locator(self.extra_selectors["source_title"]).first
                    title = title_el.inner_text() if title_el.count() > 0 else ""
                    
                    # Get domain
                    domain_el = card.locator(self.extra_selectors["source_domain"]).first
                    domain = domain_el.inner_text() if domain_el.count() > 0 else self._extract_domain(url)
                    
                    # Get snippet
                    snippet_el = card.locator(self.extra_selectors["source_snippet"]).first
                    snippet = snippet_el.inner_text() if snippet_el.count() > 0 else ""
                    
                    if url and url.startswith("http"):
                        sources.append({
                            "url": url,
                            "title": title.strip(),
                            "domain": domain.strip(),
                            "snippet": snippet.strip()[:300],
                            "index": i + 1,
                        })
                except:
                    pass
            
            # Also extract inline citation links
            inline_sources = self._extract_sources()
            existing_urls = {s["url"] for s in sources}
            
            for source in inline_sources:
                if source["url"] not in existing_urls:
                    sources.append(source)
            
        except Exception as e:
            logger.debug(f"Error extracting sources: {e}")
        
        return sources
    
    def get_related_questions(self) -> List[str]:
        """
        Get related/suggested questions from Perplexity.
        
        Returns:
            List of related question strings
        """
        questions = []
        
        try:
            question_selector = self.extra_selectors["related_question"]
            elements = self.page.locator(question_selector).all()
            
            for el in elements:
                text = el.inner_text().strip()
                if text and len(text) > 5:
                    questions.append(text)
        except:
            pass
        
        return questions
    
    def set_focus_mode(self, mode: str) -> bool:
        """
        Set Perplexity focus mode (Web, Academic, etc.)
        
        Args:
            mode: Focus mode name
            
        Returns:
            True if successful
        """
        try:
            focus_selector = self.page.locator(self.extra_selectors["focus_selector"])
            
            if focus_selector.count() > 0 and focus_selector.is_visible():
                focus_selector.click()
                time.sleep(0.3)
                
                # Find and click the mode option
                mode_button = self.page.locator(f"text={mode}").first
                if mode_button.count() > 0:
                    mode_button.click()
                    log_engine(self.engine_name, f"Set focus mode: {mode}")
                    return True
        except:
            pass
        
        return False
    
    def is_pro_user(self) -> bool:
        """Check if current session has Pro features."""
        try:
            pro_badge = self.page.locator(self.extra_selectors["pro_badge"])
            return pro_badge.count() > 0
        except:
            return False

