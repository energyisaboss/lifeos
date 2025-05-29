
"use client";

import { useState, useEffect } from 'react';
import { DateTimeWidget } from '@/components/dashboard/datetime-widget';
import { NewsWidget } from '@/components/dashboard/news-widget';
import { CalendarWidget } from '@/components/dashboard/calendar-widget';
import { EnvironmentalWidget } from '@/components/dashboard/environmental-widget';
import { AssetTrackerWidget } from '@/components/dashboard/asset-tracker-widget';
import { TaskListWidget } from '@/components/dashboard/task-list-widget';
import { Separator } from '@/components/ui/separator';
import { LifeBuoy, Settings as SettingsIcon, X, Palette as PaletteIcon } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { AccentColorSwitcher } from '@/components/theme/accent-color-switcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableWidgetItem } from '@/components/dashboard/sortable-widget-item';

const WIDGET_ORDER_STORAGE_KEY = 'lifeOS_widgetOrder_v2';

interface WidgetConfig {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props?: Record<string, any>;
  columnSpan?: string; // e.g., 'lg:col-span-1', 'lg:col-span-2'
}

const initialWidgetConfigs: WidgetConfig[] = [
  { id: 'datetime', Component: DateTimeWidget, columnSpan: 'lg:col-span-1' },
  { id: 'calendar', Component: CalendarWidget, columnSpan: 'lg:col-span-1' },
  { id: 'news', Component: NewsWidget, columnSpan: 'lg:col-span-1' },
  { id: 'environmental', Component: EnvironmentalWidget, columnSpan: 'lg:col-span-1' },
  { id: 'assets', Component: AssetTrackerWidget, columnSpan: 'lg:col-span-1' },
  { id: 'tasks', Component: TaskListWidget, columnSpan: 'lg:col-span-1' },
];

export default function LifeOSPage() {
  const [showGlobalWidgetSettings, setShowGlobalWidgetSettings] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => initialWidgetConfigs.map(w => w.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const savedOrder = localStorage.getItem(WIDGET_ORDER_STORAGE_KEY);
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder) as string[];
        const currentWidgetIds = new Set(initialWidgetConfigs.map(w => w.id));
        const filteredOrder = parsedOrder.filter(id => currentWidgetIds.has(id));
        const newIds = Array.from(currentWidgetIds).filter(id => !filteredOrder.includes(id));
        setWidgetOrder([...filteredOrder, ...newIds]);
      } catch (e) {
        console.error("Failed to parse widget order from localStorage", e);
        setWidgetOrder(initialWidgetConfigs.map(w => w.id));
      }
    } else {
      setWidgetOrder(initialWidgetConfigs.map(w => w.id));
    }
  }, []);

  useEffect(() => {
    if (isClient) {
      localStorage.setItem(WIDGET_ORDER_STORAGE_KEY, JSON.stringify(widgetOrder));
    }
  }, [widgetOrder, isClient]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWidgetOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }
  
  const getWidgetById = (id: string | null): WidgetConfig | undefined => {
    return initialWidgetConfigs.find(widget => widget.id === id);
  };

  const orderedWidgets = widgetOrder.map(id => getWidgetById(id)).filter(Boolean) as WidgetConfig[];

  if (!isClient) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
        <header className="mb-6 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <LifeBuoy className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-4xl font-bold">LifeOS</h1>
              <p className="text-muted-foreground mt-1">Your personal operating system for life.</p>
            </div>
          </div>
        </header>
        <div className="text-center p-10">Loading Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <header className="mb-6 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <LifeBuoy className="h-10 w-10 text-primary" />
          <div>
            <h1 className="text-4xl font-bold">LifeOS</h1>
            <p className="text-muted-foreground mt-1">Your personal operating system for life.</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
           <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle Widget Settings"
            onClick={() => setShowGlobalWidgetSettings(!showGlobalWidgetSettings)}
          >
            {showGlobalWidgetSettings ? <X className="h-5 w-5" /> : <SettingsIcon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {showGlobalWidgetSettings && (
        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Global Widget Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-lg font-semibold mb-3 block">Theme Accent Color</Label>
              <div className="p-4 border rounded-lg bg-muted/30">
                <AccentColorSwitcher />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CalendarWidget settingsOpen={true} displayMode="settingsOnly" />
              <NewsWidget settingsOpen={true} displayMode="settingsOnly" />
              <AssetTrackerWidget settingsOpen={true} displayMode="settingsOnly" />
              <TaskListWidget settingsOpen={true} displayMode="settingsOnly" />
            </div>
          </CardContent>
        </Card>
      )}

      <Separator className="my-6" />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgetOrder} strategy={rectSortingStrategy}>
          <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start auto-rows-min">
            {orderedWidgets.map(({ id, Component, props = {}, columnSpan = 'lg:col-span-1' }) => {
              let dynamicProps = { ...props };
              return (
                <SortableWidgetItem key={id} id={id} isDragging={activeId === id} className={columnSpan}>
                  <Component {...dynamicProps} displayMode="widgetOnly" settingsOpen={false} />
                </SortableWidgetItem>
              );
            })}
          </main>
        </SortableContext>
        <DragOverlay>
          {activeId ? (
            <div className="opacity-75 shadow-2xl">
              {(() => {
                const activeWidget = getWidgetById(activeId);
                if (activeWidget) {
                  const { Component, props = {} } = activeWidget;
                  let dynamicProps = { ...props };
                  return <Component {...dynamicProps} displayMode="widgetOnly" settingsOpen={false} />;
                }
                return null;
              })()}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} LifeOS. Minimalist dashboard design.</p>
      </footer>
    </div>
  );
}
