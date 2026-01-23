"""
Platform API Client for EllipseSearch

Fetches prompts and brand data directly from the EllipseSearch platform,
eliminating the need for manual CSV files.
"""

import os
import requests
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

from utils.logging import logger, log_success, log_error


@dataclass
class PlatformPrompt:
    """A prompt fetched from the platform."""
    id: str
    text: str
    brand_id: str
    brand_domain: str
    brand_name: str


class PlatformAPI:
    """
    Client for fetching data from the EllipseSearch platform.
    
    Usage:
        api = PlatformAPI(
            base_url="http://localhost:3000",
            api_token="your_token"
        )
        
        prompts = api.get_prompts(brand_id="xxx")
    """
    
    def __init__(
        self,
        base_url: str,
        api_token: Optional[str] = None,
        webhook_secret: Optional[str] = None
    ):
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.webhook_secret = webhook_secret
    
    @property
    def _headers(self) -> Dict[str, str]:
        """Get request headers with authentication."""
        headers = {"Content-Type": "application/json"}
        
        if self.api_token:
            headers["Authorization"] = f"Bearer {self.api_token}"
        elif self.webhook_secret:
            headers["Authorization"] = f"Bearer {self.webhook_secret}"
        
        return headers
    
    def get_prompts(
        self,
        brand_id: str,
        prompt_set_id: Optional[str] = None,
        engines: Optional[List[str]] = None
    ) -> List[PlatformPrompt]:
        """
        Fetch prompts from the platform for a specific brand.
        
        Args:
            brand_id: The brand UUID
            prompt_set_id: Optional prompt set to filter by
            engines: Optional list of engines (creates one prompt per engine)
            
        Returns:
            List of PlatformPrompt objects
        """
        # Build URL with query params
        url = f"{self.base_url}/api/analysis/export-for-rpa"
        params = {"brand_id": brand_id}
        
        if prompt_set_id:
            params["prompt_set_id"] = prompt_set_id
        
        if engines:
            params["engines"] = ",".join(engines)
        
        try:
            response = requests.get(
                url,
                params=params,
                headers=self._headers,
                timeout=30
            )
            
            if response.status_code == 401:
                log_error("Authentication failed. Check your API token.")
                return []
            
            if response.status_code == 404:
                log_error(f"Brand or prompts not found: {brand_id}")
                return []
            
            if response.status_code != 200:
                log_error(f"API error: {response.status_code} - {response.text[:200]}")
                return []
            
            # Parse CSV response
            csv_content = response.text
            prompts = self._parse_csv(csv_content)
            
            log_success(f"Fetched {len(prompts)} prompts from platform")
            return prompts
            
        except requests.exceptions.ConnectionError:
            log_error(f"Cannot connect to platform at {self.base_url}")
            return []
        except Exception as e:
            log_error(f"Failed to fetch prompts: {e}")
            return []
    
    def _parse_csv(self, csv_content: str) -> List[PlatformPrompt]:
        """Parse CSV content into PlatformPrompt objects."""
        prompts = []
        lines = csv_content.strip().split("\n")
        
        if len(lines) < 2:
            return prompts
        
        # Skip header
        for line in lines[1:]:
            try:
                # Handle quoted fields
                parts = self._parse_csv_line(line)
                if len(parts) >= 6:
                    prompts.append(PlatformPrompt(
                        id=parts[0],
                        text=parts[1],
                        brand_id=parts[3],
                        brand_domain=parts[4],
                        brand_name=parts[5],
                    ))
            except Exception as e:
                logger.debug(f"Failed to parse CSV line: {e}")
        
        return prompts
    
    def _parse_csv_line(self, line: str) -> List[str]:
        """Parse a single CSV line, handling quoted fields."""
        parts = []
        current = ""
        in_quotes = False
        
        for char in line:
            if char == '"':
                in_quotes = not in_quotes
            elif char == ',' and not in_quotes:
                parts.append(current.strip('"'))
                current = ""
            else:
                current += char
        
        parts.append(current.strip('"'))
        return parts
    
    def get_brands(self) -> List[Dict[str, Any]]:
        """
        Fetch all brands the user has access to.
        
        Returns:
            List of brand dictionaries
        """
        url = f"{self.base_url}/api/brands"
        
        try:
            response = requests.get(
                url,
                headers=self._headers,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                brands = data.get("brands", [])
                log_success(f"Found {len(brands)} brands")
                return brands
            else:
                log_error(f"Failed to fetch brands: {response.status_code}")
                return []
                
        except Exception as e:
            log_error(f"Failed to fetch brands: {e}")
            return []


def create_api_from_env() -> Optional[PlatformAPI]:
    """
    Create a PlatformAPI instance from environment variables.
    
    Required env vars:
    - PLATFORM_URL: Base URL of EllipseSearch platform
    - RPA_WEBHOOK_SECRET or PLATFORM_API_TOKEN: Authentication
    
    Returns:
        PlatformAPI if configured, None otherwise
    """
    base_url = os.getenv("PLATFORM_URL")
    api_token = os.getenv("PLATFORM_API_TOKEN")
    webhook_secret = os.getenv("RPA_WEBHOOK_SECRET")
    
    if not base_url:
        logger.warning("PLATFORM_URL not set - cannot fetch from platform")
        return None
    
    if not api_token and not webhook_secret:
        logger.warning("No authentication configured - set PLATFORM_API_TOKEN or RPA_WEBHOOK_SECRET")
        return None
    
    return PlatformAPI(
        base_url=base_url,
        api_token=api_token,
        webhook_secret=webhook_secret
    )

