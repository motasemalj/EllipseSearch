"""
ChatGPT Browser Engine for RPA.

Handles automation of chatgpt.com including:
- Prompt submission
- Response capture with streaming support
- Source/citation extraction (ONLY from current response)
- Web search results

ENHANCED (Jan 2026):
- More robust response extraction with multiple fallback strategies
- Better DOM selectors for current ChatGPT UI
- Improved wait logic with content validation
- Screenshot debugging on extraction failure
"""

import time
import re
from typing import Optional, List, Dict
from playwright.sync_api import Page, Locator

from .base_engine import BaseEngine, EngineResponse
from config import ENGINE_URLS
from utils.logging import logger, log_engine


class ChatGPTEngine(BaseEngine):
    """
    ChatGPT browser automation engine.
    
    Works with the authenticated ChatGPT web interface.
    Supports GPT-4 with web search capabilities.
    
    IMPORTANT: This engine tracks the response count to ensure we only
    extract data from the CURRENT prompt, not previous ones in the conversation.
    
    ENHANCED: Uses multiple extraction strategies with fallbacks for robust
    response capture across ChatGPT UI updates.
    """
    
    def __init__(self):
        super().__init__("chatgpt")
        
        # Track response count to isolate current response
        self._response_count_before_prompt = 0
        self._last_response_container: Optional[Locator] = None
        
        # ENHANCED: Multiple response container selectors (ordered by reliability)
        self._response_container_selectors = [
            # Most reliable - data attribute based
            "[data-message-author-role='assistant']",
            # Article-based containers (newer UI)
            "article[data-testid*='conversation-turn']:has([data-message-author-role='assistant'])",
            "div[data-testid*='conversation-turn']:has([data-message-author-role='assistant'])",
            # Class-based fallbacks
            "[class*='agent-turn']",
            "[class*='assistant-message']",
        ]
        
        # ENHANCED: Multiple prose/content selectors for extraction
        self._prose_content_selectors = [
            ".markdown.prose",
            "[class*='markdown'][class*='prose']",
            ".prose",
            ".markdown",
            "[class*='markdown']",
            "[class*='response-content']",
            "[class*='message-content']",
        ]
        
        # Additional ChatGPT-specific selectors
        self.extra_selectors = {
            "model_selector": "[class*='model-selector'], [data-testid='model-switcher']",
            "web_search_toggle": "[class*='web-search-toggle']",
            "sources_panel": "[class*='sources'], [class*='webSearchResults'], [class*='citation']",
            "source_card": "[class*='source-card'], [class*='WebSearchResult'], [data-testid*='source'], [class*='citation-card']",
            "login_required": "[data-testid='login-button'], a[href*='/auth']",
            "new_chat_button": "[data-testid='new-chat-button'], [data-testid='create-new-chat-button'], a[href='/'], button:has-text('New chat'), [aria-label*='New chat']",
            # Selector for sources WITHIN a response container
            "inline_citation": "a[href^='http']:not([href*='openai.com']):not([href*='chatgpt.com'])",
        }
    
    def send_prompt(self, prompt: str) -> None:
        """
        Send a prompt to ChatGPT.
        
        Uses human-like typing and submission behavior.
        Tracks response count to isolate this prompt's response.
        """
        # Check for login wall
        self._check_for_login()
        
        # Count existing responses BEFORE we send the prompt
        # This lets us identify which response is ours
        self._count_existing_responses()
        
        # Human-like pre-type pause
        if self.human:
            self.human.think_pause()
        
        # Type the prompt
        success = self._type_text("prompt_input", prompt)
        if not success:
            raise RuntimeError("Could not find ChatGPT input field")
        
        # Small pause before submitting
        if self.human:
            self.human.micro_pause()
        
        # Submit
        self._submit_prompt()
    
    def _count_existing_responses(self) -> None:
        """Count existing assistant responses before sending new prompt.
        
        ENHANCED: Uses multiple selectors for reliability.
        """
        max_count = 0
        
        # Try primary selector from config
        response_selector = self.selectors.get("response_container", "")
        if response_selector:
            try:
                containers = self.page.locator(response_selector).all()
                max_count = max(max_count, len(containers))
            except:
                pass
        
        # Also try enhanced selectors
        for selector in self._response_container_selectors:
            try:
                containers = self.page.locator(selector).all()
                max_count = max(max_count, len(containers))
            except:
                continue
        
        self._response_count_before_prompt = max_count
        log_engine(
            self.engine_name, 
            f"Existing responses in conversation: {self._response_count_before_prompt}",
            "debug"
        )
    
    def _check_for_login(self) -> None:
        """Check if login is required and raise error if so."""
        try:
            login_button = self.page.locator(self.extra_selectors["login_required"])
            if login_button.count() > 0 and login_button.first.is_visible(timeout=1000):
                raise RuntimeError(
                    "ChatGPT requires login. Please log in to ChatGPT in your browser first, "
                    "then run this script again."
                )
        except RuntimeError:
            raise
        except:
            pass  # No login wall detected
    
    def _submit_prompt(self) -> None:
        """Submit the prompt with button click or Enter key."""
        # Try clicking submit button first
        submitted = self._click_element("submit_button")
        
        if not submitted:
            # Fallback to Enter key
            log_engine(self.engine_name, "Using Enter key to submit", "debug")
            self.page.keyboard.press("Enter")
    
    def wait_for_response(self) -> None:
        """
        Wait for ChatGPT to finish generating response.
        
        Handles streaming detection and web search delays.
        
        ENHANCED: More robust detection with multiple selector strategies.
        """
        timeout = self.timing.response_timeout
        start = time.time()
        
        # Combine primary selector with enhanced selectors
        all_selectors = [self.selectors.get("response_container", "")] + self._response_container_selectors
        # Remove empty strings and duplicates
        all_selectors = list(dict.fromkeys([s for s in all_selectors if s]))
        
        # Wait until we have more responses than before
        log_engine(self.engine_name, "Waiting for new response...", "debug")
        response_found = False
        detected_selector = None
        
        while time.time() - start < 60:  # Extended timeout for response detection
            for selector in all_selectors:
                try:
                    containers = self.page.locator(selector).all()
                    if len(containers) > self._response_count_before_prompt:
                        log_engine(self.engine_name, f"New response detected: {len(containers)} containers (was {self._response_count_before_prompt})", "debug")
                        response_found = True
                        detected_selector = selector
                        break
                except:
                    continue
            
            if response_found:
                break
            
            time.sleep(0.5)
        
        if not response_found:
            log_engine(self.engine_name, "Warning: Could not detect new response, will try extraction anyway", "warning")
            # Take a screenshot for debugging
            self._take_debug_screenshot("no_response_detected")
        
        # Wait for streaming to complete - look for various indicators
        streaming_complete = self._wait_for_streaming_complete(timeout)
        
        # Additional check: wait for "stop generating" button to disappear
        stop_button_selectors = [
            "button[aria-label*='Stop']",
            "[data-testid='stop-button']",
            "button:has(svg[class*='stop'])",
            "[aria-label='Stop generating']",
        ]
        
        for stop_selector in stop_button_selectors:
            try:
                stop_button = self.page.locator(stop_selector)
                if stop_button.count() > 0 and stop_button.first.is_visible(timeout=500):
                    log_engine(self.engine_name, "Waiting for stop button to disappear...", "debug")
                    stop_button.first.wait_for(state="hidden", timeout=60000)
                    break
            except:
                pass
        
        # Wait for any loading/thinking indicators to disappear
        loading_indicators = [
            "[class*='result-streaming']",
            "[class*='animate-pulse']",
            "[class*='thinking']",
            "[class*='loading']",
            "[class*='typing']",
            "svg.animate-spin",
            "[data-state='streaming']",
        ]
        
        for indicator in loading_indicators:
            try:
                elem = self.page.locator(indicator)
                if elem.count() > 0 and elem.first.is_visible(timeout=500):
                    log_engine(self.engine_name, f"Waiting for indicator to disappear: {indicator}", "debug")
                    elem.first.wait_for(state="hidden", timeout=30000)
            except:
                pass
        
        if not streaming_complete:
            log_engine(self.engine_name, "Response may still be streaming", "warning")
        
        # Check for web search sources in the LATEST response
        self._wait_for_sources_in_latest()

        # Wait for response content to stabilize so extraction doesn't grab empty containers
        # ENHANCED: Longer minimum wait and more thorough check
        self._wait_for_response_content(min_chars=50, timeout=20)
        
        # Final stabilization delay - critical for DOM to fully settle
        time.sleep(3)
    
    def _wait_for_sources_in_latest(self, timeout: int = 8) -> None:
        """Wait for web search sources to load in the latest response.
        
        ENHANCED: Uses multiple selectors and longer timeout for sources.
        """
        sources_selector = self.extra_selectors["sources_panel"]
        
        # Find the latest container using all selectors
        last_container = None
        
        all_selectors = [self.selectors.get("response_container", "")] + self._response_container_selectors
        all_selectors = list(dict.fromkeys([s for s in all_selectors if s]))
        
        for selector in all_selectors:
            try:
                containers = self.page.locator(selector).all()
                if len(containers) > self._response_count_before_prompt:
                    last_container = containers[-1]
                    break
                elif len(containers) > 0:
                    last_container = containers[-1]
            except:
                continue
        
        if not last_container:
            return
        
        # Look for sources panel within the last container
        try:
            sources_in_response = last_container.locator(sources_selector)
            sources_in_response.wait_for(state="visible", timeout=timeout * 1000)
            log_engine(self.engine_name, "Web search sources detected in current response", "debug")
            # Wait for sources to fully load
            time.sleep(2)
        except:
            # No sources panel in this response - that's okay
            # ChatGPT doesn't always use web search
            pass
    
    def extract_response(self) -> EngineResponse:
        """
        Extract the response content from ChatGPT.
        
        Gets ONLY the latest assistant message (the one we just triggered),
        not previous messages in the conversation.
        
        ENHANCED: Uses multiple extraction strategies with fallbacks:
        1. Container-based extraction (finds assistant message container)
        2. Prose/markdown content extraction
        3. Direct page evaluation for response text
        4. Screenshot debugging on failure
        """
        response = EngineResponse(engine=self.engine_name)
        
        # Strategy 1: Try to find the response container
        last_container = self._find_latest_response_container()
        
        if last_container:
            self._last_response_container = last_container
            
            # Extract from container with multiple methods
            response = self._extract_from_container(last_container, response)
            
            if response.success:
                # Extract sources ONLY from the current response container
                response.sources = self._extract_sources_from_container(last_container)
                response.citation_count = len(response.sources)
                
                log_engine(
                    self.engine_name, 
                    f"✓ Extracted: {len(response.response_html)} chars HTML, {len(response.response_text)} chars text, {response.citation_count} sources",
                    "info"
                )
                return response
        
        # Strategy 2: Direct page evaluation (fallback)
        log_engine(self.engine_name, "Container extraction failed, trying page-level extraction", "warning")
        response = self._extract_via_page_evaluation(response)
        
        if response.success:
            log_engine(
                self.engine_name, 
                f"✓ Extracted via page eval: {len(response.response_text)} chars text",
                "info"
            )
            # Still try to get sources if we found a container
            if self._last_response_container:
                response.sources = self._extract_sources_from_container(self._last_response_container)
                response.citation_count = len(response.sources)
            return response
        
        # Strategy 3: Last resort - wait more and retry once
        log_engine(self.engine_name, "All extraction methods failed, waiting and retrying...", "warning")
        time.sleep(5)
        
        last_container = self._find_latest_response_container()
        if last_container:
            response = self._extract_from_container(last_container, response)
            if response.success:
                response.sources = self._extract_sources_from_container(last_container)
                response.citation_count = len(response.sources)
                log_engine(self.engine_name, f"✓ Retry successful: {len(response.response_text)} chars", "info")
                return response
        
        # Failed - take screenshot for debugging
        self._take_debug_screenshot("extraction_failed")
        
        if not response.error_message:
            response.error_message = "All extraction strategies failed"
        
        log_engine(self.engine_name, f"✗ Extraction failed: {response.error_message}", "error")
        return response
    
    def _find_latest_response_container(self) -> Optional[Locator]:
        """
        Find the latest assistant response container.
        
        Uses multiple selectors and validates that we found a new response.
        """
        # Combine all selectors
        all_selectors = [self.selectors.get("response_container", "")] + self._response_container_selectors
        all_selectors = list(dict.fromkeys([s for s in all_selectors if s]))
        
        best_container = None
        best_container_count = 0
        
        for selector in all_selectors:
            try:
                containers = self.page.locator(selector).all()
                
                if len(containers) > self._response_count_before_prompt:
                    # Found new responses
                    new_responses = containers[self._response_count_before_prompt:]
                    last_container = new_responses[-1]
                    
                    # Validate container has content
                    try:
                        text_len = len(last_container.inner_text() or "")
                        if text_len > best_container_count:
                            best_container = last_container
                            best_container_count = text_len
                            log_engine(
                                self.engine_name, 
                                f"Found container via '{selector[:50]}...' with {text_len} chars",
                                "debug"
                            )
                    except:
                        # If we can't get text length, still prefer newer containers
                        if best_container is None:
                            best_container = last_container
                            
                elif len(containers) > 0 and best_container is None:
                    # Fallback: use last container even if tracking failed
                    last_container = containers[-1]
                    try:
                        text_len = len(last_container.inner_text() or "")
                        if text_len > 50:
                            best_container = last_container
                            best_container_count = text_len
                            log_engine(
                                self.engine_name, 
                                f"Fallback: using last container with {text_len} chars",
                                "warning"
                            )
                    except:
                        pass
            except Exception as e:
                log_engine(self.engine_name, f"Selector '{selector[:30]}...' failed: {e}", "debug")
                continue
        
        return best_container
    
    def _extract_from_container(self, container: Locator, response: EngineResponse) -> EngineResponse:
        """
        Extract content from a response container using multiple methods.
        """
        html_content = ""
        text_content = ""
        
        # Method 1: Direct inner_html/inner_text
        try:
            html_content = container.inner_html()
            text_content = container.inner_text()
            log_engine(self.engine_name, f"Direct extraction: HTML={len(html_content)}, Text={len(text_content)}", "debug")
        except Exception as e:
            log_engine(self.engine_name, f"Direct extraction failed: {e}", "debug")
        
        # Method 2: If short, try finding prose/markdown within container
        if len(html_content) < 100 or len(text_content) < 50:
            for prose_selector in self._prose_content_selectors:
                try:
                    prose_elem = container.locator(prose_selector).first
                    if prose_elem.count() > 0:
                        prose_html = prose_elem.inner_html()
                        prose_text = prose_elem.inner_text()
                        
                        if len(prose_html) > len(html_content):
                            html_content = prose_html
                            log_engine(self.engine_name, f"Prose extraction via '{prose_selector}': {len(prose_html)} chars", "debug")
                        
                        if len(prose_text) > len(text_content):
                            text_content = prose_text
                except:
                    continue
        
        # Method 3: JavaScript evaluation fallback
        if len(text_content) < 50:
            try:
                evaluated_text = container.evaluate("""el => {
                    // Find the deepest element with substantial text
                    function getDeepestText(elem) {
                        if (!elem) return '';
                        
                        // Check for markdown/prose containers first
                        const proseElem = elem.querySelector('.markdown, .prose, [class*="markdown"]');
                        if (proseElem) {
                            return proseElem.innerText || proseElem.textContent || '';
                        }
                        
                        return elem.innerText || elem.textContent || '';
                    }
                    return getDeepestText(el);
                }""")
                
                if evaluated_text and len(evaluated_text) > len(text_content):
                    text_content = evaluated_text
                    log_engine(self.engine_name, f"JS evaluation: {len(evaluated_text)} chars", "debug")
            except Exception as e:
                log_engine(self.engine_name, f"JS evaluation failed: {e}", "debug")
        
        # Method 4: Get outerHTML via evaluation
        if len(html_content) < 100:
            try:
                outer_html = container.evaluate("el => el.outerHTML")
                if outer_html and len(outer_html) > len(html_content):
                    html_content = outer_html
            except:
                pass
        
        # Clean up text content
        if text_content:
            # Remove excessive whitespace
            text_content = re.sub(r'\s+', ' ', text_content).strip()
            # Remove common UI artifacts
            text_content = re.sub(r'^(Copy|Share|Like|Dislike|Regenerate)\s*', '', text_content, flags=re.IGNORECASE)
        
        # If we have HTML but no text, extract text from HTML
        if len(text_content) < 20 and len(html_content) > 50:
            extracted_text = re.sub(r'<[^>]+>', ' ', html_content)
            extracted_text = re.sub(r'\s+', ' ', extracted_text).strip()
            if len(extracted_text) > len(text_content):
                text_content = extracted_text
                log_engine(self.engine_name, f"Extracted text from HTML: {len(text_content)} chars", "debug")
        
        response.response_html = html_content
        response.response_text = text_content
        
        # Determine success - be more lenient for ChatGPT which can have short but valid responses
        min_valid_length = 30  # Minimum chars to consider extraction successful
        response.success = len(text_content) >= min_valid_length or len(html_content) >= 100
        
        if not response.success:
            response.error_message = f"Response too short: HTML={len(html_content)}, Text={len(text_content)} (need at least {min_valid_length} chars)"
        
        return response
    
    def _extract_via_page_evaluation(self, response: EngineResponse) -> EngineResponse:
        """
        Fallback extraction using page-level JavaScript evaluation.
        
        This works even when container detection fails.
        """
        try:
            result = self.page.evaluate("""() => {
                // Find all assistant messages
                const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (assistantMsgs.length === 0) {
                    // Try alternative selectors
                    const altMsgs = document.querySelectorAll('[class*="agent-turn"], [class*="assistant"]');
                    if (altMsgs.length > 0) {
                        const lastMsg = altMsgs[altMsgs.length - 1];
                        return {
                            html: lastMsg.innerHTML || '',
                            text: lastMsg.innerText || lastMsg.textContent || '',
                            found: true
                        };
                    }
                    return { html: '', text: '', found: false };
                }
                
                const lastMsg = assistantMsgs[assistantMsgs.length - 1];
                
                // Find the prose/markdown content
                const proseElem = lastMsg.querySelector('.markdown, .prose, [class*="markdown"]');
                if (proseElem) {
                    return {
                        html: proseElem.innerHTML || '',
                        text: proseElem.innerText || proseElem.textContent || '',
                        found: true
                    };
                }
                
                return {
                    html: lastMsg.innerHTML || '',
                    text: lastMsg.innerText || lastMsg.textContent || '',
                    found: true
                };
            }""")
            
            if result and result.get("found"):
                response.response_html = result.get("html", "")
                response.response_text = result.get("text", "")
                
                # Clean text
                if response.response_text:
                    response.response_text = re.sub(r'\s+', ' ', response.response_text).strip()
                
                response.success = len(response.response_text) >= 30 or len(response.response_html) >= 100
                
                if not response.success:
                    response.error_message = f"Page eval: response too short"
            else:
                response.error_message = "Page eval: no assistant messages found"
                
        except Exception as e:
            response.error_message = f"Page eval failed: {e}"
            log_engine(self.engine_name, f"Page evaluation error: {e}", "error")
        
        return response
    
    def _take_debug_screenshot(self, label: str) -> None:
        """Take a screenshot for debugging extraction failures."""
        try:
            from config import config
            import os
            from datetime import datetime
            
            os.makedirs(config.error.screenshot_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{config.error.screenshot_dir}/chatgpt_{label}_{timestamp}.png"
            
            self.page.screenshot(path=filename)
            log_engine(self.engine_name, f"Debug screenshot saved: {filename}", "info")
        except Exception as e:
            log_engine(self.engine_name, f"Could not save debug screenshot: {e}", "debug")

    def _wait_for_response_content(self, min_chars: int = 50, timeout: int = 20) -> None:
        """Wait until the latest response container has enough text content.
        
        ENHANCED: Uses multiple selectors and also checks for prose content stability.
        """
        # Combine all selectors
        all_selectors = [self.selectors.get("response_container", "")] + self._response_container_selectors
        all_selectors = list(dict.fromkeys([s for s in all_selectors if s]))
        
        start = time.time()
        last_text_length = 0
        stable_count = 0
        
        while time.time() - start < timeout:
            best_text_len = 0
            best_container = None
            
            for selector in all_selectors:
                try:
                    containers = self.page.locator(selector).all()
                    if not containers:
                        continue
                    
                    # Get new or last responses
                    if len(containers) > self._response_count_before_prompt:
                        new_responses = containers[self._response_count_before_prompt:]
                        last_container = new_responses[-1]
                    else:
                        last_container = containers[-1]
                    
                    # Try to get text from prose elements first
                    text = ""
                    for prose_selector in self._prose_content_selectors:
                        try:
                            prose_elem = last_container.locator(prose_selector).first
                            if prose_elem.count() > 0:
                                text = prose_elem.inner_text() or ""
                                if text:
                                    break
                        except:
                            continue
                    
                    # Fallback to container text
                    if not text:
                        try:
                            text = last_container.inner_text() or ""
                        except:
                            text = ""
                    
                    text_len = len(text.strip())
                    if text_len > best_text_len:
                        best_text_len = text_len
                        best_container = last_container
                        
                except:
                    continue
            
            # Check if we have enough content
            if best_text_len >= min_chars:
                # Check if content is stable (not still streaming)
                if best_text_len == last_text_length:
                    stable_count += 1
                    if stable_count >= 2:  # Content stable for 2 checks (~1 second)
                        log_engine(self.engine_name, f"Content stabilized at {best_text_len} chars", "debug")
                        if best_container:
                            self._last_response_container = best_container
                        return
                else:
                    stable_count = 0
                    last_text_length = best_text_len
                    log_engine(self.engine_name, f"Content growing: {best_text_len} chars", "debug")
            
            time.sleep(0.5)

        log_engine(self.engine_name, f"Timed out waiting for content (got {last_text_length} chars, need {min_chars})", "warning")
    
    def _extract_sources_from_container(self, container: Locator) -> List[Dict[str, str]]:
        """
        Extract sources ONLY from a specific response container.
        
        This ensures we don't pick up citations from previous messages
        in the conversation.
        
        ENHANCED: Uses multiple methods including JS evaluation for robustness.
        """
        sources = []
        seen_urls = set()
        
        # List of domains to exclude (internal links)
        exclude_domains = ['openai.com', 'chatgpt.com', 'cdn.oaistatic.com', 'auth0.com']
        
        try:
            # Method 1: Look for source cards within this container
            source_card_selectors = [
                self.extra_selectors["source_card"],
                "[class*='source']",
                "[class*='citation']",
                "[class*='reference']",
                "[data-testid*='source']",
                "[data-testid*='citation']",
            ]
            
            for selector in source_card_selectors:
                try:
                    source_cards = container.locator(selector).all()
                    if source_cards:
                        log_engine(self.engine_name, f"Found {len(source_cards)} cards via '{selector[:30]}...'", "debug")
                        
                        for card in source_cards:
                            try:
                                # Try to find a link within the card
                                link = card.locator("a[href^='http']").first
                                if link.count() > 0:
                                    url = link.get_attribute("href") or ""
                                    title = link.inner_text() or card.inner_text() or ""
                                    
                                    if self._is_valid_source_url(url, seen_urls, exclude_domains):
                                        seen_urls.add(url)
                                        sources.append({
                                            "url": url,
                                            "title": title.strip()[:200],  # Limit title length
                                            "domain": self._extract_domain(url),
                                        })
                            except:
                                pass
                except:
                    continue
            
            # Method 2: Look for inline citation links within this container
            inline_selectors = [
                self.extra_selectors["inline_citation"],
                "a[href^='http']",  # All external links
                "a[target='_blank']",  # Links that open in new tab
            ]
            
            for selector in inline_selectors:
                try:
                    inline_links = container.locator(selector).all()
                    if inline_links:
                        log_engine(self.engine_name, f"Found {len(inline_links)} inline links via '{selector[:30]}...'", "debug")
                        
                        for link in inline_links:
                            try:
                                url = link.get_attribute("href") or ""
                                title = link.inner_text() or ""
                                
                                if self._is_valid_source_url(url, seen_urls, exclude_domains):
                                    seen_urls.add(url)
                                    sources.append({
                                        "url": url,
                                        "title": title.strip()[:200],
                                        "domain": self._extract_domain(url),
                                    })
                            except:
                                pass
                except:
                    continue
            
            # Method 3: Look for sources panel that might be associated with this response
            sources_panel_selector = self.extra_selectors["sources_panel"]
            try:
                sources_panel = container.locator(sources_panel_selector)
                
                if sources_panel.count() > 0:
                    panel_links = sources_panel.locator("a[href^='http']").all()
                    log_engine(self.engine_name, f"Found {len(panel_links)} links in sources panel", "debug")
                    
                    for link in panel_links:
                        try:
                            url = link.get_attribute("href") or ""
                            title = link.inner_text() or ""
                            
                            if self._is_valid_source_url(url, seen_urls, exclude_domains):
                                seen_urls.add(url)
                                sources.append({
                                    "url": url,
                                    "title": title.strip()[:200],
                                    "domain": self._extract_domain(url),
                                })
                        except:
                            pass
            except:
                pass
            
            # Method 4: JavaScript evaluation fallback - gets ALL links from container
            if len(sources) == 0:
                log_engine(self.engine_name, "No sources found with selectors, trying JS evaluation", "debug")
                js_sources = self._extract_sources_via_js(container)
                for src in js_sources:
                    if self._is_valid_source_url(src["url"], seen_urls, exclude_domains):
                        seen_urls.add(src["url"])
                        sources.append(src)
            
        except Exception as e:
            log_engine(self.engine_name, f"Error extracting sources from container: {e}", "warning")
        
        log_engine(self.engine_name, f"Total sources extracted: {len(sources)}", "debug")
        return sources
    
    def _is_valid_source_url(self, url: str, seen_urls: set, exclude_domains: List[str]) -> bool:
        """Check if a URL is a valid source (external, not duplicate, not excluded)."""
        if not url or not url.startswith("http"):
            return False
        if url in seen_urls:
            return False
        
        url_lower = url.lower()
        for domain in exclude_domains:
            if domain in url_lower:
                return False
        
        return True
    
    def _extract_sources_via_js(self, container: Locator) -> List[Dict[str, str]]:
        """Extract sources using JavaScript evaluation as a fallback."""
        try:
            result = container.evaluate("""el => {
                const sources = [];
                const seenUrls = new Set();
                const excludeDomains = ['openai.com', 'chatgpt.com', 'cdn.oaistatic.com', 'auth0.com'];
                
                // Find all links
                const links = el.querySelectorAll('a[href^="http"]');
                
                links.forEach(link => {
                    const url = link.href;
                    if (!url || seenUrls.has(url)) return;
                    
                    // Check if URL should be excluded
                    const urlLower = url.toLowerCase();
                    for (const domain of excludeDomains) {
                        if (urlLower.includes(domain)) return;
                    }
                    
                    seenUrls.add(url);
                    
                    // Get title from link text or parent element
                    let title = link.innerText || link.textContent || '';
                    if (title.length < 3) {
                        // Try to get from aria-label or title attribute
                        title = link.getAttribute('aria-label') || link.getAttribute('title') || url;
                    }
                    
                    // Extract domain
                    let domain = '';
                    try {
                        domain = new URL(url).hostname.replace('www.', '');
                    } catch {}
                    
                    sources.push({
                        url: url,
                        title: title.trim().slice(0, 200),
                        domain: domain
                    });
                });
                
                return sources;
            }""")
            
            return result if result else []
        except Exception as e:
            log_engine(self.engine_name, f"JS source extraction failed: {e}", "debug")
            return []
    
    def _extract_chatgpt_sources(self) -> list:
        """
        DEPRECATED: Use _extract_sources_from_container instead.
        
        This method extracts from the entire page and may include
        sources from previous conversations. Kept for backwards compatibility.
        """
        if self._last_response_container:
            return self._extract_sources_from_container(self._last_response_container)
        
        # Fallback to old behavior if no container tracked
        return self._extract_sources_from_page()
    
    def _extract_sources_from_page(self) -> list:
        """Extract all sources from the page (old behavior, may include previous responses)."""
        sources = []
        
        try:
            source_selector = self.extra_selectors["source_card"]
            source_cards = self.page.locator(source_selector).all()
            
            for card in source_cards:
                try:
                    link = card.locator("a").first
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
            
            inline_sources = self._extract_sources()
            
            existing_urls = {s["url"] for s in sources}
            for source in inline_sources:
                if source["url"] not in existing_urls:
                    sources.append(source)
            
        except Exception as e:
            logger.debug(f"Error extracting sources: {e}")
        
        return sources
    
    def start_new_chat(self) -> bool:
        """
        Start a new conversation/chat.
        
        RECOMMENDED: Call this before each prompt to ensure clean extraction.
        
        Returns:
            True if successful
        """
        try:
            new_chat_selector = self.extra_selectors["new_chat_button"]
            button = self.page.locator(new_chat_selector).first
            
            if button.is_visible(timeout=2000):
                try:
                    button.click(timeout=5000)
                except Exception:
                    # Overlay sometimes intercepts pointer events; fall back to force click
                    try:
                        button.click(timeout=5000, force=True)
                    except Exception:
                        # Last resort: DOM click
                        self.page.evaluate("el => el.click()", button)
                time.sleep(1)
                # Ensure input is ready after switching
                try:
                    self._wait_for_ready()
                except:
                    pass
                
                # Reset tracking
                self._response_count_before_prompt = 0
                self._last_response_container = None
                
                log_engine(self.engine_name, "Started new chat")
                return True
        except Exception as e:
            log_engine(self.engine_name, f"Could not start new chat: {e}", "warning")

        # Fallback: navigate to the base ChatGPT URL to force a new conversation
        try:
            if self.page:
                self.page.goto(ENGINE_URLS["chatgpt"], wait_until="domcontentloaded", timeout=30000)
                try:
                    self._wait_for_ready()
                except:
                    pass

                self._response_count_before_prompt = 0
                self._last_response_container = None
                log_engine(self.engine_name, "Started new chat via navigation fallback", "debug")
                return True
        except Exception as e:
            log_engine(self.engine_name, f"Fallback navigation failed: {e}", "warning")
        
        return False
    
    def enable_web_search(self) -> bool:
        """
        Try to enable web search mode.
        
        Returns:
            True if web search was enabled
        """
        try:
            toggle = self.page.locator(self.extra_selectors["web_search_toggle"])
            
            if toggle.count() > 0 and toggle.is_visible():
                is_enabled = toggle.get_attribute("aria-checked") == "true"
                
                if not is_enabled:
                    toggle.click()
                    log_engine(self.engine_name, "Enabled web search")
                    return True
                else:
                    log_engine(self.engine_name, "Web search already enabled", "debug")
                    return True
        except:
            pass
        
        return False
    
    def get_current_model(self) -> str:
        """
        Get the currently selected model.
        
        Returns:
            Model name or empty string
        """
        try:
            model_selector = self.page.locator(self.extra_selectors["model_selector"])
            if model_selector.count() > 0:
                return model_selector.inner_text()
        except:
            pass
        
        return ""
