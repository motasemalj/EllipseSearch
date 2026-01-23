import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const sections = [
  {
    title: "Information we collect",
    body: [
      "Account details such as name, email address, and company information.",
      "Usage data like feature activity, pages viewed, and interaction events.",
      "Technical data including IP address, browser type, and device identifiers.",
      "Billing details processed by our payment providers (we do not store full card numbers).",
    ],
  },
  {
    title: "How we use information",
    body: [
      "Provide and improve the EllipseSearch platform and customer support.",
      "Analyze AI visibility data and deliver reporting features you request.",
      "Send product updates, security alerts, and service communications.",
      "Comply with legal obligations and enforce our terms.",
    ],
  },
  {
    title: "Cookies and analytics",
    body: [
      "We use cookies and similar technologies to keep you signed in and measure site usage.",
      "You can control cookies through your browser settings, but some features may not work.",
    ],
  },
  {
    title: "Data sharing",
    body: [
      "We do not sell your personal information.",
      "We share data with trusted service providers (for example, hosting and payments) only as needed to deliver the service.",
      "We may disclose information if required by law, legal process, or to protect our rights.",
    ],
  },
  {
    title: "Data retention",
    body: [
      "We retain data for as long as your account is active or as needed to provide services.",
      "We may retain limited records to comply with legal or financial obligations.",
    ],
  },
  {
    title: "Your rights",
    body: [
      "You can request access, correction, or deletion of your personal data.",
      "You can opt out of non-essential emails at any time.",
    ],
  },
  {
    title: "Security",
    body: [
      "We use industry-standard safeguards to protect data in transit and at rest.",
      "No system is completely secure, but we continuously monitor and improve security controls.",
    ],
  },
  {
    title: "International transfers",
    body: [
      "We may process and store data in regions where we or our vendors operate.",
      "We use contractual safeguards where required by applicable law.",
    ],
  },
  {
    title: "Changes to this policy",
    body: [
      "We may update this policy periodically and will update the effective date when we do.",
      "Material changes will be communicated through the product or by email.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto space-y-12">
          <section className="text-center space-y-4">
            <Badge variant="outline">Privacy Policy</Badge>
            <h1 className="text-4xl md:text-5xl font-bold">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground">
              Last updated: January 23, 2026
            </p>
          </section>

          <section className="space-y-4 text-muted-foreground text-lg">
            <p>
              EllipseSearch respects your privacy. This policy explains what we
              collect, how we use it, and the choices you have when using our
              services.
            </p>
            <p>
              If you have questions about this policy, contact{" "}
              <a
                href="mailto:support@ellipse.ai"
                className="text-foreground underline"
              >
                support@ellipse.ai
              </a>
              .
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

