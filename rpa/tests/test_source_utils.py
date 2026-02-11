import unittest

from utils.source_utils import (
    extract_domain_mentions,
    merge_sources,
    normalize_domain,
    sources_from_domain_mentions,
)


class TestSourceUtils(unittest.TestCase):
    def test_normalize_domain_basic(self):
        self.assertEqual(normalize_domain("https://www.Example.com/path?q=1"), "example.com")
        self.assertEqual(normalize_domain("example.com"), "example.com")
        self.assertEqual(normalize_domain("www.example.com"), "example.com")

    def test_extract_domain_mentions_from_text(self):
        text = "Try example.com, also https://news.ycombinator.com and (www.nytimes.com)."
        domains = extract_domain_mentions(text)
        self.assertIn("example.com", domains)
        self.assertIn("news.ycombinator.com", domains)
        self.assertIn("nytimes.com", domains)

    def test_extract_domain_mentions_excludes_engine_domains(self):
        text = "This is on chatgpt.com and openai.com but also on wikipedia.org"
        domains = extract_domain_mentions(text, exclude_domains=["chatgpt.com", "openai.com"])
        self.assertNotIn("chatgpt.com", domains)
        self.assertNotIn("openai.com", domains)
        self.assertIn("wikipedia.org", domains)

    def test_merge_sources_dedupes(self):
        existing = [
            {"url": "https://a.com/x", "title": "A", "domain": "a.com"},
        ]
        additions = [
            {"url": "https://a.com/x", "title": "A2", "domain": "a.com"},
            {"url": "https://b.com", "title": "B", "domain": "b.com"},
            {"url": "https://www.b.com/y", "title": "B2", "domain": "b.com"},
        ]
        merged = merge_sources(existing, additions)
        # keeps existing a.com/x, adds BOTH b.com URLs (do not de-dupe by domain)
        self.assertEqual(len(merged), 3)
        self.assertEqual(merged[0]["url"], "https://a.com/x")
        self.assertEqual(merged[1]["domain"], "b.com")
        self.assertEqual(merged[2]["domain"], "b.com")

    def test_sources_from_domain_mentions(self):
        sources = sources_from_domain_mentions(["example.com", "www.example.com"])
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["domain"], "example.com")
        self.assertTrue(sources[0]["url"].startswith("https://"))


if __name__ == "__main__":
    unittest.main()


