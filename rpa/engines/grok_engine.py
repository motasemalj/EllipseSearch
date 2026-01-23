"""
Grok Browser Engine for RPA.

Handles automation of grok.x.ai including:
- Prompt submission
- Response capture
- X/Twitter post extraction
- Web source extraction
"""

import time
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
        }
    
    def send_prompt(self, prompt: str) -> None:
        """Send a prompt to Grok."""
        # Check for X login requirement
        self._check_for_login()
        
        if self.human:
            self.human.think_pause()
        
        # Type the prompt
        success = self._type_text("prompt_input", prompt)
        
        if not success:
            raise RuntimeError("Could not find Grok input field")
        
        if self.human:
            self.human.micro_pause()
        
        # Submit
        self._submit_prompt()
    
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
        submitted = self._click_element("submit_button")
        
        if not submitted:
            self.page.keyboard.press("Enter")
    
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
        """Extract response from Grok."""
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
        
        # Extract sources (web + X posts)
        response.sources = self._extract_grok_sources()
        response.citation_count = len(response.sources)
        
        return response
    
    def _extract_grok_sources(self) -> List[Dict[str, str]]:
        """Extract sources from Grok including X posts."""
        sources = []
        
        # Extract X/Twitter posts
        x_posts = self._extract_x_posts()
        sources.extend(x_posts)
        
        # Extract web sources
        try:
            web_selector = self.extra_selectors["web_source"]
            web_sources = self.page.locator(web_selector).all()
            
            for source in web_sources:
                try:
                    link = source.locator("a").first
                    if link.count() > 0:
                        url = link.get_attribute("href") or ""
                        title = link.inner_text() or source.inner_text()
                        
                        if url and url.startswith("http"):
                            sources.append({
                                "url": url,
                                "title": title.strip(),
                                "domain": self._extract_domain(url),
                                "type": "web",
                            })
                except:
                    pass
            
            # Also get source preview cards
            preview_selector = self.extra_selectors["source_preview"]
            previews = self.page.locator(preview_selector).all()
            
            existing_urls = {s["url"] for s in sources}
            
            for preview in previews:
                try:
                    link = preview.locator("a").first
                    if link.count() > 0:
                        url = link.get_attribute("href") or ""
                        title = preview.inner_text().split("\n")[0]
                        
                        if url and url not in existing_urls:
                            sources.append({
                                "url": url,
                                "title": title.strip(),
                                "domain": self._extract_domain(url),
                                "type": "web",
                            })
                except:
                    pass
            
        except Exception as e:
            logger.debug(f"Error extracting web sources: {e}")
        
        return sources
    
    def _extract_x_posts(self) -> List[Dict[str, str]]:
        """Extract embedded X/Twitter posts."""
        x_sources = []
        
        try:
            x_selector = self.extra_selectors["x_post_embed"]
            posts = self.page.locator(x_selector).all()
            
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

