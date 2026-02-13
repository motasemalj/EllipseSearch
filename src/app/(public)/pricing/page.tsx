import Link from "next/link";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown } from "lucide-react";
import { TIER_LIMITS } from "@/types";
import { getCurrencyFromHeaders } from "@/lib/pricing";
import { PriceDisplay } from "@/components/ui/price-display";

const plans = [
  {
    id: "starter",
    name: "Starter",
    description: "For small agencies getting started with AI visibility",
    period: "month",
    popular: false,
    features: [
      `Up to ${TIER_LIMITS.starter.max_brands} brands`,
      `${TIER_LIMITS.starter.max_prompts_per_brand} prompts per brand`,
      "All 4 AI engines",
      "English + Arabic support",
      "Selection signal analysis",
      "Daily automated analysis",
      "Email support",
    ],
    cta: "Start with Starter",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For growing agencies with multiple clients",
    period: "month",
    popular: true,
    features: [
      `Up to ${TIER_LIMITS.pro.max_brands} brands`,
      `${TIER_LIMITS.pro.max_prompts_per_brand} prompts per brand`,
      "All 4 AI engines",
      "English + Arabic support",
      "Selection signal analysis",
      "Hallucination detection",
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
    period: "month",
    popular: false,
    features: [
      `Up to ${TIER_LIMITS.agency.max_brands} brands`,
      `${TIER_LIMITS.agency.max_prompts_per_brand} prompts per brand`,
      "All 4 AI engines",
      "English + Arabic support",
      "Selection signal analysis",
      "White-label reports",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
  },
];

const faqs = [
  {
    question: "Can I upgrade or downgrade my plan?",
    answer:
      "Yes! You can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the start of your next billing cycle.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes! All new accounts start with a 3-day trial limited to 1 brand and 5 prompts.",
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

// All prices by currency for client-side detection
const ALL_PRICES: Record<string, Record<"USD" | "AED" | "SAR", number>> = {
  starter: { USD: 70, AED: 250, SAR: 260 },
  pro: { USD: 300, AED: 1100, SAR: 1200 },
};

export default async function PricingPage() {
  // Server-side currency detection (works when geo headers or cookie available)
  const serverCurrency = getCurrencyFromHeaders(await headers());

  const plansWithPricing = plans.map((plan) => ({
    ...plan,
    isCustom: plan.id === "agency",
  }));

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
            {plansWithPricing.map((plan) => (
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
                      <Crown className="h-3 w-3 mr-1" />
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
                      <PriceDisplay
                        prices={ALL_PRICES[plan.id] || { USD: 0, AED: 0, SAR: 0 }}
                        serverCurrency={serverCurrency}
                        period={plan.isCustom ? undefined : `/${plan.period}`}
                        isCustom={plan.isCustom}
                      />
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
                    <Link href={plan.isCustom ? "/support" : "/signup"}>{plan.cta}</Link>
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

