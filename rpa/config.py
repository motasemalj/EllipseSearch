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
    "grok": "https://grok.com",
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
            "rich-textarea [contenteditable='true']",
            "[contenteditable='true'][role='textbox']",
            "textarea[placeholder*='Enter a prompt']",
            "textarea[aria-label*='prompt']",
            "textarea",
            "input[type='text']",
        ],
        "submit_button": [
            "button[aria-label*='Send']",
            "button[aria-label*='send']",
            "button[data-testid='send-button']",
            "[class*='send-button']",
            "button[type='submit']",
            "button:has(svg[class*='send'])",
            "button[class*='submit']",
        ],
        # Response containers (Gemini UI uses a markdown panel with id "model-response-message-content...") 
        "response_container": (
            "[id^='model-response-message-content'], "
            "div.markdown.markdown-main-panel, "
            ".markdown-main-panel, "
            ".model-response-text, "
            "[class*='response-container'], "
            "message-content, "
            "[class*='model-response']"
        ),
        # Response text extraction (prefer markdown panel)
        "response_text": "div.markdown.markdown-main-panel, .markdown-main-panel, [class*='markdown'], [class*='response-text']",
        "streaming_indicator": ".loading-state, [class*='loading'], [class*='pending'], [class*='streaming']",
        "sources_section": ".grounding-sources, [class*='grounding'], [class*='sources']",
        "source_card": ".source-chip, [class*='source-chip'], [class*='citation-chip']",
        "citation_link": "a.source-link, [class*='source-link'], a[href^='http']:not([href*='google.com'])",
        "error_message": ".error-container, [class*='error'], [role='alert']",
        "loading_indicator": ".loading-indicator, [class*='loading'], [class*='spinner']",
        "new_chat_button": "[aria-label*='New chat'], [class*='new-conversation'], button[aria-label*='New']",
    },
    
    "perplexity": {
        "prompt_input": [
            "textarea[placeholder*='Ask']",
            "textarea[placeholder*='ask']",
            "textarea[data-testid='search-input']",
            "textarea[data-testid='perplexity-input']",
            "textarea[aria-label*='Ask']",
            "textarea[aria-label*='ask']",
            "div[contenteditable='true'][role='textbox']",
            "textarea",
            "input[type='text']",
        ],
        "submit_button": [
            "button[type='submit']",
            "button[aria-label*='Search']",
            "button[aria-label*='Submit']",
            "button[data-testid='submit-button']",
            "button:has(svg[class*='send'])",
            "button:has(svg[class*='arrow'])",
            "button[class*='submit']",
            "button[class*='send']",
        ],
        # Perplexity 2026 UI: responses use div.prose with dark:prose-invert
        "response_container": "div.prose, div.prose.dark\\:prose-invert, [class*='prose'][class*='inline'], [class*='response-text'], [class*='answer']",
        "response_text": "div.prose, p.my-2, h2, ul.list-disc, li, p",
        "streaming_indicator": "[class*='animate-pulse'], [class*='typing'], [class*='streaming'], [class*='loading']",
        "sources_section": "[class*='sources-section'], [class*='sources']",
        "source_card": "[class*='source-card'], [class*='source-item'], [class*='citation-card'], span.citation",
        "citation_link": "span.citation a[href^='http'], a[data-pplx-citation], a[href^='http']:not([href*='perplexity.ai'])",
        "error_message": "[class*='error'], [role='alert']",
        "loading_indicator": "[class*='loading'], [class*='spinner'], [class*='thinking']",
        "related_questions": "[class*='related-question'], [class*='suggestion']",
        "new_chat_button": "button[aria-label*='New chat'], a[href='/']",
    },
    
    "grok": {
        "prompt_input": [
            # New Grok UI (ProseMirror/TipTap editor) - 2026 version
            "div.tiptap.ProseMirror[contenteditable='true']",
            "div.ProseMirror[contenteditable='true']",
            "div[contenteditable='true'].ProseMirror",
            "div[contenteditable='true'].tiptap",
            "div[contenteditable='true'][tabindex='0']",
            # Fallbacks
            "textarea[placeholder*='Ask Grok']",
            "textarea[placeholder*='message']",
            "textarea[placeholder*='Message']",
            "[class*='chat-input']",
            "[class*='message-input']",
            "textarea[aria-label*='message']",
            "div[contenteditable='true'][role='textbox']",
            "textarea",
        ],
        "submit_button": [
            "button[type='submit']",
            "button[aria-label*='Send']",
            "button[aria-label*='send']",
            "[class*='send-button']",
            "button[class*='submit']",
            "button:has(svg[class*='send'])",
            "button[data-testid='send-button']",
        ],
        # Grok 2026 UI: responses use .response-content-markdown and .markdown classes
        "response_container": "div.response-content-markdown, div.markdown, [class*='response-content-markdown'], [class*='response-content'], [class*='message-content']",
        "response_text": "div.response-content-markdown, div.markdown, p, h3, ul, ol",
        "streaming_indicator": "[class*='typing'], [class*='loading'], [class*='streaming'], [class*='thinking'], [class*='animate-pulse']",
        "sources_section": ".sources-section, [class*='sources'], [class*='citations']",
        "source_card": ".source-preview, [class*='source-card'], [class*='citation']",
        "x_post_embed": ".x-post-embed, [class*='tweet-embed'], [class*='x-post'], [class*='twitter-embed']",
        "citation_link": "a[href^='http']:not([href*='grok.com']):not([href*='x.com'])",
        "error_message": ".error-banner, [class*='error'], [role='alert']",
        "loading_indicator": ".thinking-indicator, [class*='loading'], [class*='spinner']",
        "new_chat_button": "[class*='new-chat'], button[aria-label*='New'], a[href='/']",
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

    # Maximum number of sources to return per response (0 = unlimited).
    # Note: some engines can surface a lot of citations; keep this reasonably high to avoid truncation.
    max_sources_per_response: int = field(
        default_factory=lambda: int(os.getenv("MAX_SOURCES_PER_RESPONSE", "200"))
    )
    
    # Brand domain for visibility checking
    brand_domain: Optional[str] = field(
        default_factory=lambda: os.getenv("BRAND_DOMAIN")
    )
    
    # Brand aliases for matching
    brand_aliases: list = field(default_factory=list)

# Create default config instance
config = RPAConfig()

