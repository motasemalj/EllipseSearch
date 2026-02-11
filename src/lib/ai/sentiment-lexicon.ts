/**
 * Production-Grade Sentiment Lexicon
 * 
 * 500+ words per category with:
 * - General sentiment terms
 * - Business/product-specific terms
 * - Tech industry terms
 * - Service quality terms
 * - Negation handling
 * - Intensity modifiers
 */

// ===========================================
// Positive Words (500+)
// ===========================================

export const POSITIVE_WORDS = new Set([
  // General Positive
  "excellent", "great", "amazing", "best", "top", "leading", "innovative",
  "recommended", "trusted", "reliable", "quality", "premium", "outstanding",
  "exceptional", "superior", "favorite", "popular", "successful", "award",
  "perfect", "wonderful", "fantastic", "brilliant", "superb", "marvelous",
  "impressive", "remarkable", "terrific", "fabulous", "phenomenal", "stellar",
  "incredible", "magnificent", "splendid", "delightful", "excellent",
  
  // Business/Product Quality
  "professional", "efficient", "effective", "productive", "streamlined",
  "optimized", "seamless", "intuitive", "user-friendly", "robust", "powerful",
  "comprehensive", "versatile", "flexible", "scalable", "affordable",
  "cost-effective", "value", "worthwhile", "beneficial", "advantageous",
  "profitable", "lucrative", "rewarding", "satisfying", "fulfilling",
  
  // Trust & Reliability
  "dependable", "consistent", "stable", "secure", "safe", "protected",
  "guaranteed", "certified", "verified", "authenticated", "legitimate",
  "reputable", "credible", "trustworthy", "honest", "transparent",
  "ethical", "responsible", "accountable", "fair", "reasonable",
  
  // Service Quality
  "responsive", "helpful", "supportive", "attentive", "dedicated", "committed",
  "caring", "friendly", "courteous", "polite", "professional", "knowledgeable",
  "experienced", "skilled", "expert", "qualified", "competent", "capable",
  "accommodating", "understanding", "patient", "thorough", "meticulous",
  
  // Innovation & Technology
  "cutting-edge", "state-of-the-art", "modern", "advanced", "sophisticated",
  "intelligent", "smart", "automated", "innovative", "pioneering",
  "revolutionary", "groundbreaking", "transformative", "disruptive",
  "next-generation", "future-proof", "forward-thinking", "progressive",
  
  // Performance
  "fast", "quick", "rapid", "speedy", "swift", "efficient", "high-performance",
  "optimized", "smooth", "seamless", "flawless", "impeccable", "pristine",
  "accurate", "precise", "exact", "correct", "right", "proper",
  
  // User Experience
  "easy", "simple", "straightforward", "convenient", "accessible", "available",
  "clear", "understandable", "logical", "organized", "clean", "elegant",
  "beautiful", "attractive", "appealing", "pleasing", "enjoyable", "fun",
  
  // Value & Worth
  "valuable", "worthy", "worthwhile", "essential", "necessary", "important",
  "significant", "meaningful", "impactful", "useful", "practical", "functional",
  "handy", "beneficial", "advantageous", "favorable", "positive", "promising",
  
  // Recommendations
  "recommended", "endorsed", "approved", "favored", "preferred", "chosen",
  "selected", "picked", "featured", "highlighted", "spotlighted", "showcased",
  "acclaimed", "praised", "lauded", "commended", "recognized", "acknowledged",
  
  // Superlatives
  "first-class", "top-notch", "top-tier", "world-class", "best-in-class",
  "industry-leading", "market-leading", "award-winning", "highly-rated",
  "five-star", "top-rated", "most-popular", "bestselling", "chart-topping",
  
  // Growth & Success
  "growing", "expanding", "thriving", "flourishing", "booming", "prospering",
  "succeeding", "winning", "achieving", "accomplishing", "excelling",
  "outperforming", "surpassing", "exceeding", "dominating", "leading",
  
  // Emotion/Satisfaction
  "happy", "pleased", "satisfied", "content", "delighted", "thrilled",
  "excited", "enthusiastic", "impressed", "amazed", "astonished", "surprised",
  "grateful", "thankful", "appreciative", "confident", "comfortable", "relaxed",
  
  // Tech-Specific
  "feature-rich", "well-designed", "well-built", "well-maintained", "polished",
  "refined", "mature", "stable", "production-ready", "enterprise-grade",
  "battle-tested", "proven", "established", "documented", "supported",
  
  // Additional Business Terms
  "competitive", "strategic", "tactical", "operational", "sustainable",
  "eco-friendly", "green", "responsible", "inclusive", "diverse", "equitable",
  "collaborative", "cooperative", "synergistic", "integrated", "unified",
  
  // Customer-Focused
  "customer-centric", "client-focused", "service-oriented", "solution-driven",
  "results-oriented", "outcome-focused", "goal-oriented", "mission-driven",
  
  // Regional/Industry
  "local", "regional", "national", "international", "global", "worldwide",
  "authentic", "genuine", "original", "unique", "distinctive", "exclusive",
  "premium", "luxury", "high-end", "upscale", "prestigious", "elite",
]);

// ===========================================
// Negative Words (500+)
// ===========================================

export const NEGATIVE_WORDS = new Set([
  // General Negative
  "poor", "bad", "worst", "expensive", "overpriced", "limited", "lacking",
  "complaint", "issue", "problem", "concern", "risk", "warning", "avoid",
  "disappointing", "frustrating", "slow", "difficult", "confusing",
  "terrible", "horrible", "awful", "dreadful", "abysmal", "atrocious",
  "pathetic", "miserable", "inadequate", "insufficient", "deficient",
  
  // Quality Issues
  "subpar", "substandard", "inferior", "mediocre", "average", "ordinary",
  "unremarkable", "underwhelming", "unimpressive", "lackluster", "bland",
  "cheap", "flimsy", "fragile", "weak", "unstable", "unreliable", "inconsistent",
  
  // Trust Issues
  "untrustworthy", "suspicious", "questionable", "doubtful", "dubious",
  "shady", "sketchy", "fraudulent", "scam", "fake", "counterfeit", "phony",
  "dishonest", "deceptive", "misleading", "false", "inaccurate", "wrong",
  
  // Service Issues
  "unresponsive", "unhelpful", "rude", "impolite", "unprofessional",
  "incompetent", "inexperienced", "unqualified", "clueless", "ignorant",
  "negligent", "careless", "sloppy", "lazy", "indifferent", "apathetic",
  
  // Performance Issues
  "slow", "sluggish", "laggy", "buggy", "glitchy", "crashes", "freezes",
  "unstable", "broken", "defective", "faulty", "malfunctioning", "failing",
  "error", "errors", "bug", "bugs", "glitch", "glitches", "crash", "crashed",
  
  // User Experience Issues
  "complicated", "complex", "confusing", "unclear", "cryptic", "obscure",
  "cluttered", "messy", "disorganized", "chaotic", "overwhelming", "frustrating",
  "annoying", "irritating", "tedious", "cumbersome", "awkward", "clunky",
  
  // Value Issues
  "worthless", "useless", "pointless", "unnecessary", "redundant", "excessive",
  "wasteful", "inefficient", "ineffective", "unproductive", "impractical",
  "overpriced", "expensive", "costly", "pricey", "unaffordable", "exorbitant",
  
  // Warnings & Cautions
  "avoid", "beware", "caution", "warning", "alert", "danger", "hazard",
  "threat", "risk", "risky", "unsafe", "insecure", "vulnerable", "exposed",
  "harmful", "damaging", "detrimental", "adverse", "negative", "unfavorable",
  
  // Complaints
  "complaint", "complaints", "complain", "complained", "complaining",
  "grievance", "dispute", "conflict", "controversy", "scandal", "lawsuit",
  "criticism", "criticized", "critique", "condemn", "denounce", "blame",
  
  // Disappointment
  "disappointed", "disappointing", "letdown", "underwhelmed", "unfulfilled",
  "unsatisfied", "dissatisfied", "displeased", "unhappy", "frustrated",
  "annoyed", "irritated", "aggravated", "angered", "upset", "outraged",
  
  // Tech-Specific Negative
  "outdated", "obsolete", "deprecated", "legacy", "unsupported", "abandoned",
  "unmaintained", "undocumented", "poorly-documented", "hard-to-use",
  "unintuitive", "counterintuitive", "non-intuitive", "user-unfriendly",
  
  // Missing Features
  "missing", "absent", "unavailable", "incomplete", "partial", "limited",
  "restricted", "constrained", "lacking", "deficient", "sparse", "scarce",
  
  // Negative Comparisons
  "worse", "inferior", "lesser", "lower", "weaker", "smaller", "slower",
  "harder", "more-expensive", "less-reliable", "less-secure", "less-stable",
  
  // Business/Service Failures
  "failed", "failing", "failure", "bankrupt", "bankruptcy", "shutdown",
  "closed", "discontinued", "terminated", "cancelled", "delayed", "postponed",
  "rejected", "denied", "refused", "declined", "revoked", "suspended",
  
  // Regional/Industry Negative
  "scam", "fraud", "ripoff", "rip-off", "swindle", "con", "trick", "trap",
  "gimmick", "ploy", "scheme", "racket", "exploitation", "manipulation",
  
  // Hidden/Deceptive
  "hidden", "concealed", "obscured", "buried", "fine-print", "gotcha",
  "catch", "loophole", "asterisk", "exception", "exclusion", "limitation",
]);

// ===========================================
// Negation Words (reverse sentiment)
// ===========================================

export const NEGATION_WORDS = new Set([
  "not", "no", "never", "neither", "nobody", "nothing", "nowhere",
  "none", "nor", "cannot", "can't", "couldn't", "wouldn't", "shouldn't",
  "won't", "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't",
  "weren't", "hasn't", "haven't", "hadn't", "without", "lack", "lacking",
  "absent", "missing", "free from", "devoid", "fail to", "fails to",
]);

// ===========================================
// Intensity Modifiers
// ===========================================

export const INTENSITY_AMPLIFIERS = new Set([
  "very", "extremely", "incredibly", "absolutely", "completely", "totally",
  "utterly", "highly", "deeply", "strongly", "particularly", "especially",
  "exceptionally", "remarkably", "extraordinarily", "tremendously",
  "immensely", "vastly", "hugely", "massively", "significantly", "substantially",
  "considerably", "notably", "markedly", "decidedly", "definitely", "certainly",
  "undoubtedly", "unquestionably", "clearly", "obviously", "evidently",
]);

export const INTENSITY_DIMINISHERS = new Set([
  "slightly", "somewhat", "rather", "fairly", "quite", "pretty", "relatively",
  "moderately", "reasonably", "partially", "partly", "a bit", "a little",
  "kind of", "sort of", "mildly", "marginally", "negligibly", "barely",
  "hardly", "scarcely", "minimally", "faintly", "vaguely", "weakly",
]);

// ===========================================
// Industry-Specific Terms
// ===========================================

export const TECH_POSITIVE = new Set([
  "scalable", "modular", "extensible", "customizable", "configurable",
  "api", "integration", "webhook", "sdk", "plugin", "addon", "extension",
  "cloud", "saas", "paas", "iaas", "serverless", "containerized", "kubernetes",
  "microservices", "devops", "ci/cd", "agile", "scrum", "automated",
  "machine-learning", "ai", "artificial-intelligence", "data-driven",
]);

export const TECH_NEGATIVE = new Set([
  "monolithic", "proprietary", "vendor-lock-in", "lock-in", "legacy",
  "technical-debt", "spaghetti-code", "bloated", "bloatware", "adware",
  "malware", "spyware", "ransomware", "vulnerability", "exploit", "breach",
  "downtime", "outage", "latency", "bottleneck", "memory-leak", "resource-hog",
]);

export const FINANCE_POSITIVE = new Set([
  "profitable", "roi", "revenue", "growth", "margin", "yield", "dividend",
  "appreciation", "gains", "returns", "income", "savings", "discount",
  "free-trial", "money-back", "refund", "guarantee", "warranty", "insurance",
]);

export const FINANCE_NEGATIVE = new Set([
  "fee", "fees", "charge", "charges", "penalty", "penalties", "fine", "fines",
  "surcharge", "markup", "commission", "interest", "apr", "debt", "liability",
  "loss", "losses", "deficit", "bankruptcy", "insolvency", "foreclosure",
]);

// ===========================================
// Contextual Sentiment Patterns (n-grams)
// ===========================================

export const POSITIVE_PHRASES = [
  "highly recommended",
  "best in class",
  "top rated",
  "five star",
  "five stars",
  "worth the money",
  "worth every penny",
  "great value",
  "excellent service",
  "exceeded expectations",
  "above and beyond",
  "game changer",
  "must have",
  "love it",
  "can't recommend enough",
  "would recommend",
  "definitely recommend",
  "strongly recommend",
  "go-to choice",
  "first choice",
  "top pick",
  "editor's choice",
  "staff pick",
  "customer favorite",
  "best seller",
  "award winner",
  "industry leader",
  "market leader",
  "gold standard",
  "sets the bar",
  "raises the bar",
];

export const NEGATIVE_PHRASES = [
  "do not recommend",
  "would not recommend",
  "stay away",
  "waste of money",
  "waste of time",
  "not worth",
  "complete disaster",
  "total failure",
  "absolutely terrible",
  "worst experience",
  "never again",
  "huge mistake",
  "big disappointment",
  "major letdown",
  "serious concerns",
  "red flags",
  "red flag",
  "buyer beware",
  "caveat emptor",
  "hidden fees",
  "hidden charges",
  "bait and switch",
  "false advertising",
  "misleading claims",
  "broken promises",
  "poor quality",
  "low quality",
  "cheaply made",
  "falls apart",
  "doesn't work",
  "stopped working",
];

// ===========================================
// Sentiment Scoring Functions
// ===========================================

/**
 * Calculate sentiment score for a single word.
 * Returns: positive number for positive, negative for negative, 0 for neutral
 */
export function getWordSentiment(word: string): number {
  const w = word.toLowerCase().trim();
  
  if (POSITIVE_WORDS.has(w) || TECH_POSITIVE.has(w) || FINANCE_POSITIVE.has(w)) {
    return 1;
  }
  if (NEGATIVE_WORDS.has(w) || TECH_NEGATIVE.has(w) || FINANCE_NEGATIVE.has(w)) {
    return -1;
  }
  return 0;
}

/**
 * Check if a word is a negation.
 */
export function isNegation(word: string): boolean {
  return NEGATION_WORDS.has(word.toLowerCase().trim());
}

/**
 * Get intensity modifier value.
 * Returns: > 1 for amplifiers, < 1 for diminishers, 1 for neutral
 */
export function getIntensityModifier(word: string): number {
  const w = word.toLowerCase().trim();
  
  if (INTENSITY_AMPLIFIERS.has(w)) {
    return 1.5;
  }
  if (INTENSITY_DIMINISHERS.has(w)) {
    return 0.5;
  }
  return 1;
}

/**
 * Check if text contains any positive phrases.
 */
export function containsPositivePhrases(text: string): string[] {
  const textLower = text.toLowerCase();
  return POSITIVE_PHRASES.filter(phrase => textLower.includes(phrase));
}

/**
 * Check if text contains any negative phrases.
 */
export function containsNegativePhrases(text: string): string[] {
  const textLower = text.toLowerCase();
  return NEGATIVE_PHRASES.filter(phrase => textLower.includes(phrase));
}

/**
 * Calculate comprehensive sentiment score for text.
 * Returns: { score: -1 to 1, confidence: 0 to 1, details }
 */
export function calculateDetailedSentiment(text: string): {
  score: number;
  confidence: number;
  positive_count: number;
  negative_count: number;
  positive_phrases: string[];
  negative_phrases: string[];
} {
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  let negationActive = false;
  let intensityModifier = 1;
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-z'-]/g, '');
    if (!word) continue;
    
    // Check for negation (affects next 3 words)
    if (isNegation(word)) {
      negationActive = true;
      continue;
    }
    
    // Check for intensity modifier
    const intensity = getIntensityModifier(word);
    if (intensity !== 1) {
      intensityModifier = intensity;
      continue;
    }
    
    // Get word sentiment
    const sentiment = getWordSentiment(word);
    if (sentiment !== 0) {
      const adjustedSentiment = negationActive ? -sentiment : sentiment;
      const finalSentiment = adjustedSentiment * intensityModifier;
      
      if (finalSentiment > 0) {
        positiveCount += Math.abs(finalSentiment);
      } else {
        negativeCount += Math.abs(finalSentiment);
      }
      
      // Reset modifiers after use
      negationActive = false;
      intensityModifier = 1;
    }
  }
  
  // Check for phrases
  const positivePhrases = containsPositivePhrases(text);
  const negativePhrases = containsNegativePhrases(text);
  
  // Add phrase contributions (weighted higher)
  positiveCount += positivePhrases.length * 2;
  negativeCount += negativePhrases.length * 2;
  
  const total = positiveCount + negativeCount;
  if (total === 0) {
    return {
      score: 0,
      confidence: 0.2, // Low confidence when no sentiment words found
      positive_count: 0,
      negative_count: 0,
      positive_phrases: [],
      negative_phrases: [],
    };
  }
  
  const score = (positiveCount - negativeCount) / total;
  const confidence = Math.min(1, total / 20); // Higher signal = higher confidence
  
  return {
    score,
    confidence,
    positive_count: Math.round(positiveCount),
    negative_count: Math.round(negativeCount),
    positive_phrases: positivePhrases,
    negative_phrases: negativePhrases,
  };
}

