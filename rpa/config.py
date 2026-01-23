"""
Configuration for RPA Browser Automation

This module contains all configurable settings for the headed browser automation.
Modify these values or use environment variables to customize behavior.
"""

import os
from dataclasses import dataclass, field
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# ===========================================
# Engine URLs
# ===========================================

ENGINE_URLS = {
    "chatgpt": "https://chatgpt.com",
    "gemini": "https://gemini.google.com/app",
    "perplexity": "https://www.perplexity.ai",
    "grok": "https://grok.x.ai",
}

# ===========================================
# CDP Connection Settings
# ===========================================

@dataclass
class CDPConfig:
    """Chrome DevTools Protocol connection configuration."""
    
    # CDP endpoint - default Chrome debugging port
    cdp_url: str = field(default_factory=lambda: os.getenv("CDP_URL", "http://localhost:9222"))
    
    # Connection timeout in seconds
    connection_timeout: int = 30
    
    # Whether to use existing tab or create new one
    use_existing_tab: bool = True

# ===========================================
# Timing Configuration
# ===========================================

@dataclass
class TimingConfig:
    """Timing and delay configuration for human-like behavior."""
    
    # Random delay range between prompts (seconds)
    min_delay_between_prompts: float = field(
        default_factory=lambda: float(os.getenv("MIN_DELAY", "5"))
    )
    max_delay_between_prompts: float = field(
        default_factory=lambda: float(os.getenv("MAX_DELAY", "10"))
    )
    
    # Typing speed (characters per second, with variance)
    typing_speed_cps: float = 8.0  # ~8 chars/sec = ~480ms per char, human-like
    typing_variance: float = 0.3  # 30% variance
    
    # Wait for response timeout (seconds)
    response_timeout: int = 120
    
    # Page load timeout (seconds)
    page_load_timeout: int = 60
    
    # Wait after clicking submit (seconds)
    post_submit_wait: tuple = (1.0, 2.0)  # (min, max)
    
    # Wait before typing (after focusing input)
    pre_type_wait: tuple = (0.5, 1.5)

# ===========================================
# Output Configuration  
# ===========================================

@dataclass
class OutputConfig:
    """Output and webhook configuration."""
    
    # Webhook URL to send results (optional)
    webhook_url: Optional[str] = field(
        default_factory=lambda: os.getenv("WEBHOOK_URL")
    )
    
    # Webhook secret for authentication
    webhook_secret: Optional[str] = field(
        default_factory=lambda: os.getenv("WEBHOOK_SECRET")
    )
    
    # JSON backup file path
    output_json_path: str = field(
        default_factory=lambda: os.getenv("OUTPUT_JSON", "./rpa_results.json")
    )
    
    # Save progress after each prompt
    save_progress_incrementally: bool = True
    
    # Progress backup interval (every N prompts)
    progress_backup_interval: int = 5

# ===========================================
# Error Handling Configuration
# ===========================================

@dataclass
class ErrorConfig:
    """Error handling and retry configuration."""
    
    # Maximum retries per prompt
    max_retries: int = 3
    
    # Retry delay (seconds)
    retry_delay: float = 5.0
    
    # Continue on error vs stop
    continue_on_error: bool = True
    
    # Log file path
    log_file: str = field(
        default_factory=lambda: os.getenv("LOG_FILE", "./rpa_log.txt")
    )
    
    # Screenshot on error
    screenshot_on_error: bool = True
    
    # Screenshot directory
    screenshot_dir: str = field(
        default_factory=lambda: os.getenv("SCREENSHOT_DIR", "./screenshots")
    )

# ===========================================
# Engine-Specific Selectors
# ===========================================

ENGINE_SELECTORS = {
    "chatgpt": {
        # Input selectors (try in order) - Updated Jan 2026
        "prompt_input": [
            "#prompt-textarea",
            "div[id='prompt-textarea']",
            "textarea[data-id='composer-input']",
            "div[contenteditable='true'][role='textbox']",
            "textarea[placeholder*='Message']",
            "textarea[placeholder*='message']",
            "[contenteditable='true'][data-placeholder]",
            "textarea[role='textbox']",
            "textarea",
        ],
        "submit_button": [
            "[data-testid='send-button']",
            "button[data-testid='send-button']",
            "button[aria-label='Send prompt']",
            "button[aria-label*='Send']",
            "button[aria-label*='send']",
            "button[type='submit']",
            "button:has(svg[class*='send'])",
        ],
        # Response selectors - Updated for current ChatGPT DOM (Jan 2026)
        "response_container": "[data-message-author-role='assistant']",
        "response_text": ".markdown.prose, [class*='prose'], .markdown, [class*='markdown'], [class*='response-content']",
        "streaming_indicator": "[data-state='streaming'], .result-streaming, [class*='animate-pulse'], [class*='result-streaming'], svg.animate-spin",
        # Sources - Updated with more selectors
        "sources_section": "[class*='sources'], [class*='webSearchResults'], [class*='web-search'], [class*='citation'], [class*='references']",
        "source_card": "[class*='source-card'], [class*='WebSearchResult'], [class*='source-'], [class*='citation-card'], [class*='reference-card']",
        "citation_link": "a[href^='http']:not([href*='openai.com']):not([href*='chatgpt.com'])",
        # Error/loading
        "error_message": "[class*='error-message'], [role='alert'], [class*='error']",
        "loading_indicator": "[class*='loading'], [class*='thinking'], [class*='generating'], [class*='typing']",
        "rate_limit": "[class*='rate-limit'], [class*='capacity']",
        # New chat - Updated with more options
        "new_chat_button": "[data-testid='new-chat-button'], [data-testid='create-new-chat-button'], [aria-label*='New chat'], a[href='/'], button:has-text('New chat')",
        # Stop button (to detect when streaming completes)
        "stop_button": "button[aria-label*='Stop'], [data-testid='stop-button'], [aria-label='Stop generating']",
    },
    
    "gemini": {
        "prompt_input": [
            "rich-textarea",
            "[contenteditable='true']",
            "textarea",
        ],
        "submit_button": [
            "button[aria-label*='Send']",
            "[class*='send-button']",
            "button[type='submit']",
        ],
        "response_container": ".model-response-text, [class*='response-container'], message-content",
        "response_text": ".markdown-main-panel, [class*='markdown']",
        "streaming_indicator": ".loading-state, [class*='loading'], [class*='pending']",
        "sources_section": ".grounding-sources, [class*='grounding']",
        "source_card": ".source-chip, [class*='source-chip']",
        "citation_link": "a.source-link, [class*='source-link']",
        "error_message": ".error-container, [class*='error']",
        "loading_indicator": ".loading-indicator, [class*='loading']",
        "new_chat_button": "[aria-label*='New chat'], [class*='new-conversation']",
    },
    
    "perplexity": {
        "prompt_input": [
            "textarea[placeholder*='Ask']",
            "textarea[data-testid='search-input']",
            "textarea",
        ],
        "submit_button": [
            "button[type='submit']",
            "button[aria-label*='Search']",
            "button[aria-label*='Submit']",
        ],
        "response_container": "[class*='prose'], [class*='response-text']",
        "response_text": "[class*='prose'] > div, [class*='markdown']",
        "streaming_indicator": "[class*='animate-pulse'], [class*='typing']",
        "sources_section": "[class*='sources-section']",
        "source_card": "[class*='source-card'], [class*='source-item']",
        "citation_link": "a[class*='citation']",
        "error_message": "[class*='error'], [role='alert']",
        "loading_indicator": "[class*='loading'], [class*='spinner']",
        "related_questions": "[class*='related-question']",
    },
    
    "grok": {
        "prompt_input": [
            "textarea[placeholder*='message']",
            "[class*='chat-input']",
            "textarea",
        ],
        "submit_button": [
            "button[type='submit']",
            "[class*='send-button']",
        ],
        "response_container": "[class*='message-content'], [class*='grok-response']",
        "response_text": "[class*='markdown']",
        "streaming_indicator": "[class*='typing'], [class*='loading']",
        "sources_section": ".sources-section",
        "source_card": ".source-preview, [class*='source-card']",
        "x_post_embed": ".x-post-embed, [class*='tweet-embed']",
        "error_message": ".error-banner, [class*='error']",
        "loading_indicator": ".thinking-indicator, [class*='loading']",
        "new_chat_button": "[class*='new-chat']",
    },
}

# ===========================================
# Main Config Class
# ===========================================

@dataclass
class RPAConfig:
    """Main configuration container."""
    
    cdp: CDPConfig = field(default_factory=CDPConfig)
    timing: TimingConfig = field(default_factory=TimingConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    error: ErrorConfig = field(default_factory=ErrorConfig)
    
    # Engine to use (can be overridden per prompt)
    default_engine: str = "chatgpt"
    
    # Brand domain for visibility checking
    brand_domain: Optional[str] = field(
        default_factory=lambda: os.getenv("BRAND_DOMAIN")
    )
    
    # Brand aliases for matching
    brand_aliases: list = field(default_factory=list)

# Create default config instance
config = RPAConfig()

