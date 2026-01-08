import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex gradient-mesh">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-card/30">
        <Link href="/">
          <Logo size="lg" />
        </Link>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Track How AI Engines{" "}
            <span className="text-primary">Select</span> Your Clients
          </h1>
          <p className="text-xl text-muted-foreground">
            Optimize visibility across ChatGPT, Perplexity, Gemini, and Grok.
            Built for digital agencies in Dubai and the GCC.
          </p>

          {/* Testimonial or feature highlight */}
          <div className="mt-12 p-6 rounded-xl bg-card/50 border border-border/50">
          <p className="text-lg mb-4">
            &ldquo;Finally, a tool that shows us exactly why AI engines pick
            competitors over our clients—and how to fix it.&rdquo;
          </p>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-semibold">AM</span>
              </div>
              <div>
                <p className="font-semibold">Ahmed M.</p>
                <p className="text-sm text-muted-foreground">
                  Digital Agency Owner, Dubai
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} EllipseSearch. All rights reserved.
        </p>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <Link href="/">
              <Logo size="lg" />
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

