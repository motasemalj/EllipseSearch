"""
Grok Browser Engine for RPA.

Handles automation of grok.x.ai including:
- Prompt submission
- Response capture
- X/Twitter post extraction
- Web source extraction
"""

import time
import re
from typing import Optional, List, Dict
from playwright.sync_api import Page

from .base_engine import BaseEngine, EngineResponse
from utils.logging import logger, log_engine


class GrokEngine(BaseEngine):
    """
    Grok browser automation engine.
    
    Works with xAI's Grok web interface.
    Handles X/Twitter integration and real-time data.
    """
    
    def __init__(self):
        super().__init__("grok")
        
        # Track response count to isolate current response (avoid extracting older responses)
        self._response_count_before_prompt = 0
        
        # Grok-specific selectors
        self.extra_selectors = {
            "x_post_embed": ".x-post-embed, [class*='tweet-embed'], [class*='post-embed']",
            "x_post_author": "[class*='author'], [class*='username']",
            "x_post_text": "[class*='tweet-text'], [class*='post-text']",
            "x_post_metrics": "[class*='metrics'], [class*='engagement']",
            "web_source": "[class*='web-source'], [class*='source-link']",
            "source_preview": ".source-preview, [class*='source-card']",
            "trending_section": "[class*='trending']",
            "trending_topic": "[class*='trend-item']",
            "mode_selector": "[class*='mode-selector']",
            "mode_option": "[class*='mode-option']",
            "x_login_button": "a[href*='twitter.com'], [class*='login-with-x']",
            # New Grok UI (2026): sources are in a sidebar panel
            "sources_button": "[class*='sources'], div:has-text('sources')",
            "sources_sidebar": "aside",
            "source_link_in_sidebar": "aside a[href^='http']",
        }
    
    def _count_existing_responses(self) -> None:
        """Count existing Grok responses before sending a new prompt."""
        try:
            # Count response containers - Grok uses div.response-content-markdown
            count = self.page.locator("div.response-content-markdown, div.markdown").count()
            self._response_count_before_prompt = int(count)
            log_engine(self.engine_name, f"Existing responses: {self._response_count_before_prompt}", "debug")
        except Exception as e:
            logger.debug(f"Failed to count existing responses: {e}")
            self._response_count_before_prompt = 0
    
    def send_prompt(self, prompt: str) -> None:
        """Send a prompt to Grok."""
        # Ensure page is ready
        self._ensure_page_ready()
        
        # Check for X login requirement
        self._check_for_login()
        
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
            raise RuntimeError("Could not find Grok input field after multiple attempts")
        
        if self.human:
            self.human.micro_pause()
        
        # Submit
        self._submit_prompt()
    
    def _ensure_page_ready(self) -> None:
        """Ensure Grok page is fully loaded and ready."""
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
    
    def _check_for_login(self) -> None:
        """Check if X login is required."""
        try:
            login_button = self.page.locator(self.extra_selectors["x_login_button"])
            if login_button.count() > 0 and login_button.first.is_visible(timeout=1000):
                log_engine(
                    self.engine_name,
                    "X/Twitter login may be required for full features",
                    "warning"
                )
        except:
            pass
    
    def _submit_prompt(self) -> None:
        """Submit the prompt."""
        # Per request: prefer Enter over clicking send (UI changes often)
        # Ensure the editor/input is focused, then press Enter.
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
        
        # Try Enter, then fall back to Ctrl/Cmd+Enter (some editors treat Enter as newline)
        try:
            self.page.keyboard.press("Enter")
            time.sleep(0.2)
        except:
            pass
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
        """Wait for Grok to finish responding."""
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
        
        # Wait for X posts to embed if any
        self._wait_for_x_posts()
        
        # Stabilization
        time.sleep(1)
    
    def _wait_for_x_posts(self, timeout: int = 3) -> None:
        """Wait for X/Twitter posts to embed."""
        x_post_selector = self.extra_selectors["x_post_embed"]
        
        try:
            self.page.wait_for_selector(
                x_post_selector,
                state="visible",
                timeout=timeout * 1000
            )
            log_engine(self.engine_name, "X posts detected", "debug")
        except:
            pass
    
    def extract_response(self) -> EngineResponse:
        """Extract response from Grok with enhanced fallbacks for 2026 UI."""
        response = EngineResponse(engine=self.engine_name)
        
        response_selector = self.selectors.get("response_container", "")
        response_text_selector = self.selectors.get("response_text", "")
        
        try:
            best = None
            
            # Method 1: Primary - div.response-content-markdown (Grok 2026 UI)
            # Use response count to get only the NEW response, not previous ones
            markdown_containers = self.page.locator("div.response-content-markdown").all()
            log_engine(self.engine_name, f"Found {len(markdown_containers)} div.response-content-markdown containers, tracking {self._response_count_before_prompt} before prompt", "debug")
            
            if markdown_containers and len(markdown_containers) > self._response_count_before_prompt:
                # Get the first NEW response (the one we just triggered)
                best = markdown_containers[self._response_count_before_prompt]
                log_engine(self.engine_name, f"Using response-content-markdown container #{self._response_count_before_prompt}", "debug")
            elif markdown_containers:
                best = markdown_containers[-1]
                log_engine(self.engine_name, f"Using last response-content-markdown container (fallback)", "debug")
            
            # Method 2: Fallback to div.markdown
            if not best:
                markdown_div = self.page.locator("div.markdown").all()
                log_engine(self.engine_name, f"Found {len(markdown_div)} div.markdown containers", "debug")
                if markdown_div and len(markdown_div) > self._response_count_before_prompt:
                    best = markdown_div[self._response_count_before_prompt]
                elif markdown_div:
                    best = markdown_div[-1]
                    log_engine(self.engine_name, f"Using div.markdown fallback", "debug")
            
            # Method 3: Fallback to configured selector
            if not best:
                containers = self.page.locator(response_selector).all()
                log_engine(self.engine_name, f"Found {len(containers)} configured containers", "debug")
                if containers:
                    best = containers[-1]
                    log_engine(self.engine_name, f"Using configured selector", "debug")
            
            # Method 4: Last resort fallback selectors
            if not best:
                fallback_selectors = [
                    "[class*='response-content']",
                    "[class*='message-content']",
                    "[class*='prose']",
                    "main [class*='response']",
                ]
                
                for fallback in fallback_selectors:
                    containers = self.page.locator(fallback).all()
                    if containers:
                        best = containers[-1]
                        log_engine(self.engine_name, f"Using last resort selector '{fallback}'", "debug")
                        break
            
            # Method 5: Last resort - main content
            if not best:
                try:
                    main_content = self.page.locator("main").inner_text()
                    if main_content and len(main_content) > 100:
                        response.response_text = main_content
                        response.response_html = self.page.locator("main").inner_html()
                        response.success = True
                        log_engine(self.engine_name, f"Extracted from main content: {len(response.response_text)} chars", "warning")
                        return response
                except:
                    pass
                
                response.error_message = "No response containers found with any selector"
                log_engine(self.engine_name, response.error_message, "error")
                return response
            
            # Extract HTML
            html_content = best.inner_html()
            log_engine(self.engine_name, f"Extracted HTML: {len(html_content)} chars", "debug")
            
            # Extract text - the Grok response has p, ul, ol, h3, table elements directly in the container
            text_content = best.inner_text()
            log_engine(self.engine_name, f"Extracted text: {len(text_content)} chars", "debug")
            
            # Validate we got meaningful content
            if len(text_content.strip()) < 20:
                log_engine(self.engine_name, f"Response text too short ({len(text_content)} chars)", "warning")
            
            response.response_html = html_content
            response.response_text = text_content
            response.success = len(text_content.strip()) > 20
            
            if response.success:
                log_engine(self.engine_name, f"✓ Extracted: {len(html_content)} chars HTML, {len(text_content)} chars text")
            else:
                response.error_message = f"Response too short: {len(text_content)} chars"
                log_engine(self.engine_name, response.error_message, "warning")
            
        except Exception as e:
            response.error_message = f"Failed to extract response: {e}"
            log_engine(self.engine_name, response.error_message, "error")
            return response
        
        # Extract sources (web + X posts) - SCOPED to the current response
        response.sources = self._extract_grok_sources(scope=best)
        response.citation_count = len(response.sources)
        
        return response
    
    def _choose_source_scope(self, root) -> object:
        """
        Grok sources button is often a sibling of the response container, not inside it.
        We walk up ancestors to find a scope that contains both the response and the sources button.
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
        for cand in candidates:
            try:
                # Look for sources button indicator within this candidate
                sources_indicator = cand.locator("div.truncate").filter(
                    has_text=re.compile(r'\d+\s*sources?', re.IGNORECASE)
                ).count()
                response_count = cand.locator("div.response-content-markdown, div.markdown").count()
                # Penalize scopes with multiple responses (likely includes older answers)
                score = int(sources_indicator) * 10 - max(0, int(response_count) - 1) * 5
                if score > best_score:
                    best_score = score
                    best = cand
            except Exception:
                continue
        return best
    
    def _extract_grok_sources(self, scope=None) -> List[Dict[str, str]]:
        """
        Extract sources from Grok including X posts and sources from the sidebar panel.
        
        Args:
            scope: The response container to scope the extraction to (to avoid extracting
                   sources from previous responses in the same chat)
        """
        sources = []
        seen_urls = set()
        
        # Domains to exclude (Grok/X infrastructure)
        exclude_domains = [
            "grok.com",
            "x.com",
            "twitter.com",
            "twimg.com",
            "google.com",  # favicon URLs
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
        
        # Determine the scope for source extraction
        # The sources button is often a sibling of the response, so we need to find a parent
        # that contains both the response and the sources button
        if scope is not None:
            search_scope = self._choose_source_scope(scope)
        else:
            search_scope = self.page
        
        # Extract X/Twitter posts - scope to current response if possible
        x_posts = self._extract_x_posts(scope=scope)
        for post in x_posts:
            url = post.get("url", "")
            if url:
                seen_urls.add(url)
            clean_post = {
                "url": post.get("url", ""),
                "title": post.get("title", ""),
                "domain": post.get("domain", ""),
            }
            sources.append(clean_post)
        
        # ====================================================================
        # METHOD 1: Click the "X sources" button to open sidebar and extract links
        # The sources button looks like: <div class="truncate">70 sources</div>
        # IMPORTANT: Find the button SCOPED to the current response's context
        # ====================================================================
        sidebar_opened = False
        try:
            sources_button = None
            
            # Try to find the sources button within the search scope (response context)
            try:
                btn = search_scope.locator("div.truncate").filter(
                    has_text=re.compile(r'^\d+\s*sources?$', re.IGNORECASE)
                ).first
                if btn.count() > 0 and btn.is_visible(timeout=500):
                    sources_button = btn
                    log_engine(self.engine_name, "Found sources button within response scope", "debug")
            except Exception:
                pass
            
            # Fallback: look in the page but try to find the one nearest to our response
            if not sources_button:
                try:
                    # Get all sources buttons
                    all_buttons = self.page.locator("div.truncate").filter(
                        has_text=re.compile(r'^\d+\s*sources?$', re.IGNORECASE)
                    ).all()
                    
                    # Use the last one if we have multiple (most recent response)
                    # But only if count matches what we expect
                    if all_buttons:
                        # Get the button index that corresponds to our response
                        expected_index = self._response_count_before_prompt
                        if expected_index < len(all_buttons):
                            sources_button = all_buttons[expected_index]
                            log_engine(self.engine_name, f"Using sources button #{expected_index} (scoped to current response)", "debug")
                        else:
                            sources_button = all_buttons[-1]
                            log_engine(self.engine_name, "Using last sources button (fallback)", "debug")
                except Exception:
                    pass
            
            if sources_button and sources_button.count() > 0:
                try:
                    sources_button.click(timeout=2000)
                    time.sleep(1)  # Wait for sidebar to open
                    sidebar_opened = True
                    log_engine(self.engine_name, "Clicked sources button to open sidebar", "debug")
                except Exception as click_err:
                    log_engine(self.engine_name, f"Could not click sources button: {click_err}", "debug")
        except Exception as e:
            log_engine(self.engine_name, f"Could not find sources button: {e}", "debug")
        
        # ====================================================================
        # METHOD 2: Extract links from the sidebar (aside element)
        # The sidebar shows sources for the CURRENT response when opened from its button
        # ====================================================================
        if sidebar_opened:
            try:
                sidebar_sources = self.page.evaluate("""() => {
                    const results = [];
                    const seenUrls = new Set();
                    
                    // Look for the sources sidebar (aside element)
                    const sidebars = document.querySelectorAll('aside');
                    sidebars.forEach(sidebar => {
                        // Find all source links in the sidebar
                        const links = sidebar.querySelectorAll('a[href^="http"]');
                        links.forEach(link => {
                            const url = link.getAttribute('href') || '';
                            // Skip favicon URLs and internal links
                            if (url.includes('google.com/s2/favicons') || url.includes('grok.com') || url.includes('x.com')) {
                                return;
                            }
                            if (url && !seenUrls.has(url)) {
                                seenUrls.add(url);
                                // Get title from the link's text content
                                const titleEl = link.querySelector('.font-semibold, [class*="font-semibold"]');
                                const title = titleEl 
                                    ? (titleEl.innerText || titleEl.textContent || '').trim()
                                    : (link.innerText || link.textContent || '').trim();
                                
                                // Get domain from the link's domain indicator
                                const domainEl = link.querySelector('.text-secondary, [class*="text-secondary"]');
                                const domainText = domainEl 
                                    ? (domainEl.innerText || domainEl.textContent || '').trim()
                                    : '';
                                
                                results.push({
                                    url: url,
                                    title: title.slice(0, 200),
                                    domain: domainText || ''
                                });
                            }
                        });
                    });
                    
                    return results;
                }""")
                
                if sidebar_sources:
                    for src in sidebar_sources:
                        url = src.get("url", "")
                        title = src.get("title", "")
                        domain = src.get("domain", "")
                        if is_valid_url(url):
                            seen_urls.add(url)
                            sources.append({
                                "url": url,
                                "title": title or self._extract_domain(url),
                                "domain": domain or self._extract_domain(url),
                            })
                    
                    if len(sidebar_sources) > 0:
                        log_engine(self.engine_name, f"Sidebar extraction found {len(sidebar_sources)} links", "info")
            except Exception as e:
                log_engine(self.engine_name, f"Sidebar extraction failed: {e}", "debug")
            
            # Close the sidebar
            try:
                self.page.keyboard.press("Escape")
                time.sleep(0.2)
            except Exception:
                pass
        
        # ====================================================================
        # METHOD 3: Extract from favicon domain indicators SCOPED to current response
        # These show the sources even when the sidebar isn't open
        # ====================================================================
        try:
            # Use the scoped element to find favicons
            if scope is not None:
                favicon_sources = scope.evaluate("""el => {
                    const results = [];
                    const seenDomains = new Set();
                    
                    // Find favicon images within this element's parent context
                    let searchEl = el;
                    // Walk up a few parents to find the conversation turn container
                    for (let i = 0; i < 5 && searchEl.parentElement; i++) {
                        searchEl = searchEl.parentElement;
                        // Stop if we find a container that looks like a conversation turn
                        if (searchEl.querySelector('div.truncate')) {
                            break;
                        }
                    }
                    
                    const faviconContainers = searchEl.querySelectorAll('img[src*="google.com/s2/favicons"]');
                    faviconContainers.forEach(img => {
                        const src = img.getAttribute('src') || '';
                        const domainMatch = src.match(/domain=([^&]+)/);
                        if (domainMatch) {
                            const domain = domainMatch[1];
                            if (!seenDomains.has(domain)) {
                                seenDomains.add(domain);
                                results.push({
                                    url: 'https://' + domain,
                                    title: domain,
                                    domain: domain
                                });
                            }
                        }
                    });
                    
                    return results;
                }""")
                
                if favicon_sources:
                    for src in favicon_sources:
                        url = src.get("url", "")
                        if is_valid_url(url):
                            seen_urls.add(url)
                            sources.append({
                                "url": url,
                                "title": src.get("title", "") or self._extract_domain(url),
                                "domain": src.get("domain", "") or self._extract_domain(url),
                            })
                    
                    log_engine(self.engine_name, f"Favicon extraction found {len(favicon_sources)} domains", "debug")
        except Exception as e:
            log_engine(self.engine_name, f"Favicon extraction failed: {e}", "debug")
        
        # ====================================================================
        # METHOD 4 (Fallback): Extract web sources from old UI elements
        # ====================================================================
        try:
            base = scope if scope is not None else self.page
            web_selector = self.extra_selectors["web_source"]
            web_sources = base.locator(web_selector).all()
            
            for source in web_sources:
                try:
                    link = source.locator("a").first
                    if link.count() > 0:
                        url = link.get_attribute("href") or ""
                        title = link.inner_text() or source.inner_text()
                        
                        if is_valid_url(url):
                            seen_urls.add(url)
                            sources.append({
                                "url": url,
                                "title": title.strip(),
                                "domain": self._extract_domain(url),
                            })
                except:
                    pass
            
            # Also get source preview cards
            preview_selector = self.extra_selectors["source_preview"]
            previews = base.locator(preview_selector).all()
            
            for preview in previews:
                try:
                    link = preview.locator("a").first
                    if link.count() > 0:
                        url = link.get_attribute("href") or ""
                        title = preview.inner_text().split("\n")[0]
                        
                        if is_valid_url(url):
                            seen_urls.add(url)
                            sources.append({
                                "url": url,
                                "title": title.strip(),
                                "domain": self._extract_domain(url),
                            })
                except:
                    pass
            
        except Exception as e:
            logger.debug(f"Error extracting web sources: {e}")
        
        log_engine(self.engine_name, f"Total sources extracted: {len(sources)}", "debug")
        return sources
    
    def _extract_x_posts(self, scope=None) -> List[Dict[str, str]]:
        """
        Extract embedded X/Twitter posts.
        
        Args:
            scope: The response container to scope the extraction to
        """
        x_sources = []
        
        try:
            base = scope if scope is not None else self.page
            x_selector = self.extra_selectors["x_post_embed"]
            posts = base.locator(x_selector).all()
            
            for post in posts:
                try:
                    # Get author
                    author_el = post.locator(self.extra_selectors["x_post_author"]).first
                    author = author_el.inner_text() if author_el.count() > 0 else ""
                    
                    # Get post text
                    text_el = post.locator(self.extra_selectors["x_post_text"]).first
                    post_text = text_el.inner_text() if text_el.count() > 0 else ""
                    
                    # Get post URL
                    link = post.locator("a[href*='x.com'], a[href*='twitter.com']").first
                    post_url = link.get_attribute("href") if link.count() > 0 else ""
                    
                    if post_text or author:
                        x_sources.append({
                            "url": post_url or "",
                            "title": f"@{author}: {post_text[:100]}..." if len(post_text) > 100 else f"@{author}: {post_text}",
                            "domain": "x.com",
                            "type": "x_post",
                            "author": author,
                            "text": post_text,
                        })
                except:
                    pass
                    
        except Exception as e:
            logger.debug(f"Error extracting X posts: {e}")
        
        return x_sources
    
    def set_mode(self, mode: str) -> bool:
        """
        Set Grok mode (Fun or Accurate).
        
        Args:
            mode: "fun" or "accurate"
            
        Returns:
            True if successful
        """
        try:
            mode_selector = self.page.locator(self.extra_selectors["mode_selector"])
            
            if mode_selector.count() > 0 and mode_selector.is_visible():
                mode_selector.click()
                time.sleep(0.3)
                
                mode_option = self.page.locator(f"{self.extra_selectors['mode_option']}:has-text('{mode}')").first
                if mode_option.count() > 0:
                    mode_option.click()
                    log_engine(self.engine_name, f"Set mode: {mode}")
                    return True
        except:
            pass
        
        return False
    
    def get_trending_topics(self) -> List[str]:
        """
        Get trending topics from Grok.
        
        Returns:
            List of trending topic strings
        """
        topics = []
        
        try:
            trend_selector = self.extra_selectors["trending_topic"]
            elements = self.page.locator(trend_selector).all()
            
            for el in elements[:10]:  # Limit to 10
                text = el.inner_text().strip()
                if text and len(text) > 2:
                    topics.append(text)
        except:
            pass
        
        return topics

