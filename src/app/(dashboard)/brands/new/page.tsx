"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Globe, MapPin, Building2, Sparkles, Wand2, Tags, Target } from "lucide-react";
import { toast } from "sonner";

interface BrandContext {
  product_description: string;
  category: string;
  industry: string;
  target_audience: string;
  key_products: string[];
  competitors: string[];
  unique_selling_points: string[];
}

export default function NewBrandPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    primary_location: "",
    languages: ["en"] as string[],
    brand_aliases: "",
  });
  const [brandContext, setBrandContext] = useState<BrandContext>({
    product_description: "",
    category: "",
    industry: "",
    target_audience: "",
    key_products: [],
    competitors: [],
    unique_selling_points: [],
  });

  const handleLanguageToggle = (lang: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  const handleGenerateContext = async () => {
    if (!formData.domain.trim() || !formData.name.trim()) {
      toast.error("Enter brand name and domain first");
      return;
    }

    setIsGeneratingContext(true);

    try {
      const response = await fetch("/api/brands/generate-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: formData.domain,
          name: formData.name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate context");
      }

      setBrandContext(data.context);
      toast.success("Brand context generated!", {
        description: "Review and adjust the auto-generated information.",
      });
    } catch (error) {
      console.error("Error generating context:", error);
      toast.error("Failed to generate context", {
        description: "You can fill in the details manually.",
      });
    } finally {
      setIsGeneratingContext(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.domain.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        toast.error("No organization found");
        return;
      }

      // Clean domain (remove protocol if present)
      const cleanDomain = formData.domain
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");

      // Combine context into settings
      const settings: Record<string, unknown> = {};
      if (brandContext.product_description) settings.product_description = brandContext.product_description;
      if (brandContext.category) settings.category = brandContext.category;
      if (brandContext.industry) settings.industry = brandContext.industry;
      if (brandContext.target_audience) settings.target_audience = brandContext.target_audience;
      if (brandContext.key_products.length > 0) settings.key_products = brandContext.key_products;
      if (brandContext.competitors.length > 0) settings.competitors = brandContext.competitors;
      if (brandContext.unique_selling_points.length > 0) settings.unique_selling_points = brandContext.unique_selling_points;

      const { data: brand, error } = await supabase
        .from("brands")
        .insert({
          organization_id: profile.organization_id,
          name: formData.name.trim(),
          domain: cleanDomain,
          primary_location: formData.primary_location.trim() || null,
          languages: formData.languages,
          brand_aliases: formData.brand_aliases
            ? formData.brand_aliases.split(",").map(a => a.trim()).filter(Boolean)
            : [],
          settings,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-trigger website crawl in background (Ground Truth collection)
      try {
        const crawlResponse = await fetch("/api/brands/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand_id: brand.id,
            max_pages: 50,
            max_depth: 3,
          }),
        });
        
        if (crawlResponse.ok) {
          toast.success("Brand created! Crawling website...", {
            description: "We're analyzing your website in the background to build your Ground Truth profile.",
          });
        } else {
          toast.success("Brand created successfully!");
        }
      } catch {
        // Crawl failed but brand was created - that's okay
        toast.success("Brand created successfully!");
      }

      router.push(`/brands/${brand.id}`);
      router.refresh();
    } catch (error) {
      console.error("Error creating brand:", error);
      toast.error("Failed to create brand", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/brands">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add New Brand</h1>
          <p className="text-muted-foreground mt-1">
            Start tracking AI visibility for a new client
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Brand Information</h2>
              <p className="text-sm text-muted-foreground">Basic details about the brand</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Brand Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Red Bull"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain">Website Domain *</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="domain"
                  placeholder="e.g., redbull.com"
                  value={formData.domain}
                  onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
                  className="pl-9"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Primary Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="location"
                  placeholder="e.g., Dubai, UAE"
                  value={formData.primary_location}
                  onChange={(e) => setFormData(prev => ({ ...prev, primary_location: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aliases">Brand Aliases</Label>
              <Input
                id="aliases"
                placeholder="e.g., RedBull, ريد بول"
                value={formData.brand_aliases}
                onChange={(e) => setFormData(prev => ({ ...prev, brand_aliases: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated alternative names
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Languages</Label>
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lang-en"
                  checked={formData.languages.includes("en")}
                  onCheckedChange={() => handleLanguageToggle("en")}
                />
                <Label htmlFor="lang-en" className="cursor-pointer">English</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lang-ar"
                  checked={formData.languages.includes("ar")}
                  onCheckedChange={() => handleLanguageToggle("ar")}
                />
                <Label htmlFor="lang-ar" className="cursor-pointer">العربية</Label>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Context - AI Generated */}
        <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-6 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Brand Context</h2>
                <p className="text-sm text-muted-foreground">AI uses this to understand your brand</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateContext}
              disabled={isGeneratingContext || !formData.name || !formData.domain}
              className="gap-2"
            >
              {isGeneratingContext ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Auto-generate
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product_description">Product/Service Type *</Label>
              <Input
                id="product_description"
                placeholder="e.g., energy drinks, CRM software"
                value={brandContext.product_description}
                onChange={(e) => setBrandContext(prev => ({ ...prev, product_description: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                What does this brand sell?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="e.g., beverages, software"
                value={brandContext.category}
                onChange={(e) => setBrandContext(prev => ({ ...prev, category: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                placeholder="e.g., Food & Beverage, Technology"
                value={brandContext.industry}
                onChange={(e) => setBrandContext(prev => ({ ...prev, industry: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_audience" className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Target Audience
              </Label>
              <Input
                id="target_audience"
                placeholder="e.g., young professionals, athletes"
                value={brandContext.target_audience}
                onChange={(e) => setBrandContext(prev => ({ ...prev, target_audience: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="competitors" className="flex items-center gap-1.5">
              <Tags className="w-3.5 h-3.5" />
              Main Competitors
            </Label>
            <Input
              id="competitors"
              placeholder="e.g., Monster, Rockstar, Celsius"
              value={brandContext.competitors.join(", ")}
              onChange={(e) => setBrandContext(prev => ({ 
                ...prev, 
                competitors: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
              }))}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of competitors
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="usps">Unique Selling Points</Label>
            <Textarea
              id="usps"
              placeholder="What makes this brand unique? Enter each point on a new line..."
              value={brandContext.unique_selling_points.join("\n")}
              onChange={(e) => setBrandContext(prev => ({ 
                ...prev, 
                unique_selling_points: e.target.value.split("\n").map(s => s.trim()).filter(Boolean)
              }))}
              rows={3}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Link href="/brands">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isLoading} className="gap-2">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Brand"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
