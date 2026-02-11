"""
Browser Connection Manager for RPA Automation.

Connects to an existing Chrome instance via Chrome DevTools Protocol (CDP).
This allows using your real browser session with existing cookies and authentication.

Usage:
    1. Start Chrome with remote debugging:
       chrome --remote-debugging-port=9222
       
    2. Connect from Python:
       from browser_connection import BrowserConnection
       
       with BrowserConnection() as browser:
           page = browser.get_active_page()
           page.goto("https://chatgpt.com")
"""

import time
import socket
from typing import Optional, List
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page, Playwright

from config import CDPConfig, ENGINE_URLS
from utils.logging import logger, log_success, log_error


class BrowserConnection:
    """
    Manages connection to an existing Chrome browser via CDP.
    
    This approach allows:
    - Using your existing cookies and sessions
    - Bypassing bot detection (you appear as a real user)
    - No need to log in again to AI platforms
    """
    
    def __init__(self, config: Optional[CDPConfig] = None, process_id: Optional[str] = None):
        self.config = config or CDPConfig()
        self.process_id = process_id  # Unique ID for this process
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self._connected = False
    
    def __enter__(self) -> "BrowserConnection":
        """Context manager entry."""
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit - cleanup."""
        self.disconnect()
    
    def connect(self) -> None:
        """
        Connect to the existing Chrome browser via CDP.
        
        Raises:
            ConnectionError: If Chrome is not running with debugging enabled
        """
        logger.info(f"Connecting to Chrome via CDP: {self.config.cdp_url}")
        
        try:
            self.playwright = sync_playwright().start()
            
            # Connect to existing browser via CDP
            self.browser = self.playwright.chromium.connect_over_cdp(
                self.config.cdp_url,
                timeout=self.config.connection_timeout * 1000
            )
            
            # Get or create context
            # For multiprocessing, we still use the default context to access existing pages
            # Each process will use the same context but different pages within it
            contexts = self.browser.contexts
            if contexts:
                # Use the default context (first one) - this has access to existing pages
                self.context = contexts[0]
                logger.info(f"Connected! Found {len(contexts)} browser context(s), using default context")
                logger.info(f"Default context has {len(self.context.pages)} existing page(s)")
            else:
                # Create a new context if none exists
                self.context = self.browser.new_context()
                logger.warning("No existing context found, created new one (cookies may be missing)")
            
            self._connected = True
            log_success("Successfully connected to Chrome browser")
            
            # Log some session info
            self._log_session_info()
            
        except Exception as e:
            error_msg = str(e)
            log_error(f"Failed to connect to Chrome: {error_msg}")
            
            # Provide more specific error messages
            if "ECONNREFUSED" in error_msg or "Connection refused" in error_msg:
                diagnostic = (
                    f"Connection refused at {self.config.cdp_url}. "
                    "Chrome may not be running with remote debugging enabled. "
                    "Run: ./start_chrome.sh"
                )
            elif "timeout" in error_msg.lower():
                diagnostic = (
                    f"Connection timeout to {self.config.cdp_url}. "
                    "Chrome may be starting up. Wait a few seconds and try again."
                )
            else:
                diagnostic = (
                    f"Could not connect to Chrome at {self.config.cdp_url}. "
                    "Make sure Chrome is running with: --remote-debugging-port=9222"
                )
            
            raise ConnectionError(diagnostic)
    
    def disconnect(self) -> None:
        """Disconnect from the browser (does NOT close Chrome)."""
        if self._connected:
            try:
                if self.playwright:
                    self.playwright.stop()
                self._connected = False
                logger.info("Disconnected from Chrome (browser remains open)")
            except Exception as e:
                logger.warning(f"Error during disconnect: {e}")
    
    def _log_session_info(self) -> None:
        """Log information about the connected session."""
        if self.context:
            pages = self.context.pages
            logger.info(f"Found {len(pages)} open tab(s)")
            
            for i, page in enumerate(pages):
                try:
                    url = page.url
                    title = page.title()
                    logger.debug(f"  Tab {i + 1}: {title[:50]}... ({url[:50]}...)")
                except:
                    pass
    
    @property
    def is_connected(self) -> bool:
        """Check if connected to browser."""
        return self._connected
    
    def get_active_page(self) -> Optional[Page]:
        """
        Get the currently active/visible page.
        
        Returns:
            The active Page object, or None if not connected
        """
        if not self.context:
            return None
        
        pages = self.context.pages
        if not pages:
            # Create a new page if none exists
            return self.context.new_page()
        
        # Return the first page (usually the active one)
        # In CDP, the last focused page is typically at the end
        return pages[-1] if pages else None
    
    def get_page_by_url(self, url_contains: str) -> Optional[Page]:
        """
        Find a page containing a specific URL pattern.
        
        Args:
            url_contains: String that should be in the page URL
            
        Returns:
            Page object if found, None otherwise
        """
        if not self.context:
            return None
        
        for page in self.context.pages:
            if url_contains.lower() in page.url.lower():
                return page
        
        return None
    
    def _normalize_domain(self, url: str) -> str:
        """
        Normalize a URL to extract the base domain for matching.
        
        Args:
            url: URL to normalize
            
        Returns:
            Normalized domain (e.g., "chatgpt.com", "gemini.google.com")
        """
        if not url or url == "about:blank":
            return ""
        
        # Remove protocol
        domain = url.replace("https://", "").replace("http://", "")
        
        # Remove path and query
        domain = domain.split("/")[0].split("?")[0]
        
        # Remove www. prefix for matching
        if domain.startswith("www."):
            domain = domain[4:]
        
        return domain.lower()
    
    def _url_matches_engine(self, url: str, engine_url: str) -> bool:
        """
        Check if a URL matches an engine URL.
        
        Args:
            url: Current page URL
            engine_url: Engine base URL
            
        Returns:
            True if URLs match (same domain)
        """
        if not url or url == "about:blank":
            return False
        
        # Normalize both URLs
        url_domain = self._normalize_domain(url)
        engine_domain = self._normalize_domain(engine_url)
        
        # Exact match
        if url_domain == engine_domain:
            return True
        
        # Check if engine domain is contained in URL domain (for subdomains)
        # e.g., "gemini.google.com" matches "gemini.google.com" or "www.gemini.google.com"
        if engine_domain in url_domain or url_domain in engine_domain:
            return True
        
        # Special cases for known variations
        engine_variations = {
            "chatgpt.com": ["chat.openai.com", "chatgpt.com"],
            "gemini.google.com": ["gemini.google.com", "bard.google.com"],
            "perplexity.ai": ["perplexity.ai", "www.perplexity.ai"],
            "grok.com": ["grok.com", "grok.x.ai", "x.ai"],
        }
        
        for base, variations in engine_variations.items():
            if base in engine_domain or any(v in engine_domain for v in variations):
                if any(v in url_domain for v in variations):
                    return True
        
        return False
    
    def get_or_create_page(self, engine: str) -> Page:
        """
        Get existing page for an engine or create a new one.
        Checks all browser contexts to find existing pages.
        
        Args:
            engine: Engine name (chatgpt, gemini, perplexity, grok)
            
        Returns:
            Page object for the engine
        """
        engine_url = ENGINE_URLS.get(engine, "")
        
        # Try to find existing page in ALL contexts, not just the current one
        if engine_url and self.browser:
            all_contexts = self.browser.contexts
            logger.info(f"🔍 Checking {len(all_contexts)} context(s) for existing {engine} page (looking for: {engine_url})...")
            
            # Check all contexts for existing pages
            for ctx_idx, context in enumerate(all_contexts):
                pages_count = len(context.pages)
                logger.info(f"  Context {ctx_idx + 1}: {pages_count} page(s)")
                
                for i, page in enumerate(context.pages):
                    try:
                        current_url = page.url
                        logger.info(f"    📄 Page {i+1}: {current_url[:80] if current_url else 'empty'}...")
                        
                        # Skip empty or about:blank pages
                        if not current_url or current_url == "about:blank":
                            logger.debug(f"      → Skipping (empty or about:blank)")
                            continue
                        
                        # Check if URL matches engine using improved matching
                        url_normalized = self._normalize_domain(current_url)
                        engine_normalized = self._normalize_domain(engine_url)
                        matches = self._url_matches_engine(current_url, engine_url)
                        
                        logger.info(f"      → Normalized: '{url_normalized}' vs '{engine_normalized}' → Match: {matches}")
                        
                        if matches:
                            logger.info(f"✓ Found existing {engine} page in context {ctx_idx + 1}: {current_url[:60]}...")
                            
                            # Ensure page is still valid and loaded
                            try:
                                # Quick check if page is still valid
                                _ = page.url  # This will raise if page is closed
                                logger.debug(f"      → Page is valid, checking load state...")
                                page.wait_for_load_state("domcontentloaded", timeout=5000)
                                logger.info(f"      → ✓ Using existing {engine} page (valid and loaded)")
                                
                                # Switch to this context if it's different
                                if context != self.context:
                                    logger.info(f"      → Switching to context {ctx_idx + 1} to use existing page")
                                    self.context = context
                                
                                return page
                            except Exception as e:
                                logger.warning(f"      → ✗ Existing {engine} page not responsive ({e}), continuing search...")
                                continue
                        else:
                            logger.debug(f"      → URL doesn't match {engine}")
                    except Exception as e:
                        logger.warning(f"    Page {i+1}: Error checking ({e})")
                        continue
            
            logger.info(f"  No matching {engine} page found in any context")
        
        # No existing page found, create new one in current context
        if not self.context:
            logger.warning("No browser context available, creating new context")
            if self.browser:
                self.context = self.browser.new_context()
            else:
                raise RuntimeError("Browser not connected")
        
        logger.info(f"Creating new page for {engine}")
        page = self.context.new_page()
        
        # No existing page found, create new one
        logger.info(f"Creating new page for {engine}")
        page = self.context.new_page()
        
        if engine_url:
            logger.info(f"Navigating to {engine_url}")
            try:
                # Use networkidle for better page readiness, but fallback to domcontentloaded
                page.goto(engine_url, wait_until="networkidle", timeout=60000)
            except:
                try:
                    # Fallback to domcontentloaded if networkidle times out
                    page.goto(engine_url, wait_until="domcontentloaded", timeout=60000)
                except Exception as e:
                    logger.warning(f"Navigation timeout, but continuing: {e}")
            
            # Additional wait for page to be fully interactive
            try:
                page.wait_for_load_state("domcontentloaded", timeout=10000)
                time.sleep(1)  # Small stabilization delay
            except:
                pass
        
        return page
    
    def _get_or_create_isolated_context(self) -> BrowserContext:
        """
        Get or create an isolated browser context for this process.
        Each process gets its own context to avoid conflicts in multiprocessing.
        
        Returns:
            Isolated BrowserContext for this process
        """
        if not self.browser:
            raise RuntimeError("Browser not connected")
        
        # Try to find existing context for this process
        # We'll use a naming convention: context_process_{process_id}
        context_name = f"rpa_context_{self.process_id}"
        
        # Check existing contexts (note: Playwright contexts don't have names,
        # so we'll create a new one each time for isolation)
        # In CDP mode, we can create new contexts that share cookies from the default context
        try:
            # Create a new isolated context
            # This will share cookies with the default context but be isolated for page management
            self.context = self.browser.new_context()
            logger.info(f"Created isolated context for process {self.process_id}")
            return self.context
        except Exception as e:
            logger.warning(f"Could not create isolated context, using default: {e}")
            # Fallback to default context
            contexts = self.browser.contexts
            if contexts:
                return contexts[0]
            else:
                return self.browser.new_context()
    
    def list_pages(self) -> List[dict]:
        """
        List all open pages/tabs.
        
        Returns:
            List of page info dictionaries
        """
        if not self.context:
            return []
        
        pages_info = []
        for i, page in enumerate(self.context.pages):
            try:
                pages_info.append({
                    "index": i,
                    "url": page.url,
                    "title": page.title(),
                })
            except:
                pages_info.append({
                    "index": i,
                    "url": "unknown",
                    "title": "unknown",
                })
        
        return pages_info


def get_chrome_launch_command() -> str:
    """
    Get the command to launch Chrome with remote debugging enabled.
    
    Returns:
        Command string for the current OS
    """
    import sys
    
    port = 9222
    
    if sys.platform == "darwin":  # macOS
        return f'/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port={port}'
    elif sys.platform == "win32":  # Windows
        return f'"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port={port}'
    else:  # Linux
        return f'google-chrome --remote-debugging-port={port}'


def check_chrome_debugging() -> bool:
    """
    Check if Chrome is running with remote debugging enabled.
    
    Returns:
        True if Chrome debugging is accessible
    """
    import requests
    
    # First, check if Chrome process is running with the flag
    import subprocess
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True,
            text=True,
            timeout=2
        )
        if "remote-debugging-port=9222" in result.stdout:
            logger.debug("Found Chrome process with remote-debugging-port=9222")
        else:
            logger.debug("No Chrome process found with remote-debugging-port=9222")
    except:
        pass
    
    # Try multiple times with increasing timeout
    for attempt in range(5):  # More attempts
        try:
            response = requests.get("http://localhost:9222/json/version", timeout=5)
            if response.status_code == 200:
                return True
            else:
                logger.debug(f"Chrome debugging check returned status {response.status_code}")
        except requests.exceptions.ConnectionError as e:
            if attempt < 4:  # Don't log on last attempt
                logger.debug(f"Chrome debugging connection attempt {attempt + 1} failed: {e}")
            time.sleep(1)  # Longer delay between attempts
        except requests.exceptions.Timeout:
            if attempt < 4:
                logger.debug(f"Chrome debugging timeout on attempt {attempt + 1}")
            time.sleep(1)
        except Exception as e:
            logger.debug(f"Chrome debugging check error: {e}")
            time.sleep(1)
    
    # Final diagnostic check - try the list endpoint
    try:
        response = requests.get("http://localhost:9222/json", timeout=3)
        if response.status_code == 200:
            logger.debug("CDP /json endpoint accessible but /json/version failed")
            return True
    except:
        pass
    
    # Last resort: try to connect directly with Playwright
    # This sometimes works even if HTTP endpoint doesn't respond
    try:
        from playwright.sync_api import sync_playwright
        playwright = sync_playwright().start()
        try:
            browser = playwright.chromium.connect_over_cdp("http://localhost:9222", timeout=5000)
            if browser:
                browser.close()
                playwright.stop()
                logger.debug("CDP connection successful via Playwright")
                return True
        except:
            playwright.stop()
    except Exception as e:
        logger.debug(f"Playwright CDP test failed: {e}")
    
    return False


def wait_for_chrome(timeout: int = 30) -> bool:
    """
    Wait for Chrome debugging to become available.
    
    Args:
        timeout: Maximum seconds to wait
        
    Returns:
        True if Chrome became available
    """
    logger.info(f"Waiting for Chrome debugging on port 9222 (timeout: {timeout}s)")
    
    start = time.time()
    while time.time() - start < timeout:
        if check_chrome_debugging():
            log_success("Chrome debugging is ready!")
            return True
        time.sleep(1)
    
    return False


def diagnose_chrome_connection() -> dict:
    """
    Run diagnostics to help troubleshoot Chrome connection issues.
    
    Returns:
        Dictionary with diagnostic information
    """
    import requests
    import socket
    
    diagnostics = {
        "port_9222_open": False,
        "cdp_version_endpoint": False,
        "cdp_list_endpoint": False,
        "error": None,
    }
    
    # Check if port is open
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex(('localhost', 9222))
        sock.close()
        diagnostics["port_9222_open"] = (result == 0)
    except Exception as e:
        diagnostics["error"] = str(e)
    
    # Check CDP version endpoint
    try:
        response = requests.get("http://localhost:9222/json/version", timeout=3)
        diagnostics["cdp_version_endpoint"] = (response.status_code == 200)
        if response.status_code == 200:
            try:
                version_data = response.json()
                diagnostics["chrome_version"] = version_data.get("Browser", "unknown")
            except:
                pass
    except Exception as e:
        diagnostics["cdp_version_error"] = str(e)
    
    # Check CDP list endpoint
    try:
        response = requests.get("http://localhost:9222/json", timeout=3)
        diagnostics["cdp_list_endpoint"] = (response.status_code == 200)
        if response.status_code == 200:
            try:
                tabs = response.json()
                diagnostics["open_tabs"] = len(tabs) if isinstance(tabs, list) else 0
            except:
                pass
    except Exception as e:
        diagnostics["cdp_list_error"] = str(e)
    
    return diagnostics

