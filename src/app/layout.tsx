import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "EllipseSearch | AI Selection Intelligence for Agencies",
    template: "%s | EllipseSearch",
  },
  description:
    "Track how AI search engines like ChatGPT, Perplexity, Gemini, and Grok select and cite brands. Optimize your client's AI visibility.",
  keywords: [
    "AEO",
    "Answer Engine Optimization",
    "AI Visibility",
    "ChatGPT",
    "Perplexity",
    "Gemini",
    "Grok",
    "Dubai",
    "GCC",
    "Digital Agency",
    "SEO",
  ],
  authors: [{ name: "EllipseSearch" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL,
    title: "EllipseSearch | AI Selection Intelligence for Agencies",
    description:
      "Track how AI search engines select and cite brands. Win more leads with AI visibility optimization.",
    siteName: "EllipseSearch",
  },
  twitter: {
    card: "summary_large_image",
    title: "EllipseSearch | AI Selection Intelligence",
    description:
      "Track how AI search engines select and cite brands. Win more leads with AI visibility optimization.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
