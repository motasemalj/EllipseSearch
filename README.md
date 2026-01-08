# EllipseSearch - AI Selection Intelligence Dashboard

> **Track how AI search engines select and cite your clients' brands**

EllipseSearch is a SaaS platform built for digital agencies in Dubai and the GCC region. It helps agencies optimize their clients' visibility across AI-powered search engines like ChatGPT, Perplexity, Gemini, and Grok.

![EllipseSearch Dashboard](./docs/screenshot.png)

## 🎯 What is AI Selection Intelligence?

Traditional SEO tracks rankings on Google. But when users ask ChatGPT or Perplexity a question, there's no ranking - the AI **selects** specific sources to cite. 

EllipseSearch helps you understand:
- **Is your client visible?** Does the AI mention them?
- **Why did AI select competitors?** What "selection signals" did winning sources have?
- **What should you fix?** Get specific recommendations to improve AI visibility.

## ✨ Features

### Multi-Engine Support
- **ChatGPT** (via OpenAI GPT-5.2)
- **Perplexity** (native Sonar Pro API)
- **Gemini** (Google AI)
- **Grok** (xAI)

### Selection Signal Analysis
- Structure scoring (headers, lists, tables)
- Data density analysis (statistics, unique data)
- Directness evaluation (answers the question immediately)
- Gap analysis vs winning sources
- Actionable recommendations

### Website Crawling (Firecrawl Integration)
- **Async job queue** with Trigger.dev for reliable processing
- **Concurrency control** (max 50 concurrent crawls)
- **Ground Truth extraction** from brand websites
- **Enhanced accuracy detection** using crawled content
- **Hallucination detection** comparing AI responses to actual website content

### Agency-Ready
- Multi-tenant architecture
- Brand & keyword management
- Credit-based billing via Stripe
- RTL/Arabic language support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- API keys for: OpenAI, Google AI, xAI, Perplexity, Tavily, Firecrawl
- Stripe account (for billing)
- Trigger.dev account (for background jobs)

### Installation

1. **Clone and install dependencies**

```bash
git clone <repository-url>
cd EllipseSearch
npm install
```

2. **Set up environment variables**

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Engines
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
XAI_API_KEY=...
PERPLEXITY_API_KEY=...
TAVILY_API_KEY=tvly-...

# Firecrawl (Website Crawling)
FIRECRAWL_API_KEY=fc-...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_AGENCY=price_...

# Trigger.dev
TRIGGER_API_KEY=...
TRIGGER_PROJECT_ID=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. **Set up the database**

Run the SQL files in your Supabase SQL editor:

```sql
-- Run in order:
-- 1. supabase/schema.sql
-- 2. supabase/functions.sql
```

4. **Start the development server**

```bash
npm run dev
```

5. **Start Trigger.dev (in a separate terminal)**

```bash
npm run trigger:dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login, signup pages
│   ├── (dashboard)/      # Protected dashboard routes
│   │   ├── dashboard/    # Main dashboard
│   │   ├── brands/       # Brand management
│   │   ├── billing/      # Subscription management
│   │   └── settings/     # User settings
│   ├── (public)/         # Marketing pages
│   └── api/              # API routes
├── components/
│   ├── ui/               # Shadcn UI components
│   ├── dashboard/        # Dashboard components
│   ├── brands/           # Brand-related components
│   └── billing/          # Billing components
├── lib/
│   ├── ai/               # AI engine integrations
│   │   ├── factory.ts    # Engine factory
│   │   ├── aeo-scoring.ts  # AEO scoring with ground truth
│   │   └── selection-signals.ts
│   ├── firecrawl/        # Website crawling
│   │   └── client.ts     # Firecrawl API client
│   ├── supabase/         # Supabase clients
│   └── utils.ts          # Utilities
├── trigger/
│   └── jobs/             # Trigger.dev background jobs
└── types/
    └── index.ts          # TypeScript types
```

## 🔧 Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn/UI
- **Database**: Supabase (PostgreSQL with RLS)
- **Authentication**: Supabase Auth
- **Background Jobs**: Trigger.dev v3 (with concurrency control)
- **AI**: OpenAI, Google Generative AI, xAI, Perplexity, Tavily
- **Web Crawling**: Firecrawl (async job queue for ground truth extraction)
- **Billing**: Stripe
- **Deployment**: Vercel (recommended)

## 🔐 Security

- Row Level Security (RLS) enabled on all database tables
- API routes protected with authentication checks
- Stripe webhooks verified with signatures
- Environment variables for all secrets

## 📊 Database Schema

### Core Entities

- **organizations**: Agency/company accounts
- **profiles**: User accounts linked to auth.users
- **brands**: Client brands being tracked
- **prompt_sets**: Groups of prompts for analysis
- **prompts**: Individual search queries
- **analysis_batches**: Analysis run sessions
- **simulations**: Individual simulation results
- **crawl_jobs**: Website crawl job tracking
- **crawled_pages**: Stored crawled content for ground truth

See `supabase/schema.sql` for the complete schema.

### Running Migrations

```bash
# Apply the crawl jobs migration
psql -f supabase/migrations/003_add_crawl_jobs.sql
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For support, email support@ellipsesearch.com or join our Discord community.

---

Built with ❤️ for agencies in 🇦🇪 Dubai & GCC
