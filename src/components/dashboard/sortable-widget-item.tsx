
"use client";

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableWidgetItemProps {
  id: string;
  children: React.ReactNode;
  isDragging?: boolean;
  className?: string; // Added to accept columnSpan or other classes
}

export function SortableWidgetItem({ id, children, isDragging, className }: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isOver,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isOver ? '0 0 0 2px hsl(var(--ring))' : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        "relative group rounded-lg", // Base styles
        isDragging && "shadow-2xl cursor-grabbing",
        className // Apply passed className here (e.g., for columnSpan)
      )}
    >
      {children}
      <button
        {...listeners}
        type="button"
        aria-label="Drag to reorder widget"
        className={cn(
          "absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground bg-background/50 hover:bg-accent hover:text-accent-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring transition-opacity",
          isDragging && "cursor-grabbing"
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-5 w-5" />
      </button>
    </div>
  );
}
