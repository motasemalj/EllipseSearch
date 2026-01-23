import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const sections = [
  {
    title: "Acceptance of terms",
    body: [
      "By accessing or using EllipseSearch, you agree to these terms and our Privacy Policy.",
      "If you do not agree, do not use the service.",
    ],
  },
  {
    title: "Service overview",
    body: [
      "EllipseSearch provides AI visibility analysis, reporting, and tooling for agencies and brands.",
      "We may update features, interfaces, or availability at any time.",
    ],
  },
  {
    title: "Accounts and responsibilities",
    body: [
      "You are responsible for maintaining the confidentiality of your account credentials.",
      "You agree to provide accurate account and billing information.",
      "You are responsible for all activity that occurs under your account.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "Do not attempt to disrupt, reverse engineer, or access systems without authorization.",
      "Do not use the service to violate laws or infringe the rights of others.",
      "Do not upload or analyze content you do not have the right to use.",
    ],
  },
  {
    title: "Subscriptions and billing",
    body: [
      "Paid plans renew automatically unless canceled prior to the renewal date.",
      "Fees are non-refundable except where required by law or explicitly stated.",
      "We may change pricing with notice before your next billing cycle.",
    ],
  },
  {
    title: "Intellectual property",
    body: [
      "EllipseSearch retains all rights in the platform, software, and content.",
      "You retain ownership of your brand content and data submitted to the service.",
      "We may use anonymized, aggregated usage data to improve the platform.",
    ],
  },
  {
    title: "Confidentiality",
    body: [
      "We treat your account data as confidential and use it only to deliver the service.",
      "You agree to keep any non-public product or pricing information confidential.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "The service may integrate with third-party providers (e.g., AI engines, analytics, payments).",
      "We are not responsible for third-party services and their terms or policies.",
    ],
  },
  {
    title: "Disclaimers",
    body: [
      "The service is provided on an “as is” and “as available” basis.",
      "We do not guarantee specific rankings, citations, or business outcomes.",
    ],
  },
  {
    title: "Limitation of liability",
    body: [
      "To the maximum extent permitted by law, EllipseSearch is not liable for indirect or consequential damages.",
      "Our total liability for any claim is limited to the amount you paid in the preceding 12 months.",
    ],
  },
  {
    title: "Termination",
    body: [
      "You may cancel your account at any time.",
      "We may suspend or terminate access for violations of these terms.",
    ],
  },
  {
    title: "Governing law",
    body: [
      "These terms are governed by the laws of the United Arab Emirates, without regard to conflict of law principles.",
      "Disputes will be resolved in the courts of Dubai, UAE, unless otherwise required by law.",
    ],
  },
  {
    title: "Contact",
    body: [
      "For questions about these terms, email support@ellipse.ai.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto space-y-12">
          <section className="text-center space-y-4">
            <Badge variant="outline">Terms of Service</Badge>
            <h1 className="text-4xl md:text-5xl font-bold">
              Terms of Service
            </h1>
            <p className="text-muted-foreground">
              Last updated: January 23, 2026
            </p>
          </section>

          <section className="space-y-4 text-muted-foreground text-lg">
            <p>
              These Terms of Service govern your access to and use of the
              EllipseSearch platform. By using the service, you agree to these
              terms.
            </p>
          </section>

          <section className="grid gap-6">
            {sections.map((section) => (
              <Card key={section.title} className="bg-card/60 border-border/60">
                <CardContent className="pt-6 space-y-3">
                  <h2 className="text-xl font-semibold">{section.title}</h2>
                  <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
                    {section.body.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

