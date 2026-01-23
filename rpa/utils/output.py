"""
Output handling for RPA automation.

Handles:
- Sending results to webhook
- Saving to JSON file
- Progress tracking and backups
"""

import json
import os
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field, asdict

from .logging import logger, log_success, log_error


@dataclass
class PromptResult:
    """Result from a single prompt execution."""
    
    prompt_id: str
    prompt_text: str
    engine: str
    
    # Response data
    response_html: str = ""
    response_text: str = ""
    
    # Sources/citations
    sources: List[Dict[str, Any]] = field(default_factory=list)
    citation_count: int = 0
    
    # Visibility check
    is_visible: bool = False
    brand_mentions: List[str] = field(default_factory=list)
    
    # Timing
    start_time: str = ""
    end_time: str = ""
    duration_seconds: float = 0.0
    
    # Status
    success: bool = False
    error_message: str = ""
    
    # Metadata
    run_id: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class RunSummary:
    """Summary of an RPA run session."""
    
    run_id: str
    started_at: str
    completed_at: str = ""
    
    # Counts
    total_prompts: int = 0
    successful: int = 0
    failed: int = 0
    
    # By engine
    by_engine: Dict[str, Dict[str, int]] = field(default_factory=dict)
    
    # Visibility
    visible_count: int = 0
    visibility_rate: float = 0.0
    
    # Results
    results: List[PromptResult] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, including nested results."""
        data = asdict(self)
        data["results"] = [r.to_dict() if hasattr(r, "to_dict") else r for r in self.results]
        return data


class OutputHandler:
    """
    Handles output for RPA automation runs.
    
    Supports:
    - Webhook POST for real-time updates
    - JSON file persistence
    - Incremental progress saving
    """
    
    def __init__(
        self,
        webhook_url: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        json_path: str = "./rpa_results.json",
        backup_interval: int = 5
    ):
        self.webhook_url = webhook_url
        self.webhook_secret = webhook_secret
        self.json_path = Path(json_path)
        self.backup_interval = backup_interval
        
        # Current run
        self.run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.summary = RunSummary(
            run_id=self.run_id,
            started_at=datetime.now().isoformat()
        )
        
        # Ensure output directory exists
        self.json_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize or load existing results
        self._load_existing()
    
    def _load_existing(self) -> None:
        """Load existing results file if present (for resume capability)."""
        if self.json_path.exists():
            try:
                with open(self.json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Could implement resume logic here if needed
                    logger.info(f"Found existing results file with {len(data.get('runs', []))} previous runs")
            except Exception as e:
                logger.warning(f"Could not load existing results: {e}")
    
    def add_result(self, result: PromptResult) -> None:
        """
        Add a result and optionally send to webhook.
        
        Args:
            result: The prompt result to add
        """
        result.run_id = self.run_id
        self.summary.results.append(result)
        
        # Update counts
        self.summary.total_prompts += 1
        if result.success:
            self.summary.successful += 1
            if result.is_visible:
                self.summary.visible_count += 1
        else:
            self.summary.failed += 1
        
        # Update by-engine stats
        if result.engine not in self.summary.by_engine:
            self.summary.by_engine[result.engine] = {"total": 0, "success": 0, "visible": 0}
        
        self.summary.by_engine[result.engine]["total"] += 1
        if result.success:
            self.summary.by_engine[result.engine]["success"] += 1
        if result.is_visible:
            self.summary.by_engine[result.engine]["visible"] += 1
        
        # Send to webhook
        if self.webhook_url:
            self._send_to_webhook(result)
        
        # Periodic backup
        if self.summary.total_prompts % self.backup_interval == 0:
            self._save_progress()
    
    def _send_to_webhook(self, result: PromptResult) -> bool:
        """
        Send result to webhook endpoint.
        
        Args:
            result: Result to send
            
        Returns:
            True if successful
        """
        try:
            headers = {
                "Content-Type": "application/json",
            }
            if self.webhook_secret:
                headers["Authorization"] = f"Bearer {self.webhook_secret}"
            
            payload = {
                "event": "prompt_completed",
                "run_id": self.run_id,
                "result": result.to_dict(),
                "timestamp": datetime.now().isoformat(),
            }
            
            response = requests.post(
                self.webhook_url,
                json=payload,
                headers=headers,
                timeout=10
            )
            
            if response.status_code in [200, 201, 202]:
                logger.debug(f"Webhook sent successfully for prompt {result.prompt_id}")
                return True
            else:
                logger.warning(f"Webhook returned {response.status_code}: {response.text[:200]}")
                return False
                
        except Exception as e:
            log_error(f"Failed to send webhook: {e}")
            return False
    
    def _save_progress(self) -> None:
        """Save current progress to JSON file."""
        try:
            # Load existing runs
            existing_runs = []
            if self.json_path.exists():
                with open(self.json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    existing_runs = data.get("runs", [])
            
            # Update or append current run
            run_data = self.summary.to_dict()
            run_found = False
            for i, run in enumerate(existing_runs):
                if run.get("run_id") == self.run_id:
                    existing_runs[i] = run_data
                    run_found = True
                    break
            
            if not run_found:
                existing_runs.append(run_data)
            
            # Save
            output = {
                "last_updated": datetime.now().isoformat(),
                "total_runs": len(existing_runs),
                "runs": existing_runs,
            }
            
            with open(self.json_path, "w", encoding="utf-8") as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            
            logger.debug(f"Progress saved: {self.summary.total_prompts} prompts")
            
        except Exception as e:
            log_error(f"Failed to save progress: {e}")
    
    def finalize(self) -> Dict[str, Any]:
        """
        Finalize the run and save final results.
        
        Returns:
            Summary dictionary
        """
        self.summary.completed_at = datetime.now().isoformat()
        
        # Calculate visibility rate
        if self.summary.successful > 0:
            self.summary.visibility_rate = self.summary.visible_count / self.summary.successful
        
        # Final save
        self._save_progress()
        
        # Send final summary to webhook
        if self.webhook_url:
            self._send_final_summary()
        
        log_success(f"Run complete! Results saved to {self.json_path}")
        
        return self.summary.to_dict()
    
    def _send_final_summary(self) -> None:
        """Send final summary to webhook."""
        try:
            headers = {
                "Content-Type": "application/json",
            }
            if self.webhook_secret:
                headers["Authorization"] = f"Bearer {self.webhook_secret}"
            
            payload = {
                "event": "run_completed",
                "run_id": self.run_id,
                "summary": {
                    "total_prompts": self.summary.total_prompts,
                    "successful": self.summary.successful,
                    "failed": self.summary.failed,
                    "visible_count": self.summary.visible_count,
                    "visibility_rate": self.summary.visibility_rate,
                    "by_engine": self.summary.by_engine,
                    "started_at": self.summary.started_at,
                    "completed_at": self.summary.completed_at,
                },
                "timestamp": datetime.now().isoformat(),
            }
            
            response = requests.post(
                self.webhook_url,
                json=payload,
                headers=headers,
                timeout=10
            )
            
            if response.status_code in [200, 201, 202]:
                log_success("Final summary sent to webhook")
            else:
                logger.warning(f"Final webhook returned {response.status_code}")
                
        except Exception as e:
            log_error(f"Failed to send final summary: {e}")

