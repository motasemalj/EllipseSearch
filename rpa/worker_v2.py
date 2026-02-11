#!/usr/bin/env python3
"""
RPA Worker v2 for EllipseSearch AEO Platform

Enhanced production-ready worker with:
- Database-backed job queue (rpa_job_queue table)
- PARALLEL PROCESSING across different engines
- Intelligent rate limiting per engine
- Comprehensive anti-detection measures
- Support for all AI engines (ChatGPT, Perplexity, Gemini, Grok)
- Adaptive scheduling based on engine cooldowns
- Health monitoring and graceful shutdown

Usage:
    1. Start Chrome with debugging: ./start_chrome.sh
    2. Log in to AI platforms in that Chrome window
    3. Run worker: python worker_v2.py
    4. For parallel mode: python worker_v2.py --parallel

The worker continuously processes jobs from the queue until stopped (Ctrl+C).
"""

import os
import sys
import time
import random
import signal
import threading
import hashlib
import json
import concurrent.futures
import multiprocessing
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from threading import Lock, RLock

import requests

from config import config, ENGINE_URLS
from browser_connection import BrowserConnection, check_chrome_debugging
from engines import get_engine, ENGINES
from utils.logging import logger, setup_logging, log_success, log_error, log_progress
from utils.human_behavior import HumanBehavior
from utils.anti_detection import (
    AntiDetectionManager,
    RequestDeduplicator,
    RateLimitConfig,
    create_anti_detection_system,
)


# ===========================================
# Configuration
# ===========================================

@dataclass
class WorkerConfig:
    """Worker configuration."""
    platform_url: str = os.getenv("PLATFORM_URL", "http://localhost:3000")
    webhook_secret: str = os.getenv("RPA_WEBHOOK_SECRET", "")
    
    # Polling
    poll_interval: int = 5  # seconds between queue checks
    max_jobs_per_cycle: int = 10  # max jobs to fetch per cycle (increased for parallel)
    
    # Parallel processing
    # NOTE: Playwright is NOT thread-safe. Browser pages can only be accessed
    # from the thread that created them. We use multiprocessing instead of threading.
    # Each process has its own Playwright instance and browser connection.
    parallel_mode: bool = True  # Use multiprocessing for parallel execution (default enabled)
    max_parallel_engines: int = 4  # Max number of parallel processes
    use_multiprocessing: bool = True  # Use multiprocessing (recommended) vs threading (not recommended)
    
    # Rate limiting - conservative defaults per engine
    engine_cooldowns: Dict[str, int] = None  # seconds between requests to same engine

    # RPA responsibilities
    # RPA should only generate raw AI responses; the platform API will do all analysis.
    compute_visibility_in_rpa: bool = False
    
    # Anti-detection
    min_delay: float = float(os.getenv("MIN_DELAY", "15"))
    max_delay: float = float(os.getenv("MAX_DELAY", "45"))
    stealth_mode: bool = True
    
    # Health
    heartbeat_interval: int = 10
    max_consecutive_errors: int = 5
    error_backoff_seconds: int = 60
    
    def __post_init__(self):
        if self.engine_cooldowns is None:
            self.engine_cooldowns = {
                "chatgpt": 30,    # 30s between ChatGPT requests
                "perplexity": 20, # 20s between Perplexity requests
                "gemini": 15,     # 15s between Gemini requests
                "grok": 15,       # 15s between Grok requests
            }


@dataclass
class QueueJob:
    """A job from the RPA queue."""
    id: str
    brand_id: str
    prompt_id: str
    prompt_text: str
    analysis_batch_id: str
    engine: str
    language: str
    region: str
    brand_domain: str = ""
    brand_name: str = ""
    brand_aliases: List[str] = None
    priority: str = "normal"
    
    def __post_init__(self):
        if self.brand_aliases is None:
            self.brand_aliases = []


@dataclass
class JobResult:
    """Result of processing a job."""
    job: QueueJob
    result: Dict[str, Any]
    success: bool
    duration_seconds: float = 0
    error: Optional[str] = None


# ===========================================
# Thread-Safe Statistics
# ===========================================

class ThreadSafeStats:
    """Thread-safe statistics tracker."""
    
    def __init__(self):
        self._lock = Lock()
        self._data = {
            "jobs_processed": 0,
            "jobs_failed": 0,
            "jobs_skipped": 0,
            "parallel_batches": 0,
            "total_runtime": 0,
            "start_time": datetime.now(),
        }
    
    def increment(self, key: str, value: int = 1):
        with self._lock:
            self._data[key] = self._data.get(key, 0) + value
    
    def get(self, key: str) -> Any:
        with self._lock:
            return self._data.get(key)
    
    def get_all(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._data)


# ===========================================
# Process Worker Function (for multiprocessing)
# ===========================================

def process_job_worker(
    job_data: dict,
    platform_url: str,
    webhook_secret: str,
    cdp_url: str,
    worker_id: str,
    process_id: str,
    stealth_mode: bool = True,
    min_delay: float = 15.0,
    max_delay: float = 45.0,
) -> dict:
    """
    Worker function that runs in a separate process.
    Each process has its own Playwright instance and browser connection.
    
    Args:
        job_data: Dictionary containing job information
        platform_url: Platform API URL
        webhook_secret: Authentication secret
        cdp_url: Chrome DevTools Protocol URL
        worker_id: Main worker ID
        process_id: Unique process identifier
        stealth_mode: Enable anti-detection
        min_delay: Minimum delay between requests
        max_delay: Maximum delay between requests
    
    Returns:
        Dictionary with job result
    """
    import logging
    import time
    import random
    from datetime import datetime
    from browser_connection import BrowserConnection, CDPConfig
    from engines import get_engine
    from utils.logging import setup_logging, logger
    from utils.anti_detection import create_anti_detection_system, RequestDeduplicator
    
    # Setup logging for this process
    log_file = f"./rpa_worker_v2_{process_id}.log"
    setup_logging(log_file, logging.INFO)
    
    result = {
        "success": False,
        "start_time": datetime.now().isoformat(),
        "response_html": "",
        "response_text": "",
        "sources": [],
        "citation_count": 0,
        # IMPORTANT: RPA worker does not do analysis. Platform API computes visibility.
        "is_visible": False,
        "error_message": "",
        "skipped": False,
        "job_id": job_data["id"],
    }
    
    browser = None
    try:
        logger.info(f"[Process {process_id}] Starting job {job_data['id']} for engine {job_data['engine']}")
        
        # Create browser connection with process ID for isolated context
        cdp_config = CDPConfig(cdp_url=cdp_url)
        browser = BrowserConnection(config=cdp_config, process_id=process_id)
        browser.connect()
        
        # Create anti-detection system for this process
        anti_detection = None
        deduplicator = None
        if stealth_mode:
            anti_detection = create_anti_detection_system(
                min_delay=min_delay,
                max_delay=max_delay,
                enable_night_mode=True
            )
            deduplicator = RequestDeduplicator(
                similarity_threshold=0.85,
                window_minutes=60
            )
            
            # Check for duplicate/similar prompts
            dup_check = deduplicator.check_and_record(job_data["prompt_text"], job_data["engine"])
            
            if dup_check["is_duplicate"]:
                logger.warning(f"⚠️ [{job_data['engine']}] Skipping duplicate prompt")
                result["error_message"] = "Skipped: duplicate prompt"
                result["skipped"] = True
                return result
            
            if dup_check["is_similar"]:
                extra_delay = random.uniform(15, 30)
                logger.info(f"[{job_data['engine']}] Similar prompt detected - adding {extra_delay:.0f}s delay")
                time.sleep(extra_delay)
        
        logger.info(f"🔄 [{job_data['engine']}] Processing: {job_data['prompt_text'][:50]}...")
        
        # Get or create page for this engine
        page = browser.get_or_create_page(job_data["engine"])
        
        # Get engine instance
        engine = get_engine(job_data["engine"])
        engine.setup(page)
        
        # Pre-request routine
        if stealth_mode and anti_detection:
            delay = anti_detection.pre_request_routine(page, job_data["engine"])
            logger.debug(f"[{job_data['engine']}] Pre-request delay: {delay:.1f}s")
        
        # Starting a new chat is allowed (UI action), but we must never refresh/reload URLs (no page.goto()).
        if job_data["engine"] == "chatgpt" and hasattr(engine, "start_new_chat"):
            try:
                logger.debug(f"[{job_data['engine']}] Starting new ChatGPT conversation (no page.goto)")
                engine.start_new_chat()
                time.sleep(random.uniform(1.0, 2.0))
            except Exception:
                pass
        
        # Run the prompt
        response = engine.run_prompt(job_data["prompt_text"])
        
        # Fill result
        result["response_html"] = response.response_html
        result["response_text"] = response.response_text
        result["sources"] = response.sources
        result["citation_count"] = response.citation_count
        result["success"] = response.success
        result["error_message"] = response.error_message
        
        # Post-request routine
        if stealth_mode and anti_detection:
            response_length = len(response.response_text or "")
            anti_detection.post_request_routine(
                page=page,
                engine=job_data["engine"],
                success=response.success,
                response_length=response_length
            )
        
        if response.success:
            logger.info(f"   [{job_data['engine']}] ✓ Response captured ({response.citation_count} sources, {response.response_time_ms:.0f}ms)")
        else:
            logger.warning(f"   [{job_data['engine']}] ✗ Failed: {response.error_message[:100]}")
        
    except Exception as e:
        result["error_message"] = str(e)
        logger.error(f"   [{job_data.get('engine', 'unknown')}] ✗ Error: {e}")
        
        if stealth_mode and anti_detection:
            try:
                anti_detection.post_request_routine(
                    page=None,
                    engine=job_data.get("engine", ""),
                    success=False,
                    response_length=0
                )
            except:
                pass
    
    finally:
        if browser:
            try:
                browser.disconnect()
            except:
                pass
    
    result["end_time"] = datetime.now().isoformat()
    result["duration_seconds"] = (
        datetime.fromisoformat(result["end_time"]) - 
        datetime.fromisoformat(result["start_time"])
    ).total_seconds()
    
    return result


# ===========================================
# Enhanced RPA Worker with Parallel Processing
# ===========================================

class RPAWorkerV2:
    """
    Production-ready RPA worker with database job queue and parallel processing.
    
    Key features:
    - PARALLEL PROCESSING: Process multiple engines simultaneously
    - Claims jobs from rpa_job_queue table (set up by Trigger.dev)
    - Per-engine rate limiting with adaptive cooldowns
    - Thread-safe operations with proper locking
    - Better error recovery and retry logic
    - Comprehensive health monitoring
    - Support for job priorities
    """
    
    def __init__(self, config: WorkerConfig):
        self.config = config
        self.running = True
        self.browser: Optional[BrowserConnection] = None
        
        # Worker identity
        self.worker_id = f"worker_{hashlib.md5(str(time.time()).encode()).hexdigest()[:8]}"
        
        # Thread-safe statistics
        self.stats = ThreadSafeStats()
        
        # Per-engine tracking with thread safety
        self._engine_lock = RLock()
        self.engine_last_request: Dict[str, float] = {}
        self.engine_error_count: Dict[str, int] = {}
        
        # Engine-specific locks for thread-safe page access
        self.engine_locks: Dict[str, Lock] = {
            "chatgpt": Lock(),
            "perplexity": Lock(),
            "gemini": Lock(),
            "grok": Lock(),
        }
        
        # Thread pool for parallel execution
        self._executor: Optional[concurrent.futures.ThreadPoolExecutor] = None
        
        # Heartbeat
        self._heartbeat_stop = threading.Event()
        self._heartbeat_thread: Optional[threading.Thread] = None
        
        # Anti-detection system (thread-safe internally)
        self.anti_detection = create_anti_detection_system(
            min_delay=config.min_delay,
            max_delay=config.max_delay,
            enable_night_mode=True
        )
        self.deduplicator = RequestDeduplicator(
            similarity_threshold=0.85,
            window_minutes=60
        )
        
        # Graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        logger.info("\n🛑 Shutdown requested, finishing current jobs...")
        self.running = False
        
        # Shutdown thread pool gracefully
        if self._executor:
            self._executor.shutdown(wait=False)
        
        self._send_offline()
    
    @property
    def _headers(self) -> Dict[str, str]:
        """Get request headers with authentication."""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.config.webhook_secret}",
        }
    
    # ===========================================
    # Health & Heartbeat
    # ===========================================
    
    def _send_heartbeat(self, chrome_connected: bool = False, 
                       engines_ready: List[str] = None, force: bool = False):
        """Send heartbeat to platform."""
        try:
            response = requests.post(
                f"{self.config.platform_url}/api/analysis/rpa-status",
                json={
                    "worker_id": self.worker_id,
                    "chrome_connected": chrome_connected,
                    "engines_ready": engines_ready or list(ENGINES.keys()),
                    "status": "active",
                    "jobs_processed": self.stats.get("jobs_processed"),
                    "jobs_failed": self.stats.get("jobs_failed"),
                    "parallel_mode": self.config.parallel_mode,
                    "use_multiprocessing": self.config.use_multiprocessing,
                    "version": "2.2-multiprocess",
                },
                headers=self._headers,
                timeout=15
            )
            if response.status_code == 200:
                if force:
                    logger.info(f"✓ Registered with platform as {self.worker_id}")
            else:
                logger.warning(f"Heartbeat failed: {response.status_code}")
        except Exception as e:
            logger.warning(f"Heartbeat error: {e}")
    
    def _start_heartbeat_loop(self):
        """Start background heartbeat thread."""
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            return
        
        def _loop():
            while self.running and not self._heartbeat_stop.is_set():
                self._send_heartbeat(
                    chrome_connected=True,
                    engines_ready=list(ENGINES.keys()),
                )
                time.sleep(self.config.heartbeat_interval)
        
        self._heartbeat_thread = threading.Thread(target=_loop, daemon=True)
        self._heartbeat_thread.start()
    
    def _send_offline(self):
        """Notify platform we're going offline."""
        try:
            requests.delete(
                f"{self.config.platform_url}/api/analysis/rpa-status?worker_id={self.worker_id}",
                headers=self._headers,
                timeout=5
            )
            logger.info(f"Notified platform that {self.worker_id} is offline")
        except Exception as e:
            logger.warning(f"Failed to notify offline: {e}")
    
    # ===========================================
    # Job Queue Management
    # ===========================================
    
    def fetch_jobs_from_queue(self, limit: int = 10) -> List[QueueJob]:
        """Fetch pending jobs from the rpa_job_queue."""
        try:
            response = requests.get(
                f"{self.config.platform_url}/api/analysis/rpa-queue",
                params={
                    "worker_id": self.worker_id,
                    "limit": limit,
                    "engines": ",".join(ENGINES.keys()),
                },
                headers=self._headers,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                jobs = []
                for job_data in data.get("jobs", []):
                    jobs.append(QueueJob(
                        id=job_data["id"],
                        brand_id=job_data["brand_id"],
                        prompt_id=job_data["prompt_id"],
                        prompt_text=job_data["prompt_text"],
                        analysis_batch_id=job_data.get("analysis_batch_id", ""),
                        engine=job_data["engine"],
                        language=job_data.get("language", "en"),
                        region=job_data.get("region", "global"),
                        brand_domain=job_data.get("brand_domain", ""),
                        brand_name=job_data.get("brand_name", ""),
                        brand_aliases=job_data.get("brand_aliases", []),
                        priority=job_data.get("priority", "normal"),
                    ))
                return jobs
            
            return self._fetch_legacy_pending(limit)
            
        except requests.exceptions.ConnectionError:
            log_error(f"Cannot connect to platform at {self.config.platform_url}")
            return []
        except Exception as e:
            logger.warning(f"Error fetching jobs: {e}")
            return []
    
    def _fetch_legacy_pending(self, limit: int) -> List[QueueJob]:
        """Fallback to legacy pending jobs endpoint."""
        try:
            response = requests.get(
                f"{self.config.platform_url}/api/analysis/rpa-pending",
                params={"limit": limit},
                headers=self._headers,
                timeout=30
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            jobs = []
            for job_data in data.get("jobs", []):
                jobs.append(QueueJob(
                    id=job_data.get("simulation_id", job_data.get("id", "")),
                    brand_id=job_data["brand_id"],
                    prompt_id=job_data["prompt_id"],
                    prompt_text=job_data["prompt_text"],
                    analysis_batch_id=job_data.get("analysis_batch_id", ""),
                    engine=job_data["engine"],
                    language=job_data.get("language", "en"),
                    region=job_data.get("region", "global"),
                    brand_domain=job_data.get("brand_domain", ""),
                    brand_name=job_data.get("brand_name", ""),
                    brand_aliases=job_data.get("brand_aliases", []),
                ))
            return jobs
        except:
            return []
    
    def claim_jobs(self, jobs: List[QueueJob]) -> List[QueueJob]:
        """Claim multiple jobs before processing (batch claim for efficiency)."""
        if not jobs:
            return []
        
        try:
            response = requests.post(
                f"{self.config.platform_url}/api/analysis/rpa-queue",
                json={
                    "job_ids": [job.id for job in jobs],
                    "worker_id": self.worker_id,
                },
                headers=self._headers,
                timeout=15
            )
            
            if response.status_code == 200:
                logger.debug(f"Claimed {len(jobs)} job(s)")
                return jobs
            else:
                logger.warning(f"Failed to claim jobs: {response.status_code}")
                return []
                
        except Exception as e:
            logger.warning(f"Error claiming jobs: {e}")
            return []
    
    def claim_job(self, job: QueueJob) -> bool:
        """Claim a single job before processing."""
        return len(self.claim_jobs([job])) > 0
    
    def complete_job(self, job: QueueJob, result: Dict[str, Any], success: bool) -> bool:
        """Report job completion to the platform."""
        try:
            run_id = f"{self.worker_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{job.engine}"
            
            payload = {
                "job_id": job.id,
                "success": success,
                "event": "prompt_completed",
                "run_id": run_id,
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
                    "success": success,
                    "error_message": result.get("error_message", ""),
                    "run_id": run_id,
                },
                "timestamp": datetime.now().isoformat(),
                "brand_id": job.brand_id,
                "analysis_batch_id": job.analysis_batch_id,
                "language": job.language,
                "region": job.region,
                "simulation_id": job.id,
            }
            
            response = requests.post(
                f"{self.config.platform_url}/api/analysis/rpa-ingest",
                json=payload,
                headers=self._headers,
                timeout=60
            )
            
            if response.status_code not in [200, 201]:
                try:
                    error_body = response.json()
                    log_error(f"RPA ingest failed ({response.status_code}): {error_body}")
                except:
                    log_error(f"RPA ingest failed ({response.status_code}): {response.text[:500]}")
                
                self._update_queue_status(job.id, success, result.get("error_message", ""), job.engine)
                return False
            
            self._update_queue_status(job.id, success, result.get("error_message", "") if not success else None, job.engine)
            return True
            
        except Exception as e:
            log_error(f"Failed to report job completion: {e}")
            try:
                self._update_queue_status(job.id, False, str(e), job.engine)
            except:
                pass
            return False
    
    def _update_queue_status(self, job_id: str, success: bool, error_message: str = None, engine: str = None):
        """Update job status in the queue (PATCH endpoint)."""
        try:
            requests.patch(
                f"{self.config.platform_url}/api/analysis/rpa-queue",
                json={
                    "job_id": job_id,
                    "success": success,
                    "error_message": error_message,
                    "engine": engine,
                },
                headers=self._headers,
                timeout=15
            )
        except Exception as e:
            logger.warning(f"Failed to update queue status for {job_id}: {e}")
    
    # ===========================================
    # Rate Limiting (Thread-Safe)
    # ===========================================
    
    def get_engine_cooldown_remaining(self, engine: str) -> float:
        """Get remaining cooldown time for an engine (thread-safe)."""
        with self._engine_lock:
            last_request = self.engine_last_request.get(engine, 0)
            cooldown = self.config.engine_cooldowns.get(engine, 15)
            
            error_count = self.engine_error_count.get(engine, 0)
            if error_count > 0:
                cooldown += error_count * 10
            
            time_since = time.time() - last_request
            remaining = cooldown - time_since
            
            return max(0, remaining)
    
    def can_process_engine(self, engine: str) -> Tuple[bool, float]:
        """Check if an engine is ready for processing (thread-safe)."""
        remaining = self.get_engine_cooldown_remaining(engine)
        return remaining <= 0, remaining
    
    def record_engine_request(self, engine: str, success: bool):
        """Record an engine request for rate limiting (thread-safe)."""
        with self._engine_lock:
            self.engine_last_request[engine] = time.time()
            
            if success:
                if engine in self.engine_error_count:
                    self.engine_error_count[engine] = max(0, self.engine_error_count[engine] - 1)
            else:
                self.engine_error_count[engine] = self.engine_error_count.get(engine, 0) + 1
    
    # ===========================================
    # Job Selection
    # ===========================================
    
    def select_jobs_for_parallel(self, jobs: List[QueueJob]) -> List[QueueJob]:
        """
        Select jobs for parallel processing - one job per engine.
        Important: Do NOT apply additional local cooldown gating here because the
        platform queue (`/api/analysis/rpa-queue`) already filters by `rpa_engine_limits`.
        Also: Prefer including ChatGPT when present so it runs alongside other engines.
        """
        priority_order = {"immediate": 0, "high": 1, "normal": 2, "low": 3}
        sorted_jobs = sorted(jobs, key=lambda j: priority_order.get(j.priority, 2))

        # Pick first job per engine (highest priority)
        selected_by_engine: Dict[str, QueueJob] = {}
        for job in sorted_jobs:
            if job.engine not in selected_by_engine:
                selected_by_engine[job.engine] = job

        # Prefer ChatGPT first, then other engines
        engine_order = ["chatgpt", "perplexity", "gemini", "grok"]
        selected: List[QueueJob] = []
        for engine in engine_order:
            if engine in selected_by_engine:
                selected.append(selected_by_engine[engine])
                if len(selected) >= self.config.max_parallel_engines:
                    return selected

        # Include any other engines not in our known list
        for engine, job in selected_by_engine.items():
            if engine not in engine_order:
                selected.append(job)
                if len(selected) >= self.config.max_parallel_engines:
                    break

        return selected
    
    def select_best_job(self, jobs: List[QueueJob]) -> Optional[QueueJob]:
        """Select the best single job (for sequential mode)."""
        priority_order = {"immediate": 0, "high": 1, "normal": 2, "low": 3}
        sorted_jobs = sorted(jobs, key=lambda j: priority_order.get(j.priority, 2))

        # In sequential mode, also avoid extra local cooldown gating: the queue should already handle it.
        return sorted_jobs[0] if sorted_jobs else None
    
    # ===========================================
    # Job Processing
    # ===========================================
    
    def process_job(self, job: QueueJob) -> Dict[str, Any]:
        """Process a single RPA job with full anti-detection."""
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
        }
        
        try:
            # Check for duplicate/similar prompts
            if self.config.stealth_mode:
                dup_check = self.deduplicator.check_and_record(job.prompt_text, job.engine)
                
                if dup_check["is_duplicate"]:
                    logger.warning(f"⚠️ [{job.engine}] Skipping duplicate prompt")
                    result["error_message"] = "Skipped: duplicate prompt"
                    result["skipped"] = True
                    return result
                
                if dup_check["is_similar"]:
                    extra_delay = random.uniform(15, 30)
                    logger.info(f"[{job.engine}] Similar prompt detected - adding {extra_delay:.0f}s delay")
                    time.sleep(extra_delay)
            
            logger.info(f"🔄 [{job.engine}] Processing: {job.prompt_text[:50]}...")
            
            # Get or create page for this engine
            page = self.browser.get_or_create_page(job.engine)
            
            # Get engine instance
            engine = get_engine(job.engine)
            engine.setup(page)
            
            # Pre-request routine
            if self.config.stealth_mode:
                delay = self.anti_detection.pre_request_routine(page, job.engine)
                logger.debug(f"[{job.engine}] Pre-request delay: {delay:.1f}s")
            
            # Starting a new chat is allowed (UI action), but we must never refresh/reload URLs (no page.goto()).
            if job.engine == "chatgpt" and hasattr(engine, "start_new_chat"):
                try:
                    logger.debug(f"[{job.engine}] Starting new ChatGPT conversation (no page.goto)")
                    engine.start_new_chat()
                    time.sleep(random.uniform(1.0, 2.0))
                except Exception:
                    pass
            
            # Run the prompt
            response = engine.run_prompt(job.prompt_text)
            
            # Fill result
            result["response_html"] = response.response_html
            result["response_text"] = response.response_text
            result["sources"] = response.sources
            result["citation_count"] = response.citation_count
            result["success"] = response.success
            result["error_message"] = response.error_message
            
            # Post-request routine
            if self.config.stealth_mode:
                response_length = len(response.response_text or "")
                self.anti_detection.post_request_routine(
                    page=page,
                    engine=job.engine,
                    success=response.success,
                    response_length=response_length
                )
            
            # IMPORTANT: RPA does not perform analysis. Visibility and selection signals
            # are computed in the platform API pipeline.
            result["is_visible"] = False
            
            if response.success:
                logger.info(f"   [{job.engine}] ✓ Response captured ({response.citation_count} sources, {response.response_time_ms:.0f}ms)")
            else:
                logger.warning(f"   [{job.engine}] ✗ Failed: {response.error_message[:100]}")
            
        except Exception as e:
            result["error_message"] = str(e)
            log_error(f"   [{job.engine}] ✗ Error: {e}")
            
            if self.config.stealth_mode:
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
    
    def _process_job_thread_safe(self, job: QueueJob) -> JobResult:
        """
        Process a job in a thread-safe manner.
        Acquires engine-specific lock to prevent concurrent access to same engine's page.
        """
        start_time = time.time()
        
        # Acquire engine lock to prevent concurrent access to same engine's browser tab
        with self.engine_locks.get(job.engine, Lock()):
            result = self.process_job(job)
            duration = time.time() - start_time
            
            return JobResult(
                job=job,
                result=result,
                success=result.get("success", False),
                duration_seconds=duration,
                error=result.get("error_message") if not result.get("success") else None
            )
    
    # ===========================================
    # Parallel Processing
    # ===========================================
    
    def process_jobs_parallel(self, jobs: List[QueueJob]) -> int:
        """
        Process multiple jobs in parallel - one per engine.
        Uses multiprocessing (ProcessPoolExecutor) for true parallelism.
        Returns the number of successfully processed jobs.
        """
        if not jobs:
            return 0
        
        # Select jobs for parallel execution (one per engine)
        parallel_jobs = self.select_jobs_for_parallel(jobs)
        
        if not parallel_jobs:
            logger.debug("No jobs ready for parallel processing (all engines in cooldown)")
            return 0
        
        # Claim all jobs at once
        claimed_jobs = self.claim_jobs(parallel_jobs)
        
        if not claimed_jobs:
            logger.warning("Could not claim any jobs")
            return 0
        
        engines_list = [j.engine for j in claimed_jobs]
        mode_str = "MULTIPROCESSING" if self.config.use_multiprocessing else "THREADING"
        logger.info(f"🚀 Processing {len(claimed_jobs)} job(s) in PARALLEL ({mode_str}): {', '.join(engines_list)}")
        
        processed = 0
        
        if self.config.use_multiprocessing:
            # Use ProcessPoolExecutor for true parallelism (recommended)
            # Each process has its own Playwright instance
            with concurrent.futures.ProcessPoolExecutor(
                max_workers=min(len(claimed_jobs), self.config.max_parallel_engines),
                mp_context=multiprocessing.get_context('spawn')  # Use 'spawn' for better compatibility
            ) as executor:
                # Prepare job data for worker processes
                future_to_job: Dict[concurrent.futures.Future, QueueJob] = {}
                
                for i, job in enumerate(claimed_jobs):
                    process_id = f"{self.worker_id}_proc_{i}_{int(time.time())}"
                    
                    job_data = {
                        "id": job.id,
                        "brand_id": job.brand_id,
                        "prompt_id": job.prompt_id,
                        "prompt_text": job.prompt_text,
                        "engine": job.engine,
                        "language": job.language,
                        "region": job.region,
                        "brand_domain": job.brand_domain,
                        "brand_name": job.brand_name,
                        "brand_aliases": job.brand_aliases,
                        "analysis_batch_id": job.analysis_batch_id,
                    }
                    
                    future = executor.submit(
                        process_job_worker,
                        job_data,
                        self.config.platform_url,
                        self.config.webhook_secret,
                        self.browser.config.cdp_url,
                        self.worker_id,
                        process_id,
                        self.config.stealth_mode,
                        self.config.min_delay,
                        self.config.max_delay,
                    )
                    future_to_job[future] = job
                
                # Collect results as they complete
                for future in concurrent.futures.as_completed(future_to_job, timeout=300):
                    job = future_to_job[future]
                    
                    try:
                        result = future.result(timeout=300)
                        
                        # Record rate limiting (thread-safe)
                        self.record_engine_request(job.engine, result["success"])
                        
                        # Skip skipped results
                        if result.get("skipped"):
                            self.stats.increment("jobs_skipped")
                            continue
                        
                        # Report completion
                        if self.complete_job(job, result, result["success"]):
                            self.stats.increment("jobs_processed")
                            processed += 1
                        else:
                            self.stats.increment("jobs_failed")
                            
                    except concurrent.futures.TimeoutError:
                        logger.error(f"[{job.engine}] Job timed out after 300s")
                        self.stats.increment("jobs_failed")
                        self.record_engine_request(job.engine, False)
                        self._update_queue_status(job.id, False, "Job timed out", job.engine)
                        
                    except Exception as e:
                        logger.error(f"[{job.engine}] Job failed with exception: {e}")
                        self.stats.increment("jobs_failed")
                        self.record_engine_request(job.engine, False)
                        self._update_queue_status(job.id, False, str(e), job.engine)
        else:
            # Fallback to threading (not recommended, but kept for compatibility)
            with concurrent.futures.ThreadPoolExecutor(
                max_workers=self.config.max_parallel_engines,
                thread_name_prefix="rpa_worker"
            ) as executor:
                # Submit all jobs to the executor
                future_to_job: Dict[concurrent.futures.Future, QueueJob] = {}
                
                for job in claimed_jobs:
                    future = executor.submit(self._process_job_thread_safe, job)
                    future_to_job[future] = job
                
                # Collect results as they complete
                for future in concurrent.futures.as_completed(future_to_job, timeout=300):
                    job = future_to_job[future]
                    
                    try:
                        job_result: JobResult = future.result(timeout=60)
                        
                        # Record rate limiting (thread-safe)
                        self.record_engine_request(job_result.job.engine, job_result.success)
                        
                        # Skip skipped results
                        if job_result.result.get("skipped"):
                            self.stats.increment("jobs_skipped")
                            continue
                        
                        # Report completion
                        if self.complete_job(job_result.job, job_result.result, job_result.success):
                            self.stats.increment("jobs_processed")
                            processed += 1
                        else:
                            self.stats.increment("jobs_failed")
                            
                    except concurrent.futures.TimeoutError:
                        logger.error(f"[{job.engine}] Job timed out after 60s")
                        self.stats.increment("jobs_failed")
                        self.record_engine_request(job.engine, False)
                        self._update_queue_status(job.id, False, "Job timed out", job.engine)
                        
                    except Exception as e:
                        logger.error(f"[{job.engine}] Job failed with exception: {e}")
                        self.stats.increment("jobs_failed")
                        self.record_engine_request(job.engine, False)
                        self._update_queue_status(job.id, False, str(e), job.engine)
        
        self.stats.increment("parallel_batches")
        return processed
    
    # ===========================================
    # Main Loop
    # ===========================================
    
    def run(self) -> int:
        """Main worker loop with optional parallel processing."""
        mode_str = "PARALLEL" if self.config.parallel_mode else "SEQUENTIAL"
        if self.config.parallel_mode:
            mode_str += f" ({'MULTIPROCESSING' if self.config.use_multiprocessing else 'THREADING'})"
        
        logger.info("=" * 60)
        logger.info(f"🤖 RPA Worker v2.2 for EllipseSearch ({mode_str} MODE)")
        logger.info("=" * 60)
        
        # Check Chrome with retries and better diagnostics
        logger.info("Checking Chrome debugging connection...")
        chrome_available = False
        for attempt in range(3):
            if check_chrome_debugging():
                chrome_available = True
                break
            if attempt < 2:
                logger.debug(f"Chrome check attempt {attempt + 1} failed, retrying...")
                time.sleep(2)
        
        if not chrome_available:
            log_error("Chrome is not running with remote debugging!")
            
            # Run diagnostics
            try:
                from browser_connection import diagnose_chrome_connection
                diag = diagnose_chrome_connection()
                logger.info("Chrome connection diagnostics:")
                logger.info(f"  Port 9222 open: {diag.get('port_9222_open', False)}")
                logger.info(f"  CDP version endpoint: {diag.get('cdp_version_endpoint', False)}")
                logger.info(f"  CDP list endpoint: {diag.get('cdp_list_endpoint', False)}")
                if diag.get('chrome_version'):
                    logger.info(f"  Chrome version: {diag.get('chrome_version')}")
                if diag.get('open_tabs') is not None:
                    logger.info(f"  Open tabs: {diag.get('open_tabs')}")
            except Exception as e:
                logger.debug(f"Diagnostics failed: {e}")
            
            print(f"\nTroubleshooting:")
            print(f"  1. Make sure Chrome is running: ./start_chrome.sh")
            print(f"  2. Check if port 9222 is accessible: curl http://localhost:9222/json/version")
            print(f"  3. Verify Chrome started with: --remote-debugging-port=9222")
            print(f"  4. Check if another process is using port 9222: lsof -i :9222")
            print(f"  5. Try restarting Chrome: pkill -9 'Google Chrome' && ./start_chrome.sh")
            print(f"\nThen log in to ChatGPT, Gemini, Perplexity, Grok in the Chrome window")
            return 1
        
        log_success("Chrome debugging is available")
        
        # Connect to browser with retries
        logger.info("Connecting to Chrome browser...")
        connected = False
        for attempt in range(3):
            try:
                self.browser = BrowserConnection()
                self.browser.connect()
                connected = True
                break
            except ConnectionError as e:
                if attempt < 2:
                    logger.warning(f"Connection attempt {attempt + 1} failed: {e}")
                    logger.info("Retrying connection in 2 seconds...")
                    time.sleep(2)
                else:
                    log_error(f"Failed to connect to Chrome after 3 attempts: {e}")
                    print(f"\nTroubleshooting:")
                    print(f"  1. Verify Chrome is running: ps aux | grep -i chrome")
                    print(f"  2. Test CDP endpoint: curl http://localhost:9222/json/version")
                    print(f"  3. Check Chrome was started with: --remote-debugging-port=9222")
                    print(f"  4. Try restarting Chrome: ./start_chrome.sh")
                    return 1
            except Exception as e:
                log_error(f"Unexpected error connecting to Chrome: {e}")
                return 1
        
        if not connected:
            log_error("Failed to connect to Chrome browser")
            return 1
        
        logger.info(f"📡 Polling {self.config.platform_url} for jobs...")
        logger.info(f"⚡ Processing mode: {mode_str}")
        if self.config.parallel_mode:
            logger.info(f"   ├─ Max parallel engines: {self.config.max_parallel_engines}")
            logger.info(f"   ├─ Concurrency method: {'Multiprocessing (recommended)' if self.config.use_multiprocessing else 'Threading (experimental)'}")
        logger.info(f"🛡️ Anti-detection: {'ACTIVE' if self.config.stealth_mode else 'DISABLED'}")
        if self.config.stealth_mode:
            logger.info(f"   ├─ Request spacing: {self.config.min_delay}-{self.config.max_delay}s")
            logger.info(f"   ├─ Engine cooldowns: {self.config.engine_cooldowns}")
            logger.info(f"   └─ Session ID: {self.anti_detection.session.session_id}")
        logger.info("Press Ctrl+C to stop\n")
        
        # Register with platform
        logger.info(f"📤 Registering {self.worker_id} with platform...")
        self._send_heartbeat(chrome_connected=True, engines_ready=list(ENGINES.keys()), force=True)
        self._start_heartbeat_loop()
        
        consecutive_errors = 0
        
        try:
            while self.running:
                try:
                    # Fetch pending jobs (more for parallel mode)
                    fetch_limit = self.config.max_jobs_per_cycle if self.config.parallel_mode else 5
                    jobs = self.fetch_jobs_from_queue(limit=fetch_limit)
                    
                    if not jobs:
                        logger.debug(f"No pending jobs, waiting {self.config.poll_interval}s...")
                        time.sleep(self.config.poll_interval)
                        consecutive_errors = 0
                        continue
                    
                    logger.info(f"📋 Found {len(jobs)} pending job(s)")
                    
                    # Check for session breaks before processing
                    if self.config.stealth_mode:
                        break_duration = self.anti_detection.should_take_break()
                        if break_duration:
                            logger.info(f"☕ Taking session break: {break_duration:.0f}s")
                            time.sleep(break_duration)
                    
                    if self.config.parallel_mode:
                        # PARALLEL MODE: Process multiple engines simultaneously
                        processed = self.process_jobs_parallel(jobs)
                        
                        if processed == 0:
                            # All engines in cooldown, wait a bit
                            time.sleep(2)
                        else:
                            # Small pause between parallel batches
                            time.sleep(random.uniform(1, 3))
                            consecutive_errors = 0
                    else:
                        # SEQUENTIAL MODE: Process one job at a time
                        job = self.select_best_job(jobs)
                        
                        if not job:
                            logger.debug("No jobs ready (all engines in cooldown)")
                            time.sleep(2)
                            continue
                        
                        if not self.claim_job(job):
                            logger.warning(f"Could not claim job {job.id}, skipping")
                            continue
                        
                        log_progress(1, 1, f"[{job.engine}] {job.prompt_text[:40]}...")
                        result = self.process_job(job)
                        
                        self.record_engine_request(job.engine, result["success"])
                        
                        if result.get("skipped"):
                            self.stats.increment("jobs_skipped")
                            continue
                        
                        if self.complete_job(job, result, result["success"]):
                            self.stats.increment("jobs_processed")
                            consecutive_errors = 0
                        else:
                            self.stats.increment("jobs_failed")
                            consecutive_errors += 1
                        
                        time.sleep(random.uniform(0.5, 1.5))
                    
                except Exception as e:
                    logger.error(f"Error in main loop: {e}")
                    consecutive_errors += 1
                    
                    if consecutive_errors >= self.config.max_consecutive_errors:
                        logger.warning(f"Too many errors ({consecutive_errors}), backing off...")
                        time.sleep(self.config.error_backoff_seconds)
                        consecutive_errors = 0
                    else:
                        time.sleep(5)
        
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
            stats = self.stats.get_all()
            runtime = (datetime.now() - stats["start_time"]).total_seconds()
            
            print("\n" + "=" * 60)
            print("WORKER SUMMARY")
            print("=" * 60)
            print(f"Worker ID:       {self.worker_id}")
            print(f"Mode:            {'PARALLEL' if self.config.parallel_mode else 'SEQUENTIAL'}")
            print(f"Runtime:         {runtime/60:.1f} minutes")
            print(f"Jobs processed:  {stats['jobs_processed']}")
            print(f"Jobs failed:     {stats['jobs_failed']}")
            print(f"Jobs skipped:    {stats['jobs_skipped']}")
            if self.config.parallel_mode:
                print(f"Parallel batches: {stats['parallel_batches']}")
                if stats['parallel_batches'] > 0:
                    avg_per_batch = stats['jobs_processed'] / stats['parallel_batches']
                    print(f"Avg jobs/batch:  {avg_per_batch:.1f}")
            print("=" * 60)
        
        return 0


# ===========================================
# Entry Point
# ===========================================

def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="RPA Worker v2 for EllipseSearch AEO Platform"
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
        default=5,
        help="Seconds between polling for new jobs (default: 5)"
    )
    parser.add_argument(
        "--min-delay",
        type=float,
        default=float(os.getenv("MIN_DELAY", "15")),
        help="Minimum delay between prompts (default: 15)"
    )
    parser.add_argument(
        "--max-delay",
        type=float,
        default=float(os.getenv("MAX_DELAY", "45")),
        help="Maximum delay between prompts (default: 45)"
    )
    parser.add_argument(
        "--parallel",
        action="store_true",
        default=True,  # Default to parallel mode
        help="Enable parallel processing using multiprocessing (default: enabled)"
    )
    parser.add_argument(
        "--sequential",
        action="store_true",
        default=False,
        help="Disable parallel processing and run sequentially"
    )
    parser.add_argument(
        "--no-multiprocessing",
        action="store_true",
        default=False,
        help="Use threading instead of multiprocessing (not recommended, Playwright isn't thread-safe)"
    )
    parser.add_argument(
        "--max-parallel",
        type=int,
        default=4,
        help="Maximum number of engines to process in parallel (default: 4)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose logging"
    )
    parser.add_argument(
        "--log-file",
        type=str,
        default="./rpa_worker_v2.log",
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
    
    # Determine parallel mode (default to True unless --sequential is specified)
    parallel_mode = args.parallel and not args.sequential
    use_multiprocessing = not args.no_multiprocessing  # Use multiprocessing by default
    
    # Create config
    worker_config = WorkerConfig(
        platform_url=args.platform_url,
        webhook_secret=args.secret,
        poll_interval=args.poll_interval,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        stealth_mode=not args.no_stealth,
        parallel_mode=parallel_mode,
        max_parallel_engines=args.max_parallel,
        use_multiprocessing=use_multiprocessing,
    )
    
    if worker_config.stealth_mode:
        logger.info("🛡️ Stealth mode: ENABLED (anti-detection active)")
    else:
        logger.warning("⚠️ Stealth mode: DISABLED (higher detection risk)")
    
    if worker_config.parallel_mode:
        if worker_config.use_multiprocessing:
            logger.info(f"✅ Parallel mode: ENABLED (Multiprocessing - safe for Playwright)")
            logger.info(f"   └─ Max parallel processes: {worker_config.max_parallel_engines}")
        else:
            logger.warning(f"⚠️ Parallel mode: ENABLED (Threading - EXPERIMENTAL, may cause issues)")
            logger.warning(f"   └─ Max parallel threads: {worker_config.max_parallel_engines}")
    else:
        logger.info("📋 Sequential mode: ENABLED (one job at a time)")
    
    # Create and run worker
    worker = RPAWorkerV2(worker_config)
    return worker.run()


if __name__ == "__main__":
    sys.exit(main())
