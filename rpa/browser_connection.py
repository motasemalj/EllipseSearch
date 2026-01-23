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
    
    def __init__(self, config: Optional[CDPConfig] = None):
        self.config = config or CDPConfig()
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
            
            # Get the default context (with all your cookies!)
            contexts = self.browser.contexts
            if contexts:
                self.context = contexts[0]
                logger.info(f"Connected! Found {len(contexts)} browser context(s)")
            else:
                # Create a new context if none exists
                self.context = self.browser.new_context()
                logger.warning("No existing context found, created new one (cookies may be missing)")
            
            self._connected = True
            log_success("Successfully connected to Chrome browser")
            
            # Log some session info
            self._log_session_info()
            
        except Exception as e:
            log_error(f"Failed to connect to Chrome: {e}")
            raise ConnectionError(
                f"Could not connect to Chrome at {self.config.cdp_url}. "
                "Make sure Chrome is running with: --remote-debugging-port=9222"
            )
    
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
    
    def get_or_create_page(self, engine: str) -> Page:
        """
        Get existing page for an engine or create a new one.
        
        Args:
            engine: Engine name (chatgpt, gemini, perplexity, grok)
            
        Returns:
            Page object for the engine
        """
        engine_url = ENGINE_URLS.get(engine, "")
        
        # Try to find existing page
        if engine_url:
            for page in self.context.pages:
                if engine_url.replace("https://", "").replace("http://", "").split("/")[0] in page.url:
                    logger.info(f"Found existing {engine} page")
                    return page
        
        # Create new page
        logger.info(f"Creating new page for {engine}")
        page = self.context.new_page()
        
        if engine_url:
            logger.info(f"Navigating to {engine_url}")
            page.goto(engine_url, wait_until="domcontentloaded", timeout=60000)
        
        return page
    
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
    
    try:
        response = requests.get("http://localhost:9222/json/version", timeout=2)
        return response.status_code == 200
    except:
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

