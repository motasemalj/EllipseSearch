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
      "rounded-lg border border-border bg-card overflow-hidden",
      className
    )}>
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-semibold text-sm">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
