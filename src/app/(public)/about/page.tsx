import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Lightbulb, ShieldCheck, Globe2 } from "lucide-react";

const pillars = [
  {
    title: "Measure",
    description:
      "Track how AI engines cite your clients across ChatGPT, Perplexity, Gemini, and Grok.",
    icon: Target,
  },
  {
    title: "Diagnose",
    description:
      "Identify the exact signals that make AI select one brand over another.",
    icon: ShieldCheck,
  },
  {
    title: "Improve",
    description:
      "Turn insights into precise content and technical fixes that change AI outcomes.",
    icon: Lightbulb,
  },
];

const values = [
  {
    title: "Clarity over hype",
    description:
      "We focus on measurable outcomes and explainable signals, not buzzwords.",
  },
  {
    title: "Agency-first design",
    description:
      "Everything is built for multi-client workflows, reporting, and scale.",
  },
  {
    title: "Global by default",
    description:
      "English and Arabic support with a deep understanding of GCC markets.",
  },
  {
    title: "Responsible AI",
    description:
      "We emphasize accuracy, provenance, and transparent sources in every analysis.",
  },
];

export default function AboutPage() {
  return (
    <div className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto space-y-16">
          <section className="text-center space-y-6">
            <Badge variant="outline">About EllipseSearch</Badge>
            <h1 className="text-4xl md:text-5xl font-bold">
              We help agencies win AI discovery
            </h1>
            <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
              EllipseSearch is a Dubai-grown AI selection intelligence platform
              that shows how answer engines choose sources, cite brands, and
              shape customer decisions. We turn those signals into clear,
              actionable guidance for agencies and their clients.
            </p>
          </section>

          <section>
            <Card className="bg-card/60 border-border/60">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
                  <div className="shrink-0 self-start lg:self-center">
                    <Image
                      src="https://i.ibb.co/KvvNN93/ceo.png"
                      alt="Motasem Al Jayyousi, CEO of EllipseSearch"
                      width={200}
                      height={250}
                      className="rounded-xl object-cover w-36 sm:w-44 lg:w-48 h-auto"
                      unoptimized
                      priority
                    />
                  </div>
                  <div className="space-y-3">
                    <Badge variant="outline">Message from the CEO</Badge>
                    <h2 className="text-2xl font-semibold">
                      Motasem Al Jayyousi
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      &quot;I started EllipseSearch in Dubai because agencies
                      here were already winning on traditional SEO but getting
                      overlooked in AI answers. We&apos;re building a platform
                      that gives you clarity on why AI picks certain brands and
                      the steps to earn trust in every response. Thank you for
                      being part of this journey.&quot;
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid md:grid-cols-3 gap-6">
            {pillars.map((pillar) => (
              <Card
                key={pillar.title}
                className="bg-card/60 border-border/60"
              >
                <CardContent className="pt-6 space-y-3">
                  <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center">
                    <pillar.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold">{pillar.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {pillar.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card/60 border-border/60">
              <CardContent className="pt-6 space-y-3">
                <Badge variant="outline">Mission</Badge>
                <h2 className="text-xl font-semibold">
                  Make AI discovery measurable and fair
                </h2>
                <p className="text-sm text-muted-foreground">
                  Our mission is to help agencies and brands understand how AI
                  answers are formed and to give them the tools to be selected
                  for accurate, trustworthy recommendations.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border/60">
              <CardContent className="pt-6 space-y-3">
                <Badge variant="outline">Vision</Badge>
                <h2 className="text-xl font-semibold">
                  A world where great brands are visible in every answer
                </h2>
                <p className="text-sm text-muted-foreground">
                  We believe the future of search is answer-led. Our vision is
                  to make AI visibility transparent, so trustworthy brands can
                  compete on merit, not guesswork.
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-4">
              <Badge variant="outline">Our approach</Badge>
              <h2 className="text-3xl font-bold">
                Built for measurable AI visibility
              </h2>
              <p className="text-muted-foreground text-lg">
                We combine simulation, citation tracking, and selection-signal
                analysis so your team can see what AI engines value. That means
                faster optimization cycles, better client outcomes, and a clear
                path from insight to impact.
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {[
                  "Simulate real customer prompts across major AI engines",
                  "Track citations, mentions, and competitor benchmarks",
                  "Surface the signals that drive selection outcomes",
                  "Deliver prioritized fixes with measurable impact",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Globe2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Regional focus</p>
                  <h3 className="font-semibold">Dubai & GCC expertise</h3>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                We understand regional search behavior, bilingual content needs,
                and the business realities of agencies operating across the GCC.
              </p>
            </div>
          </section>


          <section className="space-y-6">
            <Badge variant="outline">Our values</Badge>
            <div className="grid md:grid-cols-2 gap-6">
              {values.map((value) => (
                <Card key={value.title} className="bg-card/60 border-border/60">
                  <CardContent className="pt-6 space-y-2">
                    <h3 className="font-semibold">{value.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {value.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="text-center space-y-4">
            <h2 className="text-3xl font-bold">Ready to see how AI selects?</h2>
            <p className="text-muted-foreground">
              Start measuring AI visibility for your clients in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="shine">
                <Link href="/signup">Start Free Trial</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/pricing">View Pricing</Link>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

