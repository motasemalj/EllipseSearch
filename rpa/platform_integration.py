"""
Platform Integration for EllipseSearch AEO

This module handles the integration between the Python RPA automation
and the main EllipseSearch AEO platform via the API endpoints.

Features:
- Create analysis batch before running
- Send results to the platform for storage and analysis
- Get selection signal analysis run on RPA results
- Track visibility and get recommendations
"""

import requests
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime

from utils.logging import logger, log_success, log_error


@dataclass
class PlatformConfig:
    """Configuration for platform integration."""
    
    # Base URL of the EllipseSearch platform
    base_url: str
    
    # API secret for RPA webhook authentication
    webhook_secret: str
    
    # Brand ID to analyze
    brand_id: str
    
    # Language and region settings
    language: str = "en"
    region: str = "global"
    
    # Request timeout
    timeout: int = 30


class PlatformIntegration:
    """
    Handles integration with the EllipseSearch AEO platform.
    
    This class sends RPA results to the platform API, which then:
    1. Stores results in the simulations database
    2. Runs AI selection signal analysis
    3. Generates AEO recommendations
    4. Updates visibility metrics
    
    Usage:
        integration = PlatformIntegration(
            base_url="https://your-aeo-platform.com",
            webhook_secret="your_secret",
            brand_id="brand_123"
        )
        
        # Create batch before running prompts
        batch_id = integration.create_batch(prompt_ids, engines)
        
        # Send each result as it completes
        integration.send_result(result, batch_id)
        
        # Finalize when done
        integration.complete_run(summary, batch_id)
    """
    
    def __init__(self, config: PlatformConfig):
        self.config = config
        self.batch_id: Optional[str] = None
        self.run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    @property
    def _headers(self) -> Dict[str, str]:
        """Get request headers with authentication."""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.config.webhook_secret}",
        }
    
    @property
    def _ingest_url(self) -> str:
        """Get the RPA ingest API URL."""
        return f"{self.config.base_url}/api/analysis/rpa-ingest"
    
    def create_batch(
        self,
        prompt_ids: List[str],
        engines: List[str]
    ) -> Optional[str]:
        """
        Create an analysis batch on the platform before running prompts.
        
        This registers the RPA run with the platform so results can be tracked.
        
        Args:
            prompt_ids: List of prompt IDs to process
            engines: List of engines to use
            
        Returns:
            Batch ID if successful, None otherwise
        """
        try:
            payload = {
                "brand_id": self.config.brand_id,
                "prompt_ids": prompt_ids,
                "engines": engines,
                "language": self.config.language,
                "region": self.config.region,
                "run_id": self.run_id,
            }
            
            response = requests.put(
                self._ingest_url,
                json=payload,
                headers=self._headers,
                timeout=self.config.timeout
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.batch_id = data.get("batch_id")
                log_success(f"Created platform batch: {self.batch_id}")
                return self.batch_id
            else:
                log_error(f"Failed to create batch: {response.status_code} - {response.text[:200]}")
                return None
                
        except Exception as e:
            log_error(f"Failed to create batch: {e}")
            return None
    
    def send_result(
        self,
        result: Dict[str, Any],
        batch_id: Optional[str] = None
    ) -> bool:
        """
        Send a single prompt result to the platform for storage and analysis.
        
        The platform will:
        1. Store the result in the simulations table
        2. Run selection signal analysis using OpenAI
        3. Check brand visibility
        4. Generate recommendations
        
        Args:
            result: The prompt result dictionary
            batch_id: Optional batch ID (uses self.batch_id if not provided)
            
        Returns:
            True if successful
        """
        try:
            payload = {
                "event": "prompt_completed",
                "run_id": self.run_id,
                "result": result,
                "timestamp": datetime.now().isoformat(),
                
                # Metadata for storage
                "brand_id": self.config.brand_id,
                "analysis_batch_id": batch_id or self.batch_id,
                "language": self.config.language,
                "region": self.config.region,
            }
            
            response = requests.post(
                self._ingest_url,
                json=payload,
                headers=self._headers,
                timeout=self.config.timeout
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                logger.debug(f"Result sent: simulation_id={data.get('simulation_id')}, visible={data.get('is_visible')}")
                return True
            else:
                logger.warning(f"Failed to send result: {response.status_code}")
                return False
                
        except Exception as e:
            log_error(f"Failed to send result: {e}")
            return False
    
    def complete_run(
        self,
        summary: Dict[str, Any],
        batch_id: Optional[str] = None
    ) -> bool:
        """
        Notify the platform that the RPA run is complete.
        
        Args:
            summary: Run summary with totals and visibility stats
            batch_id: Optional batch ID
            
        Returns:
            True if successful
        """
        try:
            payload = {
                "event": "run_completed",
                "run_id": self.run_id,
                "summary": summary,
                "timestamp": datetime.now().isoformat(),
                "brand_id": self.config.brand_id,
                "analysis_batch_id": batch_id or self.batch_id,
            }
            
            response = requests.post(
                self._ingest_url,
                json=payload,
                headers=self._headers,
                timeout=self.config.timeout
            )
            
            if response.status_code in [200, 201]:
                log_success("Run completion sent to platform")
                return True
            else:
                logger.warning(f"Failed to send completion: {response.status_code}")
                return False
                
        except Exception as e:
            log_error(f"Failed to send completion: {e}")
            return False


def create_integration_from_env() -> Optional[PlatformIntegration]:
    """
    Create a PlatformIntegration instance from environment variables.
    
    Required env vars:
    - PLATFORM_URL: Base URL of EllipseSearch platform
    - RPA_WEBHOOK_SECRET: Secret for API authentication
    - BRAND_ID: Brand to analyze
    
    Optional:
    - LANGUAGE: Default "en"
    - REGION: Default "global"
    
    Returns:
        PlatformIntegration if all required vars present, None otherwise
    """
    import os
    
    base_url = os.getenv("PLATFORM_URL")
    webhook_secret = os.getenv("RPA_WEBHOOK_SECRET")
    brand_id = os.getenv("BRAND_ID")
    
    if not all([base_url, webhook_secret, brand_id]):
        logger.warning(
            "Platform integration not configured. "
            "Set PLATFORM_URL, RPA_WEBHOOK_SECRET, and BRAND_ID to enable."
        )
        return None
    
    config = PlatformConfig(
        base_url=base_url,
        webhook_secret=webhook_secret,
        brand_id=brand_id,
        language=os.getenv("LANGUAGE", "en"),
        region=os.getenv("REGION", "global"),
    )
    
    return PlatformIntegration(config)

