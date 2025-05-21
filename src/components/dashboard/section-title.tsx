import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionTitleProps {
  icon?: LucideIcon;
  title: string;
  className?: string;
}

export function SectionTitle({ icon: Icon, title, className }: SectionTitleProps) {
  return (
    <div className={cn("flex items-center gap-2 text-lg font-semibold text-card-foreground mb-3", className)}>
      {Icon && <Icon className="w-5 h-5" />}
      <h2>{title}</h2>
    </div>
  );
}
