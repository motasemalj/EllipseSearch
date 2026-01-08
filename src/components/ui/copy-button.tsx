"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface CopyButtonClientProps {
  text: string;
  label?: string;
}

export function CopyButtonClient({ text, label = "Copy" }: CopyButtonClientProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Button variant="ghost" size="sm" className="gap-2" onClick={handleCopy}>
      {copied ? (
        <>
          <Check className="w-4 h-4 text-green-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          {label}
        </>
      )}
    </Button>
  );
}

