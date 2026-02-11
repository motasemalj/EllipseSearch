"""
Utilities for extracting and normalizing sources/domains from AI responses.

Goal: make RPA mode robust to UI changes by combining:
- Explicit citation links / source cards (from DOM)
- Plain-text domain mentions inside the response body (e.g. "example.com")
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import urlparse


# Fairly strict domain pattern:
# - requires at least one dot
# - supports punycode TLDs (xn--)
# - allows optional scheme and optional port
_DOMAIN_OR_URL_RE = re.compile(
    r"(?ix)\b("
    r"(?:https?://)?"  # optional scheme
    r"(?:www\.)?"
    r"(?:"
    r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\."
    r")+"
    r"(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})"  # TLD
    r"(?::\d{2,5})?"  # optional port
    r")"
)


def _strip_trailing_punct(s: str) -> str:
    return s.strip().rstrip(").,;:!?'\"”’]}>\u00bb")


def normalize_domain(domain_or_url: str) -> str:
    """
    Normalize a domain (or URL) into a bare hostname without www/port.
    Returns "" if it can't be parsed safely.
    """
    if not domain_or_url:
        return ""

    raw = _strip_trailing_punct(domain_or_url.strip())
    if not raw:
        return ""

    # If it doesn't have a scheme, urlparse treats it as a path; add scheme.
    to_parse = raw if re.match(r"(?i)^https?://", raw) else f"https://{raw}"

    try:
        parsed = urlparse(to_parse)
        host = (parsed.hostname or "").strip().lower()
        if host.startswith("www."):
            host = host[4:]
        # Basic sanity: must contain a dot and no spaces
        if "." not in host or any(ch.isspace() for ch in host):
            return ""
        return host
    except Exception:
        return ""


def is_excluded_domain(domain: str, exclude_domains: Sequence[str]) -> bool:
    d = domain.lower().strip()
    for ex in exclude_domains:
        exn = ex.lower().strip()
        if not exn:
            continue
        if d == exn or d.endswith(f".{exn}"):
            return True
    return False


def extract_domain_mentions(text: str, exclude_domains: Optional[Sequence[str]] = None) -> List[str]:
    """
    Extract domain mentions (and domains inside URLs) from free text.
    Returns unique, normalized hostnames.
    """
    if not text:
        return []

    excludes = list(exclude_domains or [])
    found: List[str] = []
    seen: Set[str] = set()

    for m in _DOMAIN_OR_URL_RE.finditer(text):
        raw = m.group(1)
        if not raw:
            continue
        # Avoid emails (domain-like text after @); heuristic: check preceding char
        start = m.start(1)
        if start > 0 and text[start - 1] == "@":
            continue

        domain = normalize_domain(raw)
        if not domain:
            continue
        if excludes and is_excluded_domain(domain, excludes):
            continue
        if domain in seen:
            continue
        seen.add(domain)
        found.append(domain)

    return found


def domain_to_probable_url(domain: str) -> str:
    d = normalize_domain(domain)
    return f"https://{d}" if d else ""


def merge_sources(existing: List[Dict[str, str]], additions: Iterable[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Merge sources, de-duping primarily by URL.
    Existing sources win if there's a collision (keeps richer titles).

    IMPORTANT: Do NOT de-dupe by domain, because engines frequently cite multiple pages
    from the same domain and we want to preserve them as distinct sources.
    """
    merged: List[Dict[str, str]] = list(existing or [])
    seen_urls: Set[str] = set()
    seen_keys: Set[str] = set()

    for s in merged:
        url = (s.get("url") or "").strip()
        dom = (s.get("domain") or "").strip().lower()
        if url:
            seen_urls.add(url)
            seen_keys.add(url)
        elif dom:
            seen_keys.add(f"domain:{dom}")

    for s in additions:
        if not s:
            continue
        url = (s.get("url") or "").strip()
        dom = (s.get("domain") or "").strip().lower()
        key = url if url else (f"domain:{dom}" if dom else "")
        if not key:
            continue
        if key in seen_keys:
            continue

        merged.append(s)
        seen_keys.add(key)
        if url:
            seen_urls.add(url)

    return merged


def sources_from_domain_mentions(domains: Iterable[str]) -> List[Dict[str, str]]:
    sources: List[Dict[str, str]] = []
    seen: Set[str] = set()
    for d in domains:
        nd = normalize_domain(d)
        if not nd:
            continue
        if nd in seen:
            continue
        seen.add(nd)
        sources.append(
            {
                "url": domain_to_probable_url(nd),
                "title": nd,
                "domain": nd,
            }
        )
    return sources


