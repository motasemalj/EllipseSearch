# SPECIFICATION.md  
## Project Specification: AEO Dashboard SaaS (Multi-Engine, Selection Intelligence, Arabic Support)

**Role:** Act as a **Principal Software Architect and Senior Full-Stack TypeScript Engineer**.  
**Context:** You are starting from **scratch** (no existing files).  
**Goal:** Build a **production-ready Answer Engine Optimization (AEO) SaaS Dashboard** for **Digital Agencies in Dubai/GCC**.

---

## 0. Core Product & Value Proposition

This is not a classic SEO rank tracker.

> **We do not just track rankings. We track “AI Selection.”**  
> We help brands ensure they are the **chosen and cited source** when users ask questions on **ChatGPT, Perplexity, Gemini, and Grok**.

Agencies use this tool to:

1. Define **brands** and **keyword sets** for their clients.
2. Run **simulations** across multiple answer engines (ChatGPT, Perplexity, Gemini, Grok).
3. See where their client is:
   - Visible or invisible
   - How and why AI selected certain sources over theirs (**Selection Signals**).
4. Get a **Gap Analysis + concrete recommendations** on how to adjust their content so AI engines are more likely to select and cite them.
5. Sell this as an **“AI Visibility / AEO”** add-on to their existing SEO retainers.

The product is:

- Multi-tenant (agencies → brands → users).
- Multi-engine (ChatGPT, Perplexity, Gemini, Grok).
- Multi-language (English + Arabic).
- Async-driven (Trigger.dev jobs).
- Paid via **Stripe subscriptions** and **credits**.

---

## 1. Tech Stack (Scalable & Secure)

Use this exact stack and patterns:

- **Frontend**
  - Next.js 14 (App Router, TypeScript).
  - Tailwind CSS.
  - Shadcn/UI (must support **RTL** via `dir="rtl"` for Arabic views).

- **Backend / Data**
  - Supabase:
    - PostgreSQL database.
    - Supabase Auth (email/password or magic link; pick one and implement fully).
    - **Row Level Security (RLS) enabled on ALL tables.**

- **Async & Jobs**
  - Trigger.dev v3 (`@trigger.dev/sdk/v3`).
  - All long-running AI work must run through Trigger.dev jobs.  
    **No AI calls directly inside HTTP route handlers**.

- **Engine Layer (“Brain”)**
  - **Search Layer:** Tavily API (for multi-engine RAG simulations).
  - **LLMs for Answer Engines:**
    - OpenAI: `gpt-5.2` (simulates **ChatGPT**).
    - Google: `gemini-1.5-pro` (simulates **Gemini**).
    - xAI: `grok-beta` (simulates **Grok**).
  - **Native Engine:**
    - Perplexity API: `sonar-pro` (native: it does its own search + answer).

- **Billing**
  - Stripe:
    - Subscription products / prices (Starter, Pro, Agency).
    - Webhooks to sync subscription status and monthly credits.

- **Deployment**
  - Target: **Vercel** (Next.js app).
  - Supabase (managed DB/Auth).
  - Trigger.dev Cloud.
  - Stripe for billing.

---

## 2. Core Domain Model

Design everything around **Agencies**, **Users**, **Brands**, **Keywords**, **Batches**, and **Simulations**.

### 2.1 Entities

1. **Organization (Agency)**  
   - Paying customer.  
   - Owns users, brands, and all data.  
   - Has credits and a billing tier.

2. **Profile (User)**  
   - Authenticated via Supabase Auth (`auth.users`).  
   - Belongs to exactly one `organization` (for v1).  
   - Roles: `owner`, `admin`, `member`.

3. **Brand (Client)**  
   - A client being optimized, e.g., “Emaar Properties”.  
   - Belongs to an organization.  
   - Has:
     - Name.
     - Primary domain.
     - Primary location (e.g., “Dubai Marina”).
     - `languages` (e.g. `['en']` or `['en','ar']`).
     - `brand_aliases` (alternate spellings/names).

4. **Keyword Set**  
   - Logical group of queries for a brand, e.g., “Luxury Real Estate Dubai”.
   - Contains multiple **Keywords**.

5. **Keyword**  
   - A single query phrase, e.g. `"luxury apartments dubai marina"`.
   - Belongs to a `keyword_set` and a `brand`.

6. **Analysis Batch**  
   - A single run of a keyword set against one or more engines.  
   - Example: “Run 40 keywords for Brand X across ChatGPT + Gemini on 2025-12-15”.

7. **Simulation**  
   - The atomic unit of analysis.  
   - One engine + one keyword + one language in one batch.  
   - Example: “What did Gemini (in Arabic) say about ‘أفضل فنادق دبي مارينا’ on Dec 15?”

### 2.2 Language Support (English + Arabic)

- Each brand has `languages text[]` specifying supported languages (e.g. `['en','ar']`).
- Simulations must explicitly store the `language` used (`'en'` or `'ar'` at minimum).
- If `brand.languages` includes `'ar'`:
  - Allow **Arabic keywords**.
  - OR auto-generate Arabic variants (future).
  - UI must support displaying prompt and answer with `dir="rtl"` and correct text alignment.

---

## 3. “Selection” Logic & Engine Factory

This is the **core differentiator**: we simulate the engine’s behavior, then analyze **why** it selected certain sources over the brand.

### 3.1 Engine Factory (lib/ai/factory.ts)

Create a module `lib/ai/factory.ts` that exposes:

```ts
type SupportedEngine = 'chatgpt' | 'gemini' | 'grok' | 'perplexity';

interface RunSimulationInput {
  engine: SupportedEngine;
  keyword: string;
  language: 'en' | 'ar';
  brand_domain: string;
}

interface SimulationRawResult {
  answer_html: string; // full formatted answer
  sources: { url: string; title?: string }[];
  search_context?: any; // Tavily results (for RAG engines)
}

export async function runSimulation(
  input: RunSimulationInput
): Promise<SimulationRawResult>;

Behavior:
	•	Case: engine === 'perplexity'
	•	Call Perplexity sonar-pro directly.
	•	It performs search + answer internally.
	•	Extract:
	•	Full HTML/text answer.
	•	Citation URLs (sources).
	•	search_context may be null or minimal.
	•	Case: engine === 'chatgpt' | 'gemini' | 'grok'
(RAG Simulation using Tavily)
	•	Step A – Search (Tavily):
	•	Call Tavily with the keyword (English or Arabic as provided).
	•	Get top ~10 results: title, URL, snippet, body summary.
	•	This is the Context.
	•	Step B – Reasoning (LLM):
	•	Call the appropriate LLM:
	•	gpt-5.2 for ChatGPT.
	•	gemini-1.5-pro for Gemini.
	•	grok-beta for Grok.
	•	System prompt (template):
“You are [Engine Name]. You have just searched the web.
Use ONLY the following Context to answer the user’s question.
Do not use outside knowledge.
Context: [Tavily Results]”
	•	User prompt: the keyword in its original language.
	•	Extract:
	•	Generated answer (HTML or markdown → convert if needed).
	•	URLs used (infer from the context references).
	•	Set search_context to the full Tavily JSON.

⸻

3.2 Selection Signal Analysis (Phase 2)

After obtaining the raw simulation result, run an analysis step using gpt-5.2 to understand why the engine selected certain sources.

Call gpt-5.2 with something like:
	•	Inputs:
	•	The AI answer (answer_html).
	•	The search_context (especially the winning URLs).
	•	The brand_domain and any URLs that match the brand.
	•	Engine name and keyword.
	•	System Prompt (high-level):
“Analyze the AI’s response compared to the Brand’s content.
	•	Was the brand cited? (Yes/No)
	•	Selection Signals: Analyze the ‘Winning’ sources (the URLs that were cited). Why did the AI select them?
	•	Structure: Did they use lists, tables, or clear headers?
	•	Data Density: Did they provide unique statistics or hard numbers?
	•	Directness: Did they answer the question in the first ~50 words?
	•	Gap Analysis: Compare the Brand’s content (if available in search results) to the Winning source(s). What is the specific gap?
	•	Recommendation: Provide one specific technical fix (e.g., ‘Add a Markdown comparison table to your pricing page’).
Return ONLY valid JSON.”
	•	Expected JSON Output:

{
  "is_visible": false,
  "sentiment": "neutral",
  "winning_sources": ["https://competitor.com/pricing"],
  "gap_analysis": {
    "structure_score": 4,
    "data_density_score": 2,
    "directness_score": 5
  },
  "recommendation": "Competitor won because they used a comparison table. Your page is text-heavy. Add a table comparing features."
}

	•	Store this JSON in simulations.selection_signals.

⸻

4. Async Architecture (Trigger.dev Jobs)

All engine simulations + selection analysis run asynchronously.

4.1 Job: run-keyword-set-analysis

Purpose: Orchestrate a multi-keyword, multi-engine run.

Inputs:
	•	brand_id
	•	keyword_set_id
	•	engines: SupportedEngine[]
	•	language: 'en' | 'ar' (for that run; could allow per-keyword in future)

Responsibilities:
	1.	Load:
	•	Brand (with organization_id, brand_domain, languages).
	•	Keyword set and its keywords.
	•	Organization’s credits_balance and billing_tier.
	2.	Validate:
	•	Brand belongs to the current user’s organization (for auth context).
	•	Organization has enough credits or at least some; fail fast if 0.
	•	Language is allowed by the brand’s languages.
	3.	Create an analysis_batches row:
	•	total_simulations = keywords.length * engines.length.
	•	status = 'queued'.
	4.	Update batch to processing, set started_at.
	5.	For each (keyword, engine) combination:
	•	Enqueue check-prompt-visibility job with data:
	•	brand_id, keyword_id, analysis_batch_id, engine, language.
	6.	Concurrency:
	•	Enforce max N concurrent simulation jobs per organization (e.g., 5–10).
	•	Optional: per-brand concurrency cap as well.
	7.	Listen for job completion:
	•	Increment completed_simulations in analysis_batches.
	•	When completed_simulations === total_simulations:
	•	Set status = 'completed', completed_at = now().

4.2 Job: check-prompt-visibility

Inputs:
	•	brand_id
	•	keyword_id
	•	analysis_batch_id
	•	engine
	•	language

Flow:
	1.	Fetch:
	•	Brand (including brand_domain, brand_aliases).
	•	Keyword text.
	•	Organization (for credits).
	2.	Credits Check:
	•	If organization.credits_balance <= 0:
	•	Mark simulation as failed or skipped.
	•	Optionally mark batch as failed if this is critical.
	•	Otherwise proceed.
	3.	Run Simulation:
	•	Use runSimulation({ engine, keyword: keyword.text, language, brand_domain }).
	•	Get:
	•	answer_html
	•	sources
	•	search_context (for RAG engines)
	4.	Selection Signal Analysis:
	•	Call gpt-5.2 with the Selection Signal prompt described above.
	•	Parse the JSON safely (handle retries / fallback).
	5.	Persist to simulations:
	•	Create a row with:
	•	brand_id
	•	keyword_id
	•	analysis_batch_id
	•	engine
	•	language
	•	prompt_text (keyword)
	•	ai_response_html
	•	search_context
	•	is_visible (from analysis JSON)
	•	selection_signals JSON (full analysis output)
	•	created_at
	6.	Update Credits:
	•	Deduct 1 credit from organizations.credits_balance atomically.
	7.	Update Batch Progress:
	•	Increment analysis_batches.completed_simulations.
	8.	Error Handling:
	•	On errors, mark simulation as errored (optional status column) and increment completed_simulations to ensure the batch can finish.

⸻

5. Database Schema (Supabase)

Implement as SQL in a schema.sql (or migrations). Use uuid primary keys and timestamptz. Enable RLS on all tables.

5.1 Organizations & Profiles
	•	organizations
	•	id uuid PK
	•	name text
	•	tier text CHECK in (starter, pro, agency, free, trial) default free
	•	credits_balance int default 0
	•	stripe_customer_id text NULL
	•	stripe_subscription_id text NULL
	•	stripe_subscription_status text NULL
	•	settings jsonb default ‘{}’::jsonb  – white-label settings (logo, color, etc.)
	•	created_at timestamptz default now()
	•	updated_at timestamptz default now()
	•	profiles
	•	id uuid PK  – matches supabase.auth.users.id
	•	organization_id uuid REFERENCES organizations(id)
	•	role text CHECK in (owner, admin, member) default ‘member’
	•	created_at timestamptz default now()
	•	updated_at timestamptz default now()

5.2 Brands & Keywords
	•	brands
	•	id uuid PK
	•	organization_id uuid REFERENCES organizations(id)
	•	name text
	•	domain text
	•	primary_location text
	•	languages text[] default ‘{en}’
	•	brand_aliases text[] default ‘{}’::text[]
	•	settings jsonb default ‘{}’::jsonb
	•	created_at timestamptz default now()
	•	updated_at timestamptz default now()
	•	keyword_sets
	•	id uuid PK
	•	brand_id uuid REFERENCES brands(id)
	•	name text
	•	description text
	•	created_by uuid REFERENCES profiles(id)
	•	created_at timestamptz default now()
	•	updated_at timestamptz default now()
	•	keywords
	•	id uuid PK
	•	keyword_set_id uuid REFERENCES keyword_sets(id)
	•	brand_id uuid REFERENCES brands(id)
	•	text text
	•	last_checked_at timestamptz NULL
	•	created_at timestamptz default now()
	•	updated_at timestamptz default now()

5.3 Batches & Simulations
	•	analysis_batches
	•	id uuid PK
	•	brand_id uuid REFERENCES brands(id)
	•	keyword_set_id uuid REFERENCES keyword_sets(id)
	•	status text CHECK in (‘queued’,‘processing’,‘completed’,‘failed’) default ‘queued’
	•	engine text NULL  – optional; can be null if multi-engine
	•	total_simulations int default 0
	•	completed_simulations int default 0
	•	started_at timestamptz NULL
	•	completed_at timestamptz NULL
	•	error_message text NULL
	•	created_at timestamptz default now()
	•	updated_at timestamptz default now()
	•	simulations
	•	id uuid PK
	•	brand_id uuid REFERENCES brands(id)
	•	keyword_id uuid REFERENCES keywords(id)
	•	analysis_batch_id uuid REFERENCES analysis_batches(id)
	•	engine text  – ‘chatgpt’ | ‘gemini’ | ‘grok’ | ‘perplexity’
	•	language text  – ‘en’ | ‘ar’
	•	prompt_text text
	•	ai_response_html text
	•	search_context jsonb
	•	is_visible boolean
	•	sentiment text NULL  – optional if you want to store high-level sentiment separately
	•	selection_signals jsonb  – the gap analysis JSON from Phase 2
	•	created_at timestamptz default now()

Note: if you want monthly summary tables later, you can add brand_metrics_monthly in a future iteration.

⸻

6. Row Level Security (RLS) – Conceptual Rules

Enable RLS on all tables and define policies conceptually as:
	•	profiles
	•	A user can select/update only the row where profiles.id = auth.uid().
	•	organizations
	•	A user can see/update an organization only when:
	•	organizations.id = profiles.organization_id for profiles.id = auth.uid().
	•	brands, keyword_sets, keywords, analysis_batches, simulations
	•	A row is visible only if:
	•	It belongs to a brand whose brands.organization_id = profiles.organization_id for the current auth.uid().

You do not need to write all the SQL policies here, but the implementation must follow this model.

⸻

7. Billing: Stripe Subscriptions & Credits

7.1 Tiers & Limits

Define 3 tiers:
	•	Starter
	•	Lower monthly price.
	•	monthly_credits (e.g. 2,000).
	•	max_brands, max_keywords_per_brand (lower limits).
	•	Pro
	•	More credits (e.g. 10,000).
	•	Higher brand/keyword limits.
	•	Agency
	•	Highest credits (e.g. 50,000+).
	•	Highest brand/keyword limits.

Each tier maps to:
	•	STRIPE_PRICE_STARTER
	•	STRIPE_PRICE_PRO
	•	STRIPE_PRICE_AGENCY

7.2 Stripe Integration

Implement:

API: Create Checkout Session
	•	POST /api/billing/create-checkout-session
	•	Input: { tier: 'starter' | 'pro' | 'agency' }
	•	Behavior:
	•	Ensure user is authenticated and has profiles.organization_id.
	•	Ensure or create a Stripe Customer (store stripe_customer_id).
	•	Create a Subscription Checkout Session using the tier’s Price ID.
	•	success_url and cancel_url use NEXT_PUBLIC_APP_URL.
	•	Include organization_id and chosen tier in Stripe metadata.
	•	Return the session.url to the frontend.

API: Create Customer Portal Session
	•	POST /api/billing/create-portal-session
	•	Behavior:
	•	Ensure user & organization exist.
	•	Create Stripe Billing Portal Session for stripe_customer_id.
	•	Return url to frontend.

Webhook: /api/stripe/webhook
	•	Verify signature via STRIPE_WEBHOOK_SECRET.
	•	Handle events:
	•	checkout.session.completed
	•	customer.subscription.created
	•	customer.subscription.updated
	•	customer.subscription.deleted
	•	On subscription active/updated:
	•	Update organizations.tier and stripe_subscription_status.
	•	Set organizations.credits_balance = monthly_credits[tier].
	•	On cancellation:
	•	Update stripe_subscription_status to canceled and adjust tier (e.g., down to free at period end).

7.3 Credits Enforcement
	•	Before enqueuing a big batch, ensure credits_balance > 0.
	•	Each check-prompt-visibility job consumes 1 credit.
	•	Deduct credits atomically in the database.

⸻

8. UI & UX

8.1 Public Marketing Site & Auth

Routes:
	•	/ – Public landing page.
	•	/pricing – Public pricing page.
	•	/login – Login page.
	•	/signup – Signup page.

Landing page (/):
	•	Hero section:
	•	Headline explaining value:
	•	e.g. “See how AI search engines talk about your clients – and what to fix to win more leads.”
	•	Subheadline: focused on agencies in Dubai/GCC.
	•	CTA buttons:
	•	“Get started” → /signup
	•	“Log in” → /login
	•	Sections:
	•	“How it works” (3 steps).
	•	“For Agencies” (benefits).
	•	“For Dubai/GCC” (English + Arabic support, AI-driven research).
	•	Pricing teaser (link to /pricing).

Pricing page (/pricing):
	•	Show Starter / Pro / Agency.
	•	For each plan:
	•	Price (placeholder values).
	•	Credits/month.
	•	Brand & keyword limits.
	•	“Get started” button:
	•	If user not logged in → /signup.
	•	If logged in → triggers /api/billing/create-checkout-session.

Auth:
	•	/login & /signup using Supabase Auth.
	•	On signup:
	•	Create a new organization and profile if none exists.
	•	Set profile role = 'owner'.
	•	Redirect to /dashboard (and show a CTA to pick a plan).
	•	On login:
	•	Redirect to /dashboard.

Route Protection:
	•	/dashboard, /brands/**, /billing must require auth.
	•	If unauthenticated:
	•	Redirect to /login.
	•	If authenticated and hitting /login or /signup:
	•	Redirect to /dashboard.

8.2 Authenticated Dashboard

Use Next.js App Router layouts with:
	•	App Shell:
	•	Sidebar:
	•	Organization name/logo.
	•	Links: Dashboard, Brands, Billing, Settings.
	•	Top bar:
	•	User menu.
	•	Organization selector (future multi-org).

Views:
	1.	Dashboard (/dashboard)
	•	List of brands:
	•	Brand name.
	•	High-level visibility summary by engine (e.g., small engine badges with % visibility).
	•	Button “View brand”.
	2.	Brand Overview (/brands/[brandId])
	•	Engine tabs: [ChatGPT] [Perplexity] [Gemini] [Grok].
	•	For the selected engine:
	•	Visibility score (% simulations where is_visible = true).
	•	Trend over time (based on recent analysis_batches).
	•	Top domains (winning sources).
	•	Average selection signal scores:
	•	structure_score, data_density_score, directness_score.
	3.	Keyword Sets (/brands/[brandId]/keyword-sets)
	•	Table:
	•	Name, description, #keywords, last run date, last visibility score.
	•	Actions:
	•	Create / edit keyword set.
	•	“Run Analysis” button:
	•	Choose engines.
	•	Choose language (en/ar).
	•	Start run-keyword-set-analysis.
	4.	Batch Detail (/brands/[brandId]/keyword-sets/[keywordSetId]/batches/[batchId])
	•	Shows batch progress:
	•	completed_simulations / total_simulations.
	•	Status badges (Queued, Processing, Completed, Failed).
	•	Table of simulations:
	•	Keyword text.
	•	Engine.
	•	Language.
	•	Visible? (Yes/No).
	•	High-level gap summary (from selection_signals.recommendation).
	•	Clicking a simulation → detail view.
	5.	Simulation Detail (“Battle Card”)
	•	Split view:
	•	Left: AI Answer (answer_html) + note “Winning sources”.
	•	Right: Brand vs Winner summary:
	•	A short human summary from selection_signals.
	•	Highlight which signals are weak (structure, data density, directness).
	•	Recommendation rendered as text.
	•	For Arabic (language='ar'):
	•	Wrap content in a container with dir="rtl" and text-right.
	6.	Billing (/billing)
	•	Show:
	•	Current plan and status.
	•	credits_balance.
	•	Simple usage summary (simulations run this month).
	•	Buttons:
	•	“Upgrade / Change Plan” → Checkout.
	•	“Manage Subscription” → Stripe Portal.

8.3 Arabic UI Support
	•	When displaying Arabic content (language='ar' or brand main language is Arabic):
	•	Use dir="rtl" on the container.
	•	Apply appropriate Tailwind classes (text-right, flex-row-reverse where needed).
	•	Still keep core UX simple and mostly English for v1 (marketing copy can be English); just ensure the architecture supports Arabic text and layout.

⸻

9. Environment Variables

Create a .env.example file with placeholder values and comments. Do not hardcode secrets.

Supabase:

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=

AI Engines:

OPENAI_API_KEY=          # For ChatGPT (gpt-5.2) + Selection Signal Analysis
GOOGLE_AI_API_KEY=       # For Gemini
XAI_API_KEY=             # For Grok
PERPLEXITY_API_KEY=      # For Perplexity (sonar-pro)

Search Layer:

TAVILY_API_KEY=          # For RAG search context

Async Jobs:

TRIGGER_API_KEY=
TRIGGER_PROJECT_ID=

Stripe:

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

STRIPE_PRICE_STARTER=
STRIPE_PRICE_PRO=
STRIPE_PRICE_AGENCY=

App Secret:

APP_SECRET=              # or NEXTAUTH_SECRET if you use NextAuth, but choose one approach.


⸻

10. Implementation Order (for Cursor)

You are allowed to create new files and edit existing ones. At each step, output full file contents (TS/TSX/SQL) with correct imports.

Step 1 – Project Scaffold & Basic Layout
	1.	Initialize a Next.js 14 TypeScript project.
	2.	Add Tailwind CSS.
	3.	Add Shadcn/UI and set up base theme.
	4.	Create:
	•	SPECIFICATION.md (this file).
	•	.env.example with the keys listed above.
	5.	Implement base layouts:
	•	Public layout for /, /pricing, /login, /signup.
	•	App layout for /dashboard and authenticated routes.

Step 2 – Supabase Integration & Auth
	1.	Create Supabase server/client helpers.
	2.	Configure Supabase Auth.
	3.	On first signup:
	•	Create organizations row.
	•	Create profiles row linking auth.users.id to that organization, role='owner'.
	4.	Implement /login, /signup, and redirect logic.

Step 3 – Database Schema
	1.	Create schema.sql implementing all tables in Section 5.
	2.	Add basic indexes and foreign keys.
	3.	(Optional) Show example RLS policies or stubs for each table.

Step 4 – Core Dashboard & Brand Management
	1.	Implement /dashboard to list brands.
	2.	CRUD for brands and keyword sets.
	3.	Pages for /brands/[brandId] and /brands/[brandId]/keyword-sets.

Step 5 – Engine Factory
	1.	Implement lib/ai/factory.ts with runSimulation() for:
	•	Perplexity.
	•	ChatGPT + Tavily.
	•	Gemini + Tavily.
	•	Grok + Tavily.
	2.	Implement robust error handling and JSON extraction for sources.

Step 6 – Trigger.dev Jobs
	1.	Configure Trigger.dev client.
	2.	Implement:
	•	run-keyword-set-analysis job.
	•	check-prompt-visibility job.
	3.	Integrate with Supabase and the database schema.

Step 7 – Selection Signal Analysis
	1.	Implement a helper that calls gpt-5.2 with the Selection Signal prompt.
	2.	Parse JSON into selection_signals and persist in simulations.

Step 8 – Stripe Billing
	1.	Implement billing API routes:
	•	/api/billing/create-checkout-session
	•	/api/billing/create-portal-session
	2.	Implement /api/stripe/webhook.
	3.	Wire Stripe events to organizations (tier, credits, subscription status).
	4.	Guard analysis actions based on active subscription + credits.

Step 9 – Dashboard Visualizations
	1.	Implement engine tabs, visibility charts, and the “Battle Card” Simulation Detail view.
	2.	Add Arabic layout handling in the relevant components.

Step 10 – Final Polish
	1.	Improve README with setup & deployment instructions.
	2.	Ensure all protected routes enforce auth.
	3.	Confirm .env.example matches actual usage.

