"""
Perplexity Browser Engine for RPA.

Handles automation of perplexity.ai including:
- Prompt submission
- Response capture with numbered citations
- Source card extraction
- Related questions
"""

import re
import time
from typing import Optional, List, Dict
from playwright.sync_api import Page, Locator

from .base_engine import BaseEngine, EngineResponse
from config import ENGINE_URLS, config
from utils.logging import logger, log_engine
from utils.source_utils import extract_domain_mentions, merge_sources, sources_from_domain_mentions


class PerplexityEngine(BaseEngine):
    """
    Perplexity browser automation engine.
    
    Works with the Perplexity AI web interface.
    Handles inline citations [1], [2] and source cards.
    """
    
    def __init__(self):
        super().__init__("perplexity")
        # Track response count to isolate current response (avoid extracting older prompts/sources)
        self._response_count_before_prompt = 0
        
        # Perplexity-specific selectors (2026 UI)
        self.extra_selectors = {
            "citation_number": "[class*='citation-number'], sup",
            # Updated for 2026 UI: citations use span.citation and a[data-pplx-citation]
            "source_card": "span.citation, [class*='source-card'], [class*='source-item']",
            "citation_link": "span.citation a[href^='http'], a[data-pplx-citation], a[data-pplx-citation-url]",
            "source_favicon": "[class*='favicon']",
            "source_title": "[class*='source-title'], h4, [class*='rounded-badge']",
            "source_domain": "[class*='domain'], [class*='hostname'], [class*='rounded-badge'] span",
            "source_snippet": "[class*='snippet'], p",
            "related_section": "[class*='related'], [class*='suggestions']",
            "related_question": "[class*='related-question'], button[class*='suggestion']",
            "focus_selector": "[class*='focus-selector']",
            "pro_badge": "[class*='pro-badge'], [class*='premium']",
        }

    def _choose_source_scope(self, root: Locator) -> Locator:
        """
        Perplexity often renders citations/source chips as siblings *outside* the `div.prose`.
        We pick a nearby ancestor that contains the most citation/source elements, while
        avoiding a scope so large it mixes older answers.
        """
        candidates: List[Locator] = [root]
        cur = root

        # Walk up a few ancestors to find the answer "turn" wrapper.
        for _ in range(6):
            try:
                parent = cur.locator("..").first
                if parent.count() == 0:
                    break
                candidates.append(parent)
                cur = parent
            except Exception:
                break

        best = root
        best_score = -1
        for cand in candidates:
            try:
                citation_like = cand.locator(
                    "span.citation, span[data-pplx-citation-url], a[data-pplx-citation], "
                    "a[data-pplx-citation-url], [class*='source-card'], [class*='source-item']"
                ).count()
                prose_count = cand.locator("div.prose").count()

                # Penalize scopes that include multiple prose blocks (likely includes older answers).
                score = int(citation_like) - max(0, int(prose_count) - 1) * 5
                if score > best_score:
                    best_score = score
                    best = cand
            except Exception:
                continue

        return best

    def _try_expand_sources(self, scope: Locator) -> None:
        """
        Some Perplexity UIs collapse/limit source chips behind "View all"/"Show more".
        We attempt a couple safe clicks inside the selected scope.
        """
        try:
            texts = [
                "View all",
                "Show all",
                "Show more",
                "More sources",
            ]
            for text in texts:
                try:
                    btn = scope.locator(f"button:has-text('{text}')").first
                    if btn.count() > 0 and btn.is_visible(timeout=500):
                        btn.click(timeout=1000)
                        time.sleep(0.5)
                except Exception:
                    continue
        except Exception:
            return
    
    def _count_existing_responses(self) -> None:
        """Count existing Perplexity responses before sending a new prompt."""
        try:
            response_selector = self.selectors.get("response_container", "")
            count = self.page.locator(response_selector).count() if response_selector else 0
            self._response_count_before_prompt = int(count)
            log_engine(self.engine_name, f"Existing responses: {self._response_count_before_prompt}", "debug")
        except Exception as e:
            logger.debug(f"Failed to count existing responses: {e}")
            self._response_count_before_prompt = 0

    def send_prompt(self, prompt: str) -> None:
        """Send a prompt to Perplexity without refreshing/navigating the page."""
        # Ensure page is loaded and ready (but do NOT navigate home per prompt)
        self._ensure_page_ready()

        # Count existing responses BEFORE we send the prompt (to extract only new content)
        self._count_existing_responses()
        
        if self.human:
            self.human.think_pause()
        
        # Type the prompt with retries
        success = False
        for attempt in range(3):
            success = self._type_text("prompt_input", prompt)
            if success:
                break
            time.sleep(1)
            log_engine(self.engine_name, f"Retrying input (attempt {attempt + 1}/3)", "debug")
        
        if not success:
            # Last resort: try direct keyboard input
            try:
                self.page.keyboard.type(prompt, delay=50)
                success = True
            except:
                pass
        
        if not success:
            raise RuntimeError("Could not find Perplexity input field after multiple attempts")
        
        if self.human:
            self.human.micro_pause()
        
        # Submit
        self._submit_prompt()
    
    def _ensure_page_ready(self) -> None:
        """Ensure Perplexity page is fully loaded and ready."""
        try:
            # Wait for page to be interactive
            self.page.wait_for_load_state("networkidle", timeout=10000)
            time.sleep(1)  # Additional stabilization
            
            # Try to find any input element to confirm page is ready
            input_selectors = self.selectors.get("prompt_input", [])
            for selector in input_selectors[:3]:  # Try first 3 selectors
                try:
                    element = self.page.locator(selector).first
                    if element.is_visible(timeout=2000):
                        log_engine(self.engine_name, "Page ready", "debug")
                        return
                except:
                    continue
        except Exception as e:
            log_engine(self.engine_name, f"Page readiness check: {e}", "debug")
    
    def _submit_prompt(self) -> None:
        """Submit the prompt."""
        # Per request: prefer Enter over clicking send (UI changes often)
        # Ensure the input is focused, then press Enter.
        try:
            input_selectors = self.selectors.get("prompt_input", [])
            if isinstance(input_selectors, str):
                input_selectors = [input_selectors]
            for selector in input_selectors:
                try:
                    el = self.page.locator(selector).first
                    if el.count() > 0 and el.is_visible(timeout=500):
                        el.click()
                        break
                except:
                    continue
        except:
            pass
        
        # Try Enter, then fall back to Ctrl/Cmd+Enter (some chat UIs require it)
        try:
            self.page.keyboard.press("Enter")
            time.sleep(0.2)
        except:
            pass
        
        # If Enter didn't submit (some UIs keep text), try modifier+Enter
        try:
            self.page.keyboard.press("Control+Enter")
            time.sleep(0.2)
        except:
            pass
        try:
            self.page.keyboard.press("Meta+Enter")
        except:
            pass
    
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

        # Prefer waiting for a new response beyond the pre-prompt count (no refresh/new tab workflow)
        start = time.time()
        while time.time() - start < 30:
            try:
                if response_selector:
                    count = self.page.locator(response_selector).count()
                    if count > self._response_count_before_prompt:
                        break
            except:
                pass
            time.sleep(0.5)
        
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
        """Extract response from Perplexity with enhanced fallbacks."""
        response = EngineResponse(engine=self.engine_name)
        
        response_selector = self.selectors.get("response_container", "")
        response_text_selector = self.selectors.get("response_text", "")
        
        try:
            best = None
            
            # Method 1: Primary - div.prose containers (Perplexity 2026 UI)
            prose_containers = self.page.locator("div.prose").all()
            log_engine(self.engine_name, f"Found {len(prose_containers)} div.prose containers, tracking {self._response_count_before_prompt} before prompt", "debug")
            
            if prose_containers and len(prose_containers) > self._response_count_before_prompt:
                best = prose_containers[self._response_count_before_prompt]
                log_engine(self.engine_name, f"Using prose container #{self._response_count_before_prompt}", "debug")
            elif prose_containers:
                best = prose_containers[-1]
                log_engine(self.engine_name, f"Using last prose container (fallback)", "debug")
            
            # Method 2: Fallback to configured selector
            if not best:
                containers = self.page.locator(response_selector).all()
                log_engine(self.engine_name, f"Found {len(containers)} configured containers", "debug")
                if containers and len(containers) > self._response_count_before_prompt:
                    best = containers[self._response_count_before_prompt]
                elif containers:
                    best = containers[-1]
            
            # Method 3: Fallback to any response-like container
            if not best:
                fallback_selectors = [
                    "[class*='answer']",
                    "[class*='response']", 
                    "[class*='message-content']",
                ]
                for sel in fallback_selectors:
                    fallback = self.page.locator(sel).all()
                    if fallback:
                        best = fallback[-1]
                        log_engine(self.engine_name, f"Using fallback selector '{sel}'", "debug")
                        break
            
            if not best:
                response.error_message = "No response container found"
                log_engine(self.engine_name, response.error_message, "error")
                return response

            response.response_html = best.inner_html()
            log_engine(self.engine_name, f"Extracted {len(response.response_html)} chars HTML", "debug")

            # For Perplexity, the container (div.prose) contains all the text directly
            # Just get all text from the container
            response.response_text = best.inner_text() or ""
            log_engine(self.engine_name, f"Extracted {len(response.response_text)} chars text", "debug")

            # Validate we got meaningful content
            if len(response.response_text.strip()) < 20:
                log_engine(self.engine_name, f"Response text too short ({len(response.response_text)} chars), trying parent", "warning")
                # Try getting text from parent element as fallback
                try:
                    parent = best.locator("..").first
                    if parent.count() > 0:
                        parent_text = parent.inner_text() or ""
                        if len(parent_text) > len(response.response_text):
                            response.response_text = parent_text
                            log_engine(self.engine_name, f"Using parent text: {len(response.response_text)} chars", "debug")
                except:
                    pass

            response.success = len(response.response_text.strip()) > 20
            
            if response.success:
                log_engine(
                    self.engine_name,
                    f"✓ Extracted: {len(response.response_html)} chars HTML, {len(response.response_text)} chars text"
                )
            else:
                response.error_message = f"Response too short: {len(response.response_text)} chars"
                log_engine(self.engine_name, response.error_message, "warning")

        except Exception as e:
            response.error_message = f"Failed to extract response: {e}"
            log_engine(self.engine_name, response.error_message, "error")
            return response
        
        # Extract sources with rich data, scoped to this answer "turn"
        scope = None
        try:
            scope = self._choose_source_scope(best)
            self._try_expand_sources(scope)
        except Exception:
            scope = best

        response.sources = self._extract_perplexity_sources(root=scope)

        # Also include domains mentioned in the response text (even if not clickable links)
        exclude_domains = ["perplexity.ai", "openai.com", "chatgpt.com"]
        mentioned = extract_domain_mentions(response.response_text or "", exclude_domains=exclude_domains)
        response.sources = merge_sources(response.sources, sources_from_domain_mentions(mentioned))

        # Apply configurable cap (0 = unlimited)
        max_sources = getattr(config, "max_sources_per_response", 200)
        if isinstance(max_sources, int) and max_sources > 0:
            response.sources = response.sources[:max_sources]

        response.citation_count = len(response.sources)
        
        return response
    
    def _extract_perplexity_sources(self, root=None) -> List[Dict[str, str]]:
        """
        Extract detailed source information from Perplexity, scoped to the current answer (2026 UI).
        
        In the 2026 UI, sources are displayed in a sidebar that opens when clicking
        a "X sources" button. Sources in the sidebar are anchor tags with full URLs.
        """
        sources = []
        existing_urls = set()
        
        try:
            base = root if root is not None else self.page
            
            # ====================================================================
            # METHOD 1 (PRIMARY): Click sources button to open sidebar and extract
            # The button looks like: <button> with text "X sources" inside a 
            # <div class="rounded-full bg-subtle">
            # ====================================================================
            sidebar_opened = False
            try:
                # Find the sources button - look for button containing "X sources" text
                # within the scope of the current answer
                sources_button = None
                
                # Selector 1: Button with "sources" text in rounded-full container
                try:
                    btn = base.locator("div.rounded-full button").filter(
                        has_text=re.compile(r'\d+\s*sources?', re.IGNORECASE)
                    ).first
                    if btn.count() > 0 and btn.is_visible(timeout=1000):
                        sources_button = btn
                        log_engine(self.engine_name, "Found sources button (rounded-full container)", "debug")
                except Exception:
                    pass
                
                # Selector 2: Any button with sources text pattern
                if not sources_button:
                    try:
                        btn = base.get_by_text(re.compile(r'\d+\s*sources?', re.IGNORECASE)).first
                        if btn.count() > 0 and btn.is_visible(timeout=500):
                            sources_button = btn
                            log_engine(self.engine_name, "Found sources button (text match)", "debug")
                    except Exception:
                        pass
                
                # Selector 3: Look for button near favicon cluster (sources preview)
                if not sources_button:
                    try:
                        # Sources button often has favicon images previewed
                        btn = base.locator("button:has(img[src*='favicon'])").filter(
                            has_text=re.compile(r'sources?', re.IGNORECASE)
                        ).first
                        if btn.count() > 0 and btn.is_visible(timeout=500):
                            sources_button = btn
                            log_engine(self.engine_name, "Found sources button (favicon cluster)", "debug")
                    except Exception:
                        pass
                
                if sources_button and sources_button.count() > 0:
                    try:
                        sources_button.click(timeout=2000)
                        time.sleep(1.5)  # Wait for sidebar animation
                        sidebar_opened = True
                        log_engine(self.engine_name, "Clicked sources button to open sidebar", "debug")
                    except Exception as click_err:
                        log_engine(self.engine_name, f"Could not click sources button: {click_err}", "debug")
                else:
                    log_engine(self.engine_name, "No sources button found", "debug")
                    
            except Exception as btn_err:
                log_engine(self.engine_name, f"Error finding sources button: {btn_err}", "debug")
            
            # ====================================================================
            # If sidebar opened, extract sources from it
            # Sidebar structure: <div class="md:gap-xs ..."> containing <a> elements
            # Each <a> has: href, domain text, title, and snippet
            # ====================================================================
            if sidebar_opened:
                try:
                    # Wait a moment for sidebar content to render
                    time.sleep(0.5)
                    
                    # Extract sources using JavaScript for reliability
                    sidebar_sources = self.page.evaluate("""() => {
                        const results = [];
                        const seenUrls = new Set();
                        
                        // Look for the sources sidebar panel
                        // It contains anchor tags with source links
                        const sidebarSelectors = [
                            'div[class*="overflow-y-auto"] a[href^="http"]',
                            'div[class*="scrollbar"] a[href^="http"]',
                            'aside a[href^="http"]',
                            // The sidebar container often has these classes
                            'div.flex.flex-col.gap-6 a[href^="http"]',
                        ];
                        
                        let sourceLinks = [];
                        for (const selector of sidebarSelectors) {
                            const links = document.querySelectorAll(selector);
                            if (links.length > 0) {
                                sourceLinks = Array.from(links);
                                break;
                            }
                        }
                        
                        // Fallback: find all visible source-like links in the right side of the page
                        if (sourceLinks.length === 0) {
                            const allLinks = document.querySelectorAll('a[href^="http"][rel="noopener"]');
                            sourceLinks = Array.from(allLinks).filter(link => {
                                // Filter to links that look like source citations
                                const hasTitle = link.querySelector('.font-medium, [class*="font-medium"]');
                                const hasDomain = link.querySelector('.text-quiet, [class*="text-quiet"]');
                                return hasTitle || hasDomain;
                            });
                        }
                        
                        sourceLinks.forEach(link => {
                            const url = link.getAttribute('href') || '';
                            
                            // Skip internal/infrastructure links
                            if (!url || url.includes('perplexity.ai') || url.includes('google.com/s2/favicons')) {
                                return;
                            }
                            
                            if (seenUrls.has(url)) return;
                            seenUrls.add(url);
                            
                            // Extract title - usually in a font-medium span
                            const titleEl = link.querySelector('.font-medium, [class*="font-medium"], span:nth-child(2)');
                            const title = titleEl 
                                ? (titleEl.innerText || titleEl.textContent || '').trim()
                                : '';
                            
                            // Extract domain - usually in a text-quiet span
                            const domainEl = link.querySelector('.text-quiet.text-xs, span.text-xs, [class*="line-clamp-1"]');
                            const domain = domainEl 
                                ? (domainEl.innerText || domainEl.textContent || '').trim()
                                : '';
                            
                            // Extract snippet - usually the longer description text
                            const snippetEl = link.querySelector('.line-clamp-4, [class*="wrap-anywhere"]');
                            const snippet = snippetEl
                                ? (snippetEl.innerText || snippetEl.textContent || '').trim().slice(0, 300)
                                : '';
                            
                            results.push({
                                url: url,
                                title: title || domain || url,
                                domain: domain,
                                snippet: snippet
                            });
                        });
                        
                        return results;
                    }""")
                    
                    if sidebar_sources:
                        for src in sidebar_sources:
                            url = src.get("url", "")
                            if url and url.startswith("http") and url not in existing_urls:
                                existing_urls.add(url)
                                sources.append({
                                    "url": url,
                                    "title": src.get("title", "") or self._extract_domain(url),
                                    "domain": src.get("domain", "") or self._extract_domain(url),
                                })
                        
                        log_engine(self.engine_name, f"Sidebar extraction found {len(sidebar_sources)} sources", "info")
                    
                except Exception as e:
                    log_engine(self.engine_name, f"Sidebar source extraction failed: {e}", "debug")
                
                # Close the sidebar (press Escape or click elsewhere)
                try:
                    self.page.keyboard.press("Escape")
                    time.sleep(0.3)
                except Exception:
                    pass
            
            # ====================================================================
            # METHOD 2: Extract from inline span.citation containers (fallback)
            # ====================================================================
            citation_spans = base.locator("span.citation").all()
            log_engine(self.engine_name, f"Found {len(citation_spans)} span.citation elements", "debug")
            
            for i, span in enumerate(citation_spans):
                try:
                    link = span.locator("a[href^='http']").first
                    if link.count() > 0:
                        url = link.get_attribute("href") or ""
                        domain_text = span.inner_text().strip()
                        domain = self._extract_domain(url) if url else domain_text.split("+")[0].strip()
                        
                        if url and url.startswith("http") and url not in existing_urls:
                            sources.append({
                                "url": url,
                                "title": domain_text or domain,
                                "domain": domain,
                            })
                            existing_urls.add(url)
                except:
                    pass
            
            # ====================================================================
            # METHOD 3: Extract from span[data-pplx-citation-url] elements
            # ====================================================================
            pplx_spans = base.locator("span[data-pplx-citation-url]").all()
            log_engine(self.engine_name, f"Found {len(pplx_spans)} span[data-pplx-citation-url] elements", "debug")
            
            for span in pplx_spans:
                try:
                    url = span.get_attribute("data-pplx-citation-url") or ""
                    link = span.locator("a[href^='http']").first
                    if link.count() > 0:
                        url = url or link.get_attribute("href") or ""
                    title = span.get_attribute("aria-label") or span.inner_text().strip() or ""
                    domain = self._extract_domain(url) if url else ""
                    
                    if url and url.startswith("http") and url not in existing_urls:
                        sources.append({
                            "url": url,
                            "title": title or domain,
                            "domain": domain,
                        })
                        existing_urls.add(url)
                except:
                    pass
            
            # ====================================================================
            # METHOD 4: Extract from a[data-pplx-citation] or inline links
            # ====================================================================
            pplx_links = base.locator("a[data-pplx-citation], span.citation a[href^='http']").all()
            log_engine(self.engine_name, f"Found {len(pplx_links)} citation links", "debug")
            
            for link in pplx_links:
                try:
                    url = link.get_attribute("href") or ""
                    title = link.get_attribute("aria-label") or link.inner_text().strip() or ""
                    domain = self._extract_domain(url) if url else ""
                    
                    if url and url.startswith("http") and url not in existing_urls:
                        sources.append({
                            "url": url,
                            "title": title or domain,
                            "domain": domain,
                        })
                        existing_urls.add(url)
                except:
                    pass
            
            log_engine(self.engine_name, f"Extracted {len(sources)} total sources", "debug")
            
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

