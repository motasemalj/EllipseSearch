import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Globe2, LineChart, Users, Zap } from "lucide-react";

const focusAreas = [
  {
    title: "Product & Engineering",
    description:
      "Build the core platform that measures AI citations, analyzes signals, and powers agency workflows.",
    icon: Zap,
  },
  {
    title: "AI & Data",
    description:
      "Develop detection models, brand intelligence, and analytics that turn raw data into insight.",
    icon: LineChart,
  },
  {
    title: "Customer Success",
    description:
      "Partner with agencies to translate AI visibility data into clear strategies and wins.",
    icon: Users,
  },
  {
    title: "Sales",
    description:
      "Partner with agencies to define success, scope outcomes, and expand long-term client impact.",
    icon: Globe2,
  },
];

export default function CareersPage() {
  return (
    <div className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto space-y-16">
          <section className="text-center space-y-6">
            <Badge variant="outline">Careers</Badge>
            <h1 className="text-4xl md:text-5xl font-bold">
              Help brands win in AI answers
            </h1>
            <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
              We&apos;re building the AI visibility platform for agencies across
              Dubai and the GCC. If you care about the future of search and want
              to shape how brands are discovered, we&apos;d love to meet you.
            </p>
          </section>

          <section className="grid md:grid-cols-2 gap-6">
            {focusAreas.map((area) => (
              <Card key={area.title} className="bg-card/60 border-border/60">
                <CardContent className="pt-6 space-y-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <area.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold">{area.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {area.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="text-center space-y-4">
            <h2 className="text-3xl font-bold">Interested in joining?</h2>
            <p className="text-muted-foreground">
              Send a short note about what you want to build, your most relevant
              work, and your resume.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="shine">
                <a href="mailto:support@ellipse.ai?subject=Careers%20at%20EllipseSearch">
                  Contact Careers
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/about">Learn about us</Link>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

