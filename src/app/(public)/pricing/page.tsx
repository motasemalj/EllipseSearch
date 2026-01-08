import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, ShieldAlert, Crown, X } from "lucide-react";
import { TIER_LIMITS } from "@/types";

const plans = [
  {
    id: "starter",
    name: "Starter",
    description: "For small agencies getting started with AI visibility",
    price: 99,
    currency: "USD",
    period: "month",
    popular: false,
    hasWatchdog: false,
    features: [
      `${TIER_LIMITS.starter.monthly_credits.toLocaleString()} credits/month`,
      `Up to ${TIER_LIMITS.starter.max_brands} brands`,
      `${TIER_LIMITS.starter.max_prompts_per_brand} prompts per brand`,
      "All 4 AI engines",
      "English + Arabic support",
      "Selection signal analysis",
      "Website crawler",
      "Email support",
    ],
    cta: "Start with Starter",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For growing agencies with multiple clients",
    price: 299,
    currency: "USD",
    period: "month",
    popular: true,
    hasWatchdog: true,
    features: [
      `${TIER_LIMITS.pro.monthly_credits.toLocaleString()} credits/month`,
      `Up to ${TIER_LIMITS.pro.max_brands} brands`,
      `${TIER_LIMITS.pro.max_prompts_per_brand} prompts per brand`,
      "All 4 AI engines",
      "English + Arabic support",
      "Selection signal analysis",
      "Website crawler",
      "Gap analysis reports",
      "Priority support",
      "API access",
    ],
    cta: "Start with Pro",
  },
  {
    id: "agency",
    name: "Agency",
    description: "For established agencies with enterprise needs",
    price: 799,
    currency: "USD",
    period: "month",
    popular: false,
    hasWatchdog: true,
    features: [
      `${TIER_LIMITS.agency.monthly_credits.toLocaleString()} credits/month`,
      `Up to ${TIER_LIMITS.agency.max_brands} brands`,
      `${TIER_LIMITS.agency.max_prompts_per_brand} prompts per brand`,
      "All 4 AI engines",
      "English + Arabic support",
      "Selection signal analysis",
      "Website crawler",
      "White-label reports",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantee",
    ],
    cta: "Start with Agency",
  },
];

const faqs = [
  {
    question: "What is a credit?",
    answer:
      "Each credit represents one simulation—querying one AI engine with one prompt. For example, running 10 prompts across all 4 engines uses 40 credits.",
  },
  {
    question: "What is Hallucination Watchdog?",
    answer:
      "Hallucination Watchdog is our Pro feature that detects when AI engines lie about your brand. We crawl your website to build a \"Ground Truth\" database, then compare AI responses against it to catch pricing errors, feature mismatches, and availability issues before your customers do.",
  },
  {
    question: "Can I upgrade or downgrade my plan?",
    answer:
      "Yes! You can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the start of your next billing cycle.",
  },
  {
    question: "Do unused credits roll over?",
    answer:
      "Credits reset at the start of each billing cycle and don't roll over. We recommend choosing a plan that fits your typical monthly usage.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes! All new accounts start with a free trial that includes 200 credits to test the platform with your clients.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards through Stripe, including Visa, Mastercard, and American Express.",
  },
  {
    question: "Can I get a custom enterprise plan?",
    answer:
      "Absolutely. Contact us for custom pricing if you need higher limits or specific features for your organization.",
  },
];

export default function PricingPage() {
  return (
    <div className="py-20">
      {/* Header */}
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4">Pricing</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Choose the plan that fits your agency. All plans include access to all
            4 AI engines and full Arabic support.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="max-w-6xl mx-auto mb-20">
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`relative ${
                  plan.popular
                    ? "border-primary shadow-lg shadow-primary/10"
                    : "border-border/50"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </CardHeader>
                
                <CardContent>
                  <div className="text-center mb-6">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold">${plan.price}</span>
                      <span className="text-muted-foreground">/{plan.period}</span>
                    </div>
                  </div>

                  {/* Hallucination Watchdog Feature - Highlighted */}
                  <div className={`mb-6 p-4 rounded-xl border-2 ${
                    plan.hasWatchdog 
                      ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-500/5" 
                      : "border-dashed border-muted-foreground/20 bg-muted/30"
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${plan.hasWatchdog ? "bg-amber-500/20" : "bg-muted"}`}>
                        <ShieldAlert className={`h-5 w-5 ${plan.hasWatchdog ? "text-amber-500" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${plan.hasWatchdog ? "" : "text-muted-foreground"}`}>
                            Hallucination Watchdog
                          </span>
                          {plan.hasWatchdog && (
                            <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs py-0">
                              <Crown className="w-3 h-3 mr-1" />
                              PRO
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {plan.hasWatchdog 
                            ? "Detect when AI lies about your brand" 
                            : "Upgrade to access this feature"
                          }
                        </p>
                      </div>
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center ${
                        plan.hasWatchdog ? "bg-amber-500/20" : "bg-muted"
                      }`}>
                        {plan.hasWatchdog ? (
                          <Check className="h-4 w-4 text-amber-500" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full ${plan.popular ? "shine" : ""}`}
                    variant={plan.popular ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/signup">{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
          </div>

          <div className="grid gap-6">
            {faqs.map((faq) => (
              <Card key={faq.question} className="bg-card/50 border-border/50">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-2">{faq.question}</h3>
                  <p className="text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-20">
          <p className="text-muted-foreground mb-4">
            Need a custom plan for your enterprise?
          </p>
          <Button variant="outline" size="lg">
            Contact Sales
          </Button>
        </div>
      </div>
    </div>
  );
}

