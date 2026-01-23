# Browser Automation Authentication Guide

This guide explains how to configure authentication for browser-based AI engine simulations.

## Overview

The browser automation system supports multiple authentication methods for each AI platform:

| Engine | Auth Methods | Recommended |
|--------|--------------|-------------|
| ChatGPT | Cookies, Session Token, Email/Password | **Cookies** |
| Perplexity | Cookies, Session Token, Email | **Cookies** |
| Gemini | Cookies, Google OAuth | **Cookies** |
| Grok | Cookies, X/Twitter OAuth | **Cookies** |

**Cookie injection is the fastest and most reliable method** as it bypasses login flows entirely.

## Quick Start

### 1. Enable Browser Mode

Set these environment variables in your `.env` file:

```bash
# Enable browser simulation mode
BROWSER_SIMULATION_MODE=browser

# Enable stealth mode (recommended)
BROWSER_STEALTH_MODE=true

# Enable human-like behavior
BROWSER_HUMAN_BEHAVIOR=true
```

### 2. Configure Authentication

Choose your preferred method below.

---

## Method 1: Cookie Injection (Recommended)

Fastest and most reliable. Extract cookies from a logged-in browser session.

### How to Get Cookies

1. Log into the AI platform in your browser
2. Open Developer Tools (F12) → Application → Cookies
3. Copy the essential cookies listed below
4. Format as JSON array

### ChatGPT Cookies

Essential cookies: `__Secure-next-auth.session-token`, `_puid`

```bash
CHATGPT_COOKIES='[
  {"name": "__Secure-next-auth.session-token", "value": "your-token-here", "domain": ".chat.openai.com"},
  {"name": "_puid", "value": "your-puid-here", "domain": ".chat.openai.com"}
]'
```

### Perplexity Cookies

Essential cookies: `pplx.visitor-id`, session cookies

```bash
PERPLEXITY_COOKIES='[
  {"name": "pplx.visitor-id", "value": "your-visitor-id", "domain": ".perplexity.ai"},
  {"name": "__Secure-next-auth.session-token", "value": "your-token", "domain": ".perplexity.ai"}
]'
```

### Gemini (Google) Cookies

Essential cookies: `SAPISID`, `HSID`, `SID`, `SSID`

```bash
GOOGLE_COOKIES='[
  {"name": "SAPISID", "value": "your-sapisid", "domain": ".google.com"},
  {"name": "HSID", "value": "your-hsid", "domain": ".google.com"},
  {"name": "SID", "value": "your-sid", "domain": ".google.com"},
  {"name": "SSID", "value": "your-ssid", "domain": ".google.com"}
]'
```

### Grok (X/Twitter) Cookies

Essential cookies: `auth_token`, `ct0`

```bash
X_COOKIES='[
  {"name": "auth_token", "value": "your-auth-token", "domain": ".x.com"},
  {"name": "ct0", "value": "your-ct0", "domain": ".x.com"}
]'
```

---

## Method 2: Session Token Injection

Faster than login, but requires obtaining the session token.

```bash
# ChatGPT
CHATGPT_SESSION_TOKEN=your-session-token

# Perplexity  
PERPLEXITY_SESSION_TOKEN=your-session-token

# Gemini
GEMINI_SESSION_TOKEN=your-session-token

# Grok (uses X/Twitter session)
X_SESSION_TOKEN=your-session-token
```

---

## Method 3: Email/Password Login

Full interactive login flow. May trigger 2FA or CAPTCHA.

```bash
# ChatGPT
CHATGPT_EMAIL=your-email@example.com
CHATGPT_PASSWORD=your-password

# Perplexity
PERPLEXITY_EMAIL=your-email@example.com
PERPLEXITY_PASSWORD=your-password

# Gemini (Google account)
GOOGLE_EMAIL=your-google@gmail.com
GOOGLE_PASSWORD=your-password

# Grok (X/Twitter account)
X_EMAIL=your-twitter-email@example.com
X_PASSWORD=your-password
```

⚠️ **Warning**: Email/password login is least reliable due to:
- 2FA requirements
- CAPTCHA challenges
- Account security blocks

---

## Advanced Configuration

### Stealth Mode

Stealth mode helps avoid bot detection:

```bash
# Enable anti-detection measures
BROWSER_STEALTH_MODE=true

# Enable human-like behavior (typing delays, mouse movements)
BROWSER_HUMAN_BEHAVIOR=true
```

### Session Persistence

Sessions are saved encrypted and reused:

```bash
# Enable session saving/restoration
BROWSER_PERSIST_SESSIONS=true

# Encryption key for stored sessions (change in production!)
SESSION_ENCRYPTION_KEY=your-strong-random-key
```

### Rate Limiting

Prevent detection by limiting request frequency:

```bash
# Requests per minute per engine
CHATGPT_RATE_LIMIT=10
PERPLEXITY_RATE_LIMIT=15
GEMINI_RATE_LIMIT=12
GROK_RATE_LIMIT=10
```

### Proxy Configuration

Use proxies to avoid IP-based blocking:

```bash
# Simple comma-separated proxies
BROWSER_PROXY_LIST=http://proxy1.example.com:8080,http://proxy2.example.com:8080

# Or JSON format with auth
BROWSER_PROXY_LIST='[
  {"server": "http://proxy1.example.com:8080", "username": "user1", "password": "pass1"},
  {"server": "http://proxy2.example.com:8080", "region": "us-east"}
]'
```

---

## Extracting Cookies (Step-by-Step)

### Chrome / Edge / Brave

1. Go to the AI platform and log in
2. Press F12 to open Developer Tools
3. Go to **Application** tab → **Cookies** → select the domain
4. Find the essential cookies (listed above for each platform)
5. Right-click → Copy value

### Firefox

1. Go to the AI platform and log in
2. Press F12 to open Developer Tools
3. Go to **Storage** tab → **Cookies**
4. Find and copy the essential cookies

### Using Browser Extension

You can also use a cookie export extension like:
- **Cookie-Editor** (Chrome/Firefox)
- **EditThisCookie** (Chrome)

Export as JSON and paste directly into the environment variable.

---

## Security Best Practices

1. **Never commit credentials** - Add `.env` to `.gitignore`
2. **Use Trigger.dev Dashboard** - For production, add secrets to the dashboard
3. **Rotate cookies regularly** - Session cookies expire; refresh them monthly
4. **Use dedicated accounts** - Create accounts specifically for automation
5. **Enable 2FA carefully** - If using email/password, 2FA will block automation
6. **Monitor for blocks** - Check logs for authentication failures

---

## Troubleshooting

### "Authentication required but failed"

- Cookies may have expired → Extract fresh cookies
- Session token invalid → Get a new token
- 2FA required → Use cookies instead of email/password

### "CAPTCHA required"

- Too many login attempts → Wait and try again
- Use cookies instead of login flow
- Try a different IP/proxy

### "Browser mode failed, falling back to API"

- Check Playwright is installed: `npx playwright install chromium`
- Verify environment variables are set correctly
- Check logs for specific error messages

### "Rate limit reached"

- Reduce `RATE_LIMITS` values
- Add longer delays between requests
- Use multiple accounts (with separate cookies)

---

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `BROWSER_SIMULATION_MODE` | `api`, `browser`, or `hybrid` | `api` |
| `BROWSER_STEALTH_MODE` | Enable anti-detection | `true` |
| `BROWSER_HUMAN_BEHAVIOR` | Enable human-like actions | `true` |
| `BROWSER_PERSIST_SESSIONS` | Save sessions to disk | `true` |
| `SESSION_ENCRYPTION_KEY` | Key for encrypting sessions | (auto-generated) |
| `BROWSER_HEADLESS` | Run browser headlessly | `true` |
| `BROWSER_TIMEOUT` | Timeout in ms | `120000` |
| `BROWSER_CAPTURE_SCREENSHOTS` | Save debug screenshots | `false` |
| `BROWSER_BLOCK_IMAGES` | Block images for speed | `true` |
| `BROWSER_BLOCK_ANALYTICS` | Block tracking scripts | `true` |
| `[ENGINE]_EMAIL` | Login email | - |
| `[ENGINE]_PASSWORD` | Login password | - |
| `[ENGINE]_SESSION_TOKEN` | Session token | - |
| `[ENGINE]_COOKIES` | JSON array of cookies | - |

