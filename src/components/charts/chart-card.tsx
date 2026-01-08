import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "rounded-2xl border border-border bg-card overflow-hidden",
      "transition-all duration-200 hover:shadow-lg hover:shadow-primary/5",
      className
    )}>
      <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-muted/30 to-transparent flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <p className="font-semibold text-[15px] leading-none">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
