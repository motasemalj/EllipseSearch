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

        # Track response count to isolate current response (avoid extracting older prompts)
        self._response_count_before_prompt = 0
        
        # Gemini-specific selectors
        self.extra_selectors = {
            "rich_textarea": "rich-textarea",
            "contenteditable": "[contenteditable='true']",
            "grounding_section": ".grounding-sources, [class*='grounding']",
            "source_chip": ".source-chip, [class*='source-chip'], [class*='citation-chip']",
            "search_query_display": "[class*='search-query']",
            "extension_indicator": "[class*='extension'], [class*='google-search']",
            "login_required": "a[href*='accounts.google.com']",
            # New Gemini UI (2026): sources are in carousel/chip elements
            "sources_carousel": "sources-carousel-inline",
            "source_inline_chip": "source-inline-chip",
            "source_path": ".source-path, [class*='source-path']",
            "fact_check_card": "fact-check-source-hovered-card",
        }

    def _choose_source_scope(self, root) -> object:
        """
        Gemini grounding chips sometimes render near (but not strictly inside) the message content node.
        We select a nearby ancestor that maximizes grounding chip count, while trying to avoid
        spanning multiple response turns.
        """
        candidates = [root]
        cur = root
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
        chip_sel = self.extra_selectors["source_chip"]
        for cand in candidates:
            try:
                chip_count = int(cand.locator(chip_sel).count())
                turn_count = int(cand.locator("[id^='model-response-message-content']").count())
                # penalize candidates that include multiple turns
                score = chip_count - max(0, turn_count - 1) * 10
                if score > best_score:
                    best_score = score
                    best = cand
            except Exception:
                continue
        return best

    def _extract_inline_sources_scoped(self, root) -> List[Dict[str, str]]:
        """
        Extract inline citation links within the given root only.
        This prevents pulling links/citations from older turns elsewhere on the page.
        """
        sources: List[Dict[str, str]] = []
        seen = set()

        citation_selector = self.selectors.get("citation_link", "")
        if not citation_selector:
            return sources

        try:
            for link in root.locator(citation_selector).all():
                try:
                    url = link.get_attribute("href") or ""
                    title = link.inner_text() or ""
                    if url and url.startswith("http") and url not in seen:
                        seen.add(url)
                        sources.append(
                            {
                                "url": url,
                                "title": title.strip(),
                                "domain": self._extract_domain(url),
                            }
                        )
                except Exception:
                    continue
        except Exception:
            return sources

        return sources

    def _count_existing_responses(self) -> None:
        """Count existing Gemini responses before sending a new prompt."""
        try:
            # Most reliable: response content containers by id prefix
            count = self.page.locator("[id^='model-response-message-content']").count()
            self._response_count_before_prompt = int(count)
            log_engine(self.engine_name, f"Existing responses: {self._response_count_before_prompt}", "debug")
        except Exception as e:
            logger.debug(f"Failed to count existing responses: {e}")
            self._response_count_before_prompt = 0
    
    def send_prompt(self, prompt: str) -> None:
        """
        Send a prompt to Gemini.
        
        Gemini uses a custom rich-textarea component that needs special handling.
        """
        # Check for Google login requirement
        self._check_for_login()

        # Count existing responses BEFORE we send the prompt (to extract only new content)
        self._count_existing_responses()
        
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
        # Ensure page is ready
        try:
            self.page.wait_for_load_state("networkidle", timeout=10000)
            time.sleep(1)
        except:
            pass
        
        # Try rich-textarea first
        try:
            rich_textarea = self.page.locator(self.extra_selectors["rich_textarea"]).first
            if rich_textarea.is_visible(timeout=5000):
                rich_textarea.click()
                time.sleep(0.5)
                
                # Try to fill via contenteditable
                editable = rich_textarea.locator("[contenteditable='true']").first
                if editable.count() > 0:
                    editable.evaluate(
                        "(el, text) => { el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }",
                        text
                    )
                    time.sleep(0.3)
                    return True
                else:
                    # Direct keyboard input
                    self.page.keyboard.type(text, delay=50)
                    return True
        except Exception as e:
            logger.debug(f"rich-textarea method failed: {e}")
        
        # Fallback to regular textarea with retries
        for attempt in range(3):
            if self._type_text("prompt_input", text):
                return True
            time.sleep(1)
        
        # Last resort: direct keyboard
        try:
            self.page.keyboard.type(text, delay=50)
            return True
        except:
            return False
    
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

        # Wait until we have a new response container beyond the pre-prompt count
        start = time.time()
        while time.time() - start < 30:
            try:
                count = self.page.locator("[id^='model-response-message-content']").count()
                if count > self._response_count_before_prompt:
                    break
            except:
                pass
            time.sleep(0.5)
        
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
        """Extract response content from Gemini with enhanced fallbacks."""
        response = EngineResponse(engine=self.engine_name)
        
        response_selector = self.selectors.get("response_container", "")
        response_text_selector = self.selectors.get("response_text", "")
        
        try:
            best = None
            
            # Method 1: Primary - model-response-message-content id prefix
            containers = self.page.locator("[id^='model-response-message-content']").all()
            log_engine(self.engine_name, f"Found {len(containers)} containers with id prefix, tracking {self._response_count_before_prompt} before prompt", "debug")
            
            if containers and len(containers) > self._response_count_before_prompt:
                best = containers[self._response_count_before_prompt]
                log_engine(self.engine_name, f"Using response container #{self._response_count_before_prompt}", "debug")
            elif containers:
                best = containers[-1]
                log_engine(self.engine_name, f"Using last response container (fallback)", "debug")
            
            # Method 2: Fallback to markdown panel
            if not best:
                markdown_containers = self.page.locator("div.markdown.markdown-main-panel, .markdown-main-panel").all()
                log_engine(self.engine_name, f"Found {len(markdown_containers)} markdown containers", "debug")
                if markdown_containers:
                    best = markdown_containers[-1]
                    log_engine(self.engine_name, f"Using markdown container fallback", "debug")
            
            # Method 3: Fallback to configured selector
            if not best:
                fallback = self.page.locator(response_selector).all()
                log_engine(self.engine_name, f"Found {len(fallback)} fallback containers", "debug")
                if fallback:
                    best = fallback[-1]
                    log_engine(self.engine_name, f"Using configured selector fallback", "debug")
            
            # Method 4: Last resort - find any visible content with model-response class
            if not best:
                last_resort = self.page.locator("[class*='model-response'], [class*='response-content'], [class*='message-content']").all()
                log_engine(self.engine_name, f"Found {len(last_resort)} last resort containers", "debug")
                if last_resort:
                    best = last_resort[-1]
                    log_engine(self.engine_name, f"Using last resort selector", "debug")
            
            if not best:
                response.error_message = "No response container found with any selector"
                log_engine(self.engine_name, response.error_message, "error")
                return response

            # Extract HTML + text from best candidate
            response.response_html = best.inner_html() or ""
            log_engine(self.engine_name, f"Extracted {len(response.response_html)} chars HTML", "debug")

            # If best is a wrapper, try extracting from markdown panel inside it
            try:
                inner = best.locator(response_text_selector).first
                if inner.count() > 0:
                    inner_text = inner.inner_text() or ""
                    if len(inner_text.strip()) > 0:
                        response.response_text = inner_text
                    else:
                        response.response_text = best.inner_text() or ""
                else:
                    response.response_text = best.inner_text() or ""
            except:
                response.response_text = best.inner_text() or ""

            # Validate we got meaningful content
            if len(response.response_text.strip()) < 20:
                log_engine(self.engine_name, f"Response text too short ({len(response.response_text)} chars), attempting full page extraction", "warning")
                # Try extracting from visible content area
                try:
                    main_content = self.page.locator("main").inner_text()
                    if main_content and len(main_content) > len(response.response_text):
                        response.response_text = main_content
                        response.response_html = self.page.locator("main").inner_html()
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
        
        # Extract grounding sources
        # Scope sources to the current response when possible to avoid mixing with older prompts.
        try:
            scope = self._choose_source_scope(best)
            response.sources = self._extract_grounding_sources(container=scope)
        except TypeError:
            response.sources = self._extract_grounding_sources()
        response.citation_count = len(response.sources)
        
        return response
    
    def _extract_grounding_sources(self, container=None) -> List[Dict[str, str]]:
        """
        Extract grounding sources (Google Search citations) and all hyperlinks from response.
        
        In the 2026 Gemini UI, sources appear in:
        1. sources-carousel-inline with source-inline-chip elements that need hovering
        2. Hyperlinks in the response content
        3. fact-check-source-hovered-card elements (shown on hover)
        """
        sources = []
        seen_urls = set()
        seen_domains = set()
        
        # Domains to exclude (Google infrastructure)
        exclude_domains = [
            "google.com",
            "googleapis.com", 
            "gstatic.com",
            "googleusercontent.com",
            "accounts.google.com",
            "gemini.google.com",
        ]
        
        def is_valid_url(url: str) -> bool:
            if not url or not url.startswith("http"):
                return False
            if url in seen_urls:
                return False
            try:
                from urllib.parse import urlparse
                hostname = (urlparse(url).hostname or "").lower()
                for domain in exclude_domains:
                    if hostname == domain or hostname.endswith("." + domain):
                        return False
            except:
                pass
            return True
        
        def is_valid_domain(domain: str) -> bool:
            """Check if a string looks like a valid domain name."""
            if not domain:
                return False
            domain_lower = domain.lower().strip()
            if domain_lower in seen_domains:
                return False
            for excl in exclude_domains:
                if domain_lower == excl or domain_lower.endswith("." + excl):
                    return False
            # Domain must have at least one dot and no spaces
            if '.' not in domain_lower or ' ' in domain_lower:
                return False
            # Domain should be reasonably short and look like a domain
            if len(domain_lower) > 100 or len(domain_lower) < 4:
                return False
            return True
        
        try:
            root = container if container is not None else self.page
            
            # ====================================================================
            # METHOD 1 (PRIMARY): Hover over source-inline-chip elements to reveal domains
            # The 2026 Gemini UI uses source-inline-chip elements that show the source
            # domain only when hovered. We need to hover over each to trigger the reveal.
            # ====================================================================
            try:
                # First, find all source-inline-chip elements
                chip_elements = self.page.locator("source-inline-chip").all()
                log_engine(self.engine_name, f"Found {len(chip_elements)} source-inline-chip elements", "debug")
                
                for chip in chip_elements:
                    try:
                        # Hover over the chip to reveal the source info
                        if chip.is_visible(timeout=500):
                            chip.hover(timeout=1000)
                            time.sleep(0.3)  # Wait for hover card to appear
                            
                            # After hovering, try to extract the domain from:
                            # 1. The hover card (fact-check-source-hovered-card)
                            # 2. The chip's button aria-label
                            # 3. jslog attribute which contains metadata
                            
                            # Check for hover card
                            hover_card = self.page.locator("fact-check-source-hovered-card").first
                            if hover_card.count() > 0 and hover_card.is_visible(timeout=300):
                                # Extract domain from hover card
                                path_el = hover_card.locator(".source-path, [class*='source-path']").first
                                if path_el.count() > 0:
                                    domain = path_el.inner_text().strip()
                                    if is_valid_domain(domain):
                                        seen_domains.add(domain.lower())
                                        url = f"https://{domain}"
                                        if url not in seen_urls:
                                            seen_urls.add(url)
                                            sources.append({
                                                "url": url,
                                                "title": domain,
                                                "domain": domain,
                                            })
                                            log_engine(self.engine_name, f"Extracted domain from hover card: {domain}", "debug")
                            
                            # Also check the button's aria-label for domain info
                            btn = chip.locator("button[aria-label]").first
                            if btn.count() > 0:
                                label = btn.get_attribute("aria-label") or ""
                                # Extract domain from label (e.g., "View source details for example.com")
                                import re
                                domain_match = re.search(r'([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+\.[a-zA-Z]{2,})', label)
                                if domain_match:
                                    domain = domain_match.group(1)
                                    if is_valid_domain(domain):
                                        seen_domains.add(domain.lower())
                                        url = f"https://{domain}"
                                        if url not in seen_urls:
                                            seen_urls.add(url)
                                            sources.append({
                                                "url": url,
                                                "title": domain,
                                                "domain": domain,
                                            })
                    except Exception as chip_err:
                        log_engine(self.engine_name, f"Error processing chip: {chip_err}", "debug")
                        continue
                
                # Move mouse away to close any hover cards
                try:
                    self.page.mouse.move(0, 0)
                    time.sleep(0.2)
                except:
                    pass
                    
            except Exception as hover_err:
                log_engine(self.engine_name, f"Hover extraction failed: {hover_err}", "debug")
            
            # ====================================================================
            # METHOD 2: Extract from sources-carousel-inline using JavaScript
            # This catches any sources we might have missed with hovering
            # ====================================================================
            try:
                carousel_sources = self.page.evaluate("""() => {
                    const results = [];
                    const seenDomains = new Set();
                    
                    // Look for source-inline-chip elements
                    const chips = document.querySelectorAll('source-inline-chip, sources-carousel-inline source-inline-chip');
                    chips.forEach(chip => {
                        // Check the button's jslog attribute for metadata
                        const btn = chip.querySelector('button[jslog]');
                        if (btn) {
                            const jslog = btn.getAttribute('jslog') || '';
                            // jslog often contains the source domain in encoded form
                            // Try to extract any domain-like strings
                            const domainMatches = jslog.match(/([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)+\.[a-zA-Z]{2,})/g);
                            if (domainMatches) {
                                domainMatches.forEach(domain => {
                                    const d = domain.toLowerCase();
                                    // Filter out Google domains
                                    if (!d.includes('google') && !d.includes('gstatic') && !seenDomains.has(d)) {
                                        seenDomains.add(d);
                                        results.push({ domain: domain, title: domain });
                                    }
                                });
                            }
                        }
                        
                        // Check for source-path element (visible domain)
                        const pathEl = chip.querySelector('.source-path, [class*="source-path"]');
                        if (pathEl) {
                            const domain = (pathEl.innerText || pathEl.textContent || '').trim();
                            if (domain && domain.includes('.') && !domain.includes(' ') && !seenDomains.has(domain.toLowerCase())) {
                                seenDomains.add(domain.toLowerCase());
                                results.push({ domain: domain, title: domain });
                            }
                        }
                    });
                    
                    // Also check for any visible fact-check cards
                    const hoverCards = document.querySelectorAll('fact-check-source-hovered-card');
                    hoverCards.forEach(card => {
                        const pathEl = card.querySelector('.source-path, [class*="source-path"]');
                        if (pathEl) {
                            const domain = (pathEl.innerText || pathEl.textContent || '').trim();
                            if (domain && domain.includes('.') && !domain.includes(' ') && !seenDomains.has(domain.toLowerCase())) {
                                seenDomains.add(domain.toLowerCase());
                                results.push({ domain: domain, title: domain });
                            }
                        }
                    });
                    
                    return results;
                }""")
                
                if carousel_sources:
                    for src in carousel_sources:
                        domain = src.get("domain", "")
                        if is_valid_domain(domain):
                            seen_domains.add(domain.lower())
                            url = f"https://{domain}"
                            if url not in seen_urls:
                                seen_urls.add(url)
                                sources.append({
                                    "url": url,
                                    "title": src.get("title", domain),
                                    "domain": domain,
                                })
                    
                    if len(carousel_sources) > 0:
                        log_engine(self.engine_name, f"Carousel JS extraction found {len(carousel_sources)} domains", "info")
            except Exception as e:
                log_engine(self.engine_name, f"Carousel JS extraction failed: {e}", "debug")
            
            # ====================================================================
            # METHOD 3: Get source chips (old grounding UI with clickable links)
            # ====================================================================
            chip_selector = self.extra_selectors["source_chip"]
            chips = root.locator(chip_selector).all()
            
            for chip in chips:
                try:
                    link = chip.locator("a").first
                    if link.count() > 0:
                        url = link.get_attribute("href") or ""
                        title = chip.inner_text().strip()
                        
                        # Only add if title looks like a valid source (not random text)
                        # Valid sources usually have domain-like titles or short phrases
                        if is_valid_url(url) and (
                            '.' in title or  # Contains domain
                            len(title) < 100  # Short title
                        ):
                            seen_urls.add(url)
                            sources.append({
                                "url": url,
                                "title": title if len(title) < 200 else self._extract_domain(url),
                                "domain": self._extract_domain(url),
                            })
                except:
                    pass
            
            # ====================================================================
            # METHOD 4: Extract hyperlinks from the response content
            # Only include links that look like actual citations (not random anchor text)
            # ====================================================================
            try:
                js_sources = root.evaluate("""el => {
                    const results = [];
                    const seenUrls = new Set();
                    
                    // Find all anchor elements with href starting with http
                    const anchors = el.querySelectorAll('a[href^="http"]');
                    anchors.forEach(anchor => {
                        const url = anchor.getAttribute('href') || '';
                        const text = (anchor.innerText || anchor.textContent || '').trim();
                        
                        // Skip Google infrastructure URLs
                        if (url.includes('google.com') || url.includes('googleapis.com') || 
                            url.includes('gstatic.com') || url.includes('googleusercontent.com')) {
                            return;
                        }
                        
                        // Validate the anchor looks like a citation, not random text
                        // Citations usually have:
                        // - A URL-like text (domain or short phrase)
                        // - Or numbered citations like [1], [2]
                        // - Or are within specific citation elements
                        const isLikelyCitation = (
                            text.length < 150 ||  // Short text
                            text.match(/^\[\d+\]$/) ||  // Numbered citation
                            anchor.closest('[class*="citation"], [class*="source"], [class*="reference"]')
                        );
                        
                        if (url && !seenUrls.has(url) && isLikelyCitation) {
                            seenUrls.add(url);
                            results.push({
                                url: url,
                                title: text.slice(0, 200)
                            });
                        }
                    });
                    
                    return results;
                }""")
                
                if js_sources:
                    for src in js_sources:
                        url = src.get("url", "")
                        title = src.get("title", "")
                        if is_valid_url(url):
                            seen_urls.add(url)
                            sources.append({
                                "url": url,
                                "title": title if title and len(title) < 150 else self._extract_domain(url),
                                "domain": self._extract_domain(url),
                            })
                    
                    if len(js_sources) > 0:
                        log_engine(self.engine_name, f"Hyperlink extraction found {len(js_sources)} links", "info")
            except Exception as e:
                log_engine(self.engine_name, f"Hyperlink extraction failed: {e}", "debug")
            
            # ====================================================================
            # METHOD 5: Get regular citation links scoped to this response
            # ====================================================================
            inline_sources = self._extract_inline_sources_scoped(root)
            for source in inline_sources:
                url = source.get("url", "")
                title = source.get("title", "")
                # Validate the title isn't just random text
                if is_valid_url(url) and (not title or len(title) < 200):
                    seen_urls.add(url)
                    sources.append(source)
            
            log_engine(self.engine_name, f"Total extracted sources: {len(sources)}", "debug")
            
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

