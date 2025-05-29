
"use client";
import { DndContext, useSensors, useSensor, PointerSensor, KeyboardSensor, DragStartEvent, DragEndEvent, closestCenter, DragOverlay } from '@dnd-kit/core';
import { useState, useEffect, ComponentType } from 'react';
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
import { SortableContext, sortableKeyboardCoordinates, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { Label } from '@/components/ui/label';
import { SortableWidgetItem } from '@/components/dashboard/sortable-widget-item';
import { Switch } from '@/components/ui/switch';

const WIDGET_ORDER_STORAGE_KEY = 'widgetOrder_v1'; // Updated key for potentially new structure
const WIDGET_VISIBILITY_STORAGE_KEY = 'widgetVisibility_v1';

interface WidgetConfig {
  id: string;
  Component: ComponentType<any>; 
  name: string; // Added name property for display
  props?: any;
  columnSpan?: string;
}

const initialWidgetConfigs: WidgetConfig[] = [
  { id: 'datetime', name: 'Date and Time', Component: DateTimeWidget, props: {}, columnSpan: 'lg:col-span-1' },
  { id: 'news', name: 'News', Component: NewsWidget, props: {}, columnSpan: 'lg:col-span-1' }, // Changed from lg:col-span-2
  { id: 'calendar', name: 'Calendar', Component: CalendarWidget, props: {}, columnSpan: 'lg:col-span-1' },
  { id: 'environmental', name: 'Environmental', Component: EnvironmentalWidget, props: {}, columnSpan: 'lg:col-span-1' },
  { id: 'asset-tracker', name: 'Asset Tracker', Component: AssetTrackerWidget, props: {}, columnSpan: 'lg:col-span-1' },
  { id: 'task-list', name: 'Tasks', Component: TaskListWidget, props: {}, columnSpan: 'lg:col-span-1' },
];

const getWidgetById = (id: string): WidgetConfig | undefined => {
  return initialWidgetConfigs.find(widget => widget.id === id);
};

export default function LifeOSPage() {
  const [showGlobalWidgetSettings, setShowGlobalWidgetSettings] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => initialWidgetConfigs.map(w => w.id));
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>(() => {
    // Default: all widgets visible
    return initialWidgetConfigs.reduce((acc, widget) => ({ ...acc, [widget.id]: true }), {});
  });


  useEffect(() => {
    setIsClient(true);
    const savedOrder = localStorage.getItem(WIDGET_ORDER_STORAGE_KEY);
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder) as string[];
        const currentWidgetIds = new Set(initialWidgetConfigs.map(w => w.id));
        // Filter out any IDs in savedOrder that are no longer in initialWidgetConfigs
        const filteredOrder = parsedOrder.filter(id => currentWidgetIds.has(id));
        // Find any new widget IDs that are not in the filteredOrder
        const newIds = Array.from(currentWidgetIds).filter(id => !filteredOrder.includes(id));
        // Combine them, keeping the user's order for existing widgets and appending new ones
        setWidgetOrder([...filteredOrder, ...newIds]);
      } catch (e) {
        console.error("Failed to parse widget order from localStorage", e);
        setWidgetOrder(initialWidgetConfigs.map(w => w.id));
      }

      const savedVisibility = localStorage.getItem(WIDGET_VISIBILITY_STORAGE_KEY);
      if (savedVisibility) {
        try {
          const parsedVisibility = JSON.parse(savedVisibility) as Record<string, boolean>;
          const currentWidgetIds = new Set(initialWidgetConfigs.map(w => w.id));
          const updatedVisibility: Record<string, boolean> = {};
          // Include saved visibility for existing widgets
          Object.keys(parsedVisibility).forEach(id => {
            if (currentWidgetIds.has(id)) {
              updatedVisibility[id] = parsedVisibility[id];
            }
          });
          // Add new widgets as visible by default
          initialWidgetConfigs.forEach(widget => {
            if (updatedVisibility[widget.id] === undefined) {
              updatedVisibility[widget.id] = true;
            }
          });
          setWidgetVisibility(updatedVisibility);
        } catch (e) {
          console.error("Failed to parse widget visibility from localStorage", e);
        }
      }
    } else {
      setWidgetOrder(initialWidgetConfigs.map(w => w.id));
    }
  }, []); // Empty dependency array to run only on mount

  useEffect(() => {
    if (isClient) {
      localStorage.setItem(WIDGET_ORDER_STORAGE_KEY, JSON.stringify(widgetOrder));
    }
  }, [widgetOrder, isClient]);

  useEffect(() => {
    if (isClient && Object.keys(widgetVisibility).length > 0) {
      localStorage.setItem(WIDGET_VISIBILITY_STORAGE_KEY, JSON.stringify(widgetVisibility));
    }
  }, [widgetVisibility, isClient]);

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

  const handleWidgetVisibilityChange = (id: string, isVisible: boolean) => {
    setWidgetVisibility(prev => ({ ...prev, [id]: isVisible }));
  };

  // Filter widgets based on visibility before ordering
  const orderedWidgets = widgetOrder.map(id => getWidgetById(id)).filter(Boolean).filter(widget => widgetVisibility[widget!.id]) as WidgetConfig[];

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
            <Separator/>
            <div>
              <Label className="text-lg font-semibold mb-3 block">Widget Visibility</Label>
              <div className="p-4 border rounded-lg bg-muted/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {initialWidgetConfigs.map(widget => (
                  <div key={widget.id} className="flex items-center justify-between space-x-2">
                    <Label htmlFor={`switch-${widget.id}`}>{widget.name}</Label>
                    <Switch
                      id={`switch-${widget.id}`}
                      checked={!!widgetVisibility[widget.id]}
                      onCheckedChange={(checked) => handleWidgetVisibilityChange(widget.id, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <CalendarWidget settingsOpen={true} displayMode="settingsOnly" />
              </div>
              <div>
                <NewsWidget settingsOpen={true} displayMode="settingsOnly" />
              </div>
               <div>
                <AssetTrackerWidget settingsOpen={true} displayMode="settingsOnly" />
              </div>
              <div>
                <TaskListWidget settingsOpen={true} displayMode="settingsOnly" />
              </div>
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
        <SortableContext items={orderedWidgets.map(w => w.id)} strategy={rectSortingStrategy}>
          <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start auto-rows-min">
            {orderedWidgets.map(({ id, Component, props = {}, columnSpan = 'lg:col-span-1' }) => {
              let dynamicProps = { ...props };
              // For the main display, settingsOpen is false, and displayMode is widgetOnly
              if (id === 'calendar' || id === 'news' || id === 'asset-tracker' || id === 'task-list') {
                dynamicProps.settingsOpen = false; 
                dynamicProps.displayMode = "widgetOnly";
              }
              return (
                <SortableWidgetItem key={id} id={id} isDragging={activeId === id} className={columnSpan}>
                  <Component {...dynamicProps} />
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
                   if (activeWidget.id === 'calendar' || activeWidget.id === 'news' || activeWidget.id === 'asset-tracker' || activeWidget.id === 'task-list') {
                    dynamicProps.settingsOpen = false;
                    dynamicProps.displayMode = "widgetOnly";
                  }
                  return <Component {...dynamicProps} />;
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
