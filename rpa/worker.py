#!/usr/bin/env python3
"""
RPA Worker for EllipseSearch AEO Platform

This script runs as a worker that:
1. Polls the platform for pending RPA simulations
2. Runs each simulation in your real Chrome browser
3. Sends results back to the platform for analysis

Usage:
    1. Start Chrome with debugging: ./start_chrome.sh
    2. Log in to AI platforms in that Chrome window
    3. Run worker: python worker.py

The worker will continuously poll for work until stopped (Ctrl+C).
"""

import os
import sys
import time
import random
import signal
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any

import requests

from config import config, ENGINE_URLS
from browser_connection import BrowserConnection, check_chrome_debugging, get_chrome_launch_command
from engines import get_engine, ENGINES
from utils.logging import logger, setup_logging, log_success, log_error, log_progress
from utils.human_behavior import HumanBehavior
from utils.anti_detection import (
    AntiDetectionManager,
    RequestDeduplicator,
    RateLimitConfig,
    create_anti_detection_system,
)


@dataclass
class PendingJob:
    """A pending RPA job from the platform."""
    simulation_id: str
    prompt_id: str
    prompt_text: str
    engine: str
    language: str
    region: str
    analysis_batch_id: str
    brand_id: str
    brand_domain: str
    brand_name: str
    brand_aliases: List[str]


class RPAWorker:
    """
    RPA Worker that processes pending simulations from the platform.
    
    Flow:
    1. User triggers analysis in platform UI
    2. Platform checks if RPA worker is online (via heartbeat)
    3. If online: creates simulations with status="awaiting_rpa"
    4. If offline: uses API mode instead (automatic fallback)
    5. This worker polls for pending jobs and processes them
    6. Results are sent back for AI analysis
    """
    
    def __init__(
        self,
        platform_url: str,
        webhook_secret: str,
        poll_interval: int = 10,
        min_delay: float = 8.0,
        max_delay: float = 20.0,
        stealth_mode: bool = True
    ):
        self.platform_url = platform_url.rstrip("/")
        self.webhook_secret = webhook_secret
        self.poll_interval = poll_interval
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.stealth_mode = stealth_mode
        
        self.running = True
        self.browser: Optional[BrowserConnection] = None
        self.jobs_processed = 0
        self.jobs_failed = 0
        
        # Worker ID for heartbeat
        import uuid
        self.worker_id = f"worker_{uuid.uuid4().hex[:8]}"
        self.last_heartbeat = 0
        self.heartbeat_interval = 10  # seconds
        self._heartbeat_stop = threading.Event()
        self._heartbeat_thread: Optional[threading.Thread] = None
        
        # Anti-detection system (critical for avoiding OpenAI detection)
        self.anti_detection = create_anti_detection_system(
            min_delay=min_delay,
            max_delay=max_delay,
            enable_night_mode=True
        )
        self.deduplicator = RequestDeduplicator(
            similarity_threshold=0.85,
            window_minutes=30
        )
        
        # Handle graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        logger.info("\n🛑 Shutdown requested, finishing current job...")
        self.running = False
        # Notify platform we're going offline
        self._send_offline()
    
    def _send_heartbeat(self, chrome_connected: bool = False, engines_ready: List[str] = None, force: bool = False):
        """Send heartbeat to platform so it knows RPA is available."""
        now = time.time()
        if not force and now - self.last_heartbeat < self.heartbeat_interval:
            return  # Too soon
        
        try:
            response = requests.post(
                f"{self.platform_url}/api/analysis/rpa-status",
                json={
                    "worker_id": self.worker_id,
                    "chrome_connected": chrome_connected,
                    "engines_ready": engines_ready or ["chatgpt"],
                    "status": "active",
                    "jobs_processed": self.jobs_processed,
                    "jobs_failed": self.jobs_failed,
                },
                headers=self._headers,
                timeout=15
            )
            self.last_heartbeat = now
            if response.status_code == 200:
                if force:
                    logger.info(f"✓ Registered with platform as {self.worker_id}")
            else:
                logger.warning(f"Heartbeat failed: {response.status_code}")
        except Exception as e:
            logger.warning(f"Heartbeat error: {e}")

    def _start_heartbeat_loop(self, engines_ready: List[str]) -> None:
        """Continuously send heartbeats so long jobs don't mark the worker offline."""
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            return

        def _loop():
            while self.running and not self._heartbeat_stop.is_set():
                self._send_heartbeat(
                    chrome_connected=True,
                    engines_ready=engines_ready,
                )
                time.sleep(max(1, self.heartbeat_interval))

        self._heartbeat_thread = threading.Thread(target=_loop, daemon=True)
        self._heartbeat_thread.start()
    
    def _send_offline(self):
        """Notify platform we're going offline."""
        try:
            requests.delete(
                f"{self.platform_url}/api/analysis/rpa-status?worker_id={self.worker_id}",
                headers=self._headers,
                timeout=5
            )
            logger.info(f"Notified platform that worker {self.worker_id} is offline")
        except Exception as e:
            logger.warning(f"Failed to notify offline status: {e}")
    
    @property
    def _headers(self) -> Dict[str, str]:
        """Get request headers with authentication."""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.webhook_secret}",
        }
    
    def fetch_pending_jobs(self, limit: int = 10) -> List[PendingJob]:
        """Fetch pending jobs from the platform."""
        try:
            response = requests.get(
                f"{self.platform_url}/api/analysis/rpa-pending",
                params={"limit": limit},
                headers=self._headers,
                timeout=30
            )
            
            if response.status_code == 401:
                log_error("Authentication failed. Check RPA_WEBHOOK_SECRET.")
                return []
            
            if response.status_code != 200:
                logger.warning(f"Failed to fetch jobs: {response.status_code}")
                return []
            
            data = response.json()
            jobs = []
            
            for job_data in data.get("jobs", []):
                jobs.append(PendingJob(
                    simulation_id=job_data["simulation_id"],
                    prompt_id=job_data["prompt_id"],
                    prompt_text=job_data["prompt_text"],
                    engine=job_data["engine"],
                    language=job_data.get("language", "en"),
                    region=job_data.get("region", "global"),
                    analysis_batch_id=job_data.get("analysis_batch_id", ""),
                    brand_id=job_data["brand_id"],
                    brand_domain=job_data.get("brand_domain", ""),
                    brand_name=job_data.get("brand_name", ""),
                    brand_aliases=job_data.get("brand_aliases", []),
                ))
            
            return jobs
            
        except requests.exceptions.ConnectionError:
            log_error(f"Cannot connect to platform at {self.platform_url}")
            return []
        except Exception as e:
            logger.warning(f"Error fetching jobs: {e}")
            return []
    
    def mark_jobs_processing(self, simulation_ids: List[str]) -> bool:
        """Mark jobs as being processed (prevents other workers from picking them up)."""
        try:
            response = requests.post(
                f"{self.platform_url}/api/analysis/rpa-pending",
                json={"simulation_ids": simulation_ids},
                headers=self._headers,
                timeout=30
            )
            return response.status_code == 200
        except:
            return False
    
    def send_result(self, job: PendingJob, result: Dict[str, Any]) -> bool:
        """Send job result to the platform."""
        try:
            payload = {
                "event": "prompt_completed",
                "run_id": f"worker_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "result": {
                    "prompt_id": job.prompt_id,
                    "prompt_text": job.prompt_text,
                    "engine": job.engine,
                    "response_html": result.get("response_html", ""),
                    "response_text": result.get("response_text", ""),
                    "sources": result.get("sources", []),
                    "citation_count": result.get("citation_count", 0),
                    "is_visible": result.get("is_visible", False),
                    "brand_mentions": [],
                    "start_time": result.get("start_time", ""),
                    "end_time": result.get("end_time", ""),
                    "duration_seconds": result.get("duration_seconds", 0),
                    "success": result.get("success", False),
                    "error_message": result.get("error_message", ""),
                    "run_id": "",
                },
                "timestamp": datetime.now().isoformat(),
                "brand_id": job.brand_id,
                "analysis_batch_id": job.analysis_batch_id,
                "language": job.language,
                "region": job.region,
                # Extra: simulation_id for direct update
                "simulation_id": job.simulation_id,
            }
            
            response = requests.post(
                f"{self.platform_url}/api/analysis/rpa-ingest",
                json=payload,
                headers=self._headers,
                timeout=60
            )
            
            if response.status_code in [200, 201]:
                return True
            else:
                logger.warning(f"Failed to send result: {response.status_code}")
                return False
                
        except Exception as e:
            log_error(f"Failed to send result: {e}")
            return False
    
    def process_job(self, job: PendingJob) -> Dict[str, Any]:
        """
        Process a single RPA job with anti-detection measures.
        
        Anti-detection features:
        - Pre-request delay with natural timing
        - Duplicate/similar prompt detection
        - Post-request "reading" simulation
        - Session break detection
        
        ENHANCED: Better result tracking with extraction stats for debugging.
        """
        result = {
            "success": False,
            "start_time": datetime.now().isoformat(),
            "response_html": "",
            "response_text": "",
            "sources": [],
            "citation_count": 0,
            "is_visible": False,
            "error_message": "",
            "skipped": False,
            # ENHANCED: Extraction stats for debugging
            "extraction_stats": {
                "html_length": 0,
                "text_length": 0,
                "extraction_method": "",
            },
        }
        
        try:
            # Check for duplicate/similar prompts (spam detection evasion)
            if self.stealth_mode:
                dup_check = self.deduplicator.check_and_record(job.prompt_text, job.engine)
                
                if dup_check["is_duplicate"]:
                    logger.warning(f"⚠️  Skipping duplicate prompt for {job.engine}")
                    result["error_message"] = "Skipped: duplicate prompt detected"
                    result["skipped"] = True
                    return result
                
                if dup_check["is_similar"]:
                    # Add extra delay for similar prompts
                    extra_delay = random.uniform(10, 20)
                    logger.info(f"   Similar prompt detected - adding {extra_delay:.0f}s delay")
                    time.sleep(extra_delay)
            
            logger.info(f"🔄 [{job.engine}] Processing: {job.prompt_text[:50]}...")
            
            # Get or create page for this engine
            page = self.browser.get_or_create_page(job.engine)
            
            # Get engine instance
            engine = get_engine(job.engine)
            engine.setup(page)
            
            # Anti-detection: Pre-request routine (delays, idle behavior)
            if self.stealth_mode:
                delay = self.anti_detection.pre_request_routine(page, job.engine)
                logger.debug(f"   Pre-request delay: {delay:.1f}s")
            
            # For ChatGPT: Start a new chat to avoid picking up data from previous prompts
            if job.engine == "chatgpt" and hasattr(engine, 'start_new_chat'):
                logger.debug("   Starting new ChatGPT conversation for clean extraction")
                engine.start_new_chat()
                # Small delay after starting new chat
                time.sleep(random.uniform(1, 2))
            
            # Run the prompt
            response = engine.run_prompt(job.prompt_text)
            
            # Fill result
            result["response_html"] = response.response_html
            result["response_text"] = response.response_text
            result["sources"] = response.sources
            result["citation_count"] = response.citation_count
            result["success"] = response.success
            result["error_message"] = response.error_message
            
            # ENHANCED: Track extraction stats for debugging
            result["extraction_stats"] = {
                "html_length": len(response.response_html or ""),
                "text_length": len(response.response_text or ""),
            }
            
            # Log extraction stats
            logger.debug(f"   Extraction: HTML={len(response.response_html or '')} chars, Text={len(response.response_text or '')} chars")
            
            # Validate extraction was successful
            if response.success and len(response.response_html or "") < 30 and len(response.response_text or "") < 30:
                logger.warning(f"   ⚠️  Extraction returned very short content - may need retry")
                result["error_message"] = f"Content too short (HTML: {len(response.response_html or '')}, Text: {len(response.response_text or '')})"
            
            # Anti-detection: Post-request routine (reading simulation)
            if self.stealth_mode:
                response_length = len(response.response_text or "")
                self.anti_detection.post_request_routine(
                    page=page,
                    engine=job.engine,
                    success=response.success,
                    response_length=response_length
                )
            
            # Check visibility
            if response.success and job.brand_domain:
                result["is_visible"] = engine.check_visibility(
                    response,
                    job.brand_domain,
                    job.brand_name,
                    job.brand_aliases
                )
            
            if response.success:
                status = "✓ visible" if result["is_visible"] else "✗ not visible"
                logger.info(f"   {status} ({response.citation_count} sources, {response.response_time_ms:.0f}ms)")
            else:
                logger.warning(f"   ✗ Failed: {response.error_message[:100]}")
            
        except Exception as e:
            result["error_message"] = str(e)
            log_error(f"   ✗ Error: {e}")
            
            # Anti-detection: Record failure for backoff
            if self.stealth_mode:
                self.anti_detection.post_request_routine(
                    page=None,
                    engine=job.engine,
                    success=False,
                    response_length=0
                )
        
        result["end_time"] = datetime.now().isoformat()
        result["duration_seconds"] = (
            datetime.fromisoformat(result["end_time"]) - 
            datetime.fromisoformat(result["start_time"])
        ).total_seconds()
        
        return result
    
    def run(self):
        """Main worker loop."""
        logger.info("=" * 60)
        logger.info("🤖 RPA Worker for EllipseSearch")
        logger.info("=" * 60)
        
        # Check Chrome is available
        if not check_chrome_debugging():
            log_error("Chrome is not running with remote debugging!")
            print(f"\nRun: ./start_chrome.sh")
            print("Then log in to ChatGPT, Gemini, Perplexity, Grok")
            return 1
        
        log_success("Chrome debugging is available")
        
        # Connect to browser
        try:
            self.browser = BrowserConnection()
            self.browser.connect()
        except Exception as e:
            log_error(f"Failed to connect to Chrome: {e}")
            return 1
        
        logger.info(f"📡 Polling {self.platform_url} for jobs...")
        if self.stealth_mode:
            logger.info(f"🛡️  Anti-detection: ACTIVE")
            logger.info(f"   ├─ Request spacing: {self.min_delay}-{self.max_delay}s base delay")
            logger.info(f"   ├─ Burst protection: max {self.anti_detection.rate_config.max_requests_per_window} requests per 5min")
            logger.info(f"   ├─ Duplicate detection: enabled")
            logger.info(f"   └─ Session ID: {self.anti_detection.session.session_id}")
        else:
            logger.info(f"⏱️  Delay between prompts: {self.min_delay}-{self.max_delay}s")
        logger.info("Press Ctrl+C to stop\n")
        
        # List of engines we support
        available_engines = list(ENGINES.keys())
        
        # Send initial heartbeat to register with platform
        logger.info(f"📤 Registering worker {self.worker_id} with platform...")
        self._send_heartbeat(
            chrome_connected=True, 
            engines_ready=available_engines, 
            force=True
        )
        self._start_heartbeat_loop(available_engines)
        
        try:
            while self.running:
                # Fetch pending jobs
                jobs = self.fetch_pending_jobs(limit=10)
                
                if not jobs:
                    logger.debug(f"No pending jobs, waiting {self.poll_interval}s...")
                    time.sleep(self.poll_interval)
                    continue
                
                logger.info(f"📋 Found {len(jobs)} pending job(s)")
                
                # Mark as processing
                simulation_ids = [j.simulation_id for j in jobs]
                self.mark_jobs_processing(simulation_ids)
                
                # Process each job with anti-detection
                for i, job in enumerate(jobs):
                    if not self.running:
                        break
                    
                    log_progress(i + 1, len(jobs), f"[{job.engine}] {job.prompt_text[:40]}...")
                    
                    # Check if we should take a session break (anti-detection)
                    if self.stealth_mode:
                        break_duration = self.anti_detection.should_take_break()
                        if break_duration:
                            logger.info(f"☕ Taking session break: {break_duration:.0f}s")
                            time.sleep(break_duration)
                    
                    # Process the job
                    result = self.process_job(job)
                    
                    # Don't send skipped results
                    if result.get("skipped"):
                        continue
                    
                    # Send result to platform
                    if self.send_result(job, result):
                        self.jobs_processed += 1
                    else:
                        self.jobs_failed += 1
                    
                    # Anti-detection handles delays in process_job
                    # Just add a micro-pause between jobs for stability
                    if i < len(jobs) - 1 and self.running:
                        time.sleep(random.uniform(0.5, 1.5))
                
                # Brief pause before next poll
                time.sleep(2)
        
        except KeyboardInterrupt:
            pass
        finally:
            # Cleanup
            self._heartbeat_stop.set()
            if self._heartbeat_thread:
                self._heartbeat_thread.join(timeout=2)
            if self.browser:
                self.browser.disconnect()
            
            # Summary
            print("\n" + "=" * 60)
            print("WORKER SUMMARY")
            print("=" * 60)
            print(f"Jobs processed: {self.jobs_processed}")
            print(f"Jobs failed:    {self.jobs_failed}")
            print("=" * 60)
        
        return 0


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="RPA Worker for EllipseSearch AEO Platform"
    )
    parser.add_argument(
        "--platform-url",
        type=str,
        default=os.getenv("PLATFORM_URL", "http://localhost:3000"),
        help="EllipseSearch platform URL"
    )
    parser.add_argument(
        "--secret",
        type=str,
        default=os.getenv("RPA_WEBHOOK_SECRET", ""),
        help="RPA webhook secret"
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=10,
        help="Seconds between polling for new jobs (default: 10)"
    )
    parser.add_argument(
        "--min-delay",
        type=float,
        default=float(os.getenv("MIN_DELAY", "8")),
        help="Minimum delay between prompts in seconds (default: 8)"
    )
    parser.add_argument(
        "--max-delay",
        type=float,
        default=float(os.getenv("MAX_DELAY", "20")),
        help="Maximum delay between prompts in seconds (default: 20)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose logging"
    )
    parser.add_argument(
        "--log-file",
        type=str,
        default="./rpa_worker.log",
        help="Log file path"
    )
    parser.add_argument(
        "--no-stealth",
        action="store_true",
        help="Disable anti-detection features (not recommended)"
    )
    
    args = parser.parse_args()
    
    # Setup logging
    import logging
    setup_logging(args.log_file, logging.DEBUG if args.verbose else logging.INFO)
    
    # Validate
    if not args.secret:
        log_error("RPA_WEBHOOK_SECRET is required")
        print("\nSet it in .env or pass --secret")
        return 1
    
    # Create and run worker
    stealth_mode = not args.no_stealth
    if stealth_mode:
        logger.info("🛡️  Stealth mode: ENABLED (anti-detection active)")
    else:
        logger.warning("⚠️  Stealth mode: DISABLED (higher detection risk)")
    
    worker = RPAWorker(
        platform_url=args.platform_url,
        webhook_secret=args.secret,
        poll_interval=args.poll_interval,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        stealth_mode=stealth_mode,
    )
    
    return worker.run()


if __name__ == "__main__":
    sys.exit(main())

