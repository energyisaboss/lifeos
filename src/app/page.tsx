
"use client";
import { DndContext, useSensors, useSensor, PointerSensor, KeyboardSensor, DragStartEvent, DragEndEvent, closestCenter, DragOverlay } from '@dnd-kit/core';
import { useState, useEffect, ComponentType, useCallback } from 'react';
import { DateTimeWidget } from '@/components/dashboard/datetime-widget';
import { NewsWidget } from '@/components/dashboard/news-widget';
import { CalendarWidget } from '@/components/dashboard/calendar-widget';
import { EnvironmentalWidget } from '@/components/dashboard/environmental-widget';
import { AssetTrackerWidget } from '@/components/dashboard/asset-tracker-widget';
import { TaskListWidget } from '@/components/dashboard/task-list-widget';
import { Separator } from '@/components/ui/separator';
import { LifeBuoy, Settings as SettingsIcon, X, Palette as PaletteIcon, PlusCircle, Trash2, Edit3, LinkIcon, Check, XCircle, Palette } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { AccentColorSwitcher } from '@/components/theme/accent-color-switcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SortableContext, sortableKeyboardCoordinates, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { Label } from '@/components/ui/label';
import { SortableWidgetItem } from '@/components/dashboard/sortable-widget-item';
import { Switch } from '@/components/ui/switch';
import type { IcalFeedItem } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';


const WIDGET_ORDER_STORAGE_KEY = 'widgetOrder_v2_dynamicFeeds'; // New key for new structure
const WIDGET_VISIBILITY_STORAGE_KEY = 'widgetVisibility_v2_dynamicFeeds';
const ICAL_FEEDS_STORAGE_KEY_PAGE = 'pageIcalFeedsLifeOS_v1';
const CALENDAR_WIDGET_ID_PREFIX = 'calendar-feed-';

const MAX_ICAL_FEEDS_PAGE = 10;

interface StaticWidgetConfig {
  id: string;
  Component: ComponentType<any>;
  name: string; // For visibility toggle
  props?: any;
  columnSpan?: string;
  isCalendarFeed?: false; // Differentiator
}

interface DynamicCalendarFeedWidgetConfig {
  id: string; // Will be CALENDAR_WIDGET_ID_PREFIX + feed.id
  Component: typeof CalendarWidget;
  name: string; // Will be feed.label, for visibility toggle
  props: { feed: IcalFeedItem };
  columnSpan?: string;
  isCalendarFeed: true;
}

type WidgetConfig = StaticWidgetConfig | DynamicCalendarFeedWidgetConfig;

const initialStaticWidgetConfigs: StaticWidgetConfig[] = [
  { id: 'datetime', name: 'Date and Time', Component: DateTimeWidget, props: {}, columnSpan: 'lg:col-span-1' },
  { id: 'news', name: 'News', Component: NewsWidget, props: {}, columnSpan: 'lg:col-span-1' },
  { id: 'environmental', name: 'Environmental', Component: EnvironmentalWidget, props: {}, columnSpan: 'lg:col-span-1' },
  { id: 'asset-tracker', name: 'Asset Tracker', Component: AssetTrackerWidget, props: {}, columnSpan: 'lg:col-span-1' },
  { id: 'task-list', name: 'Tasks', Component: TaskListWidget, props: {}, columnSpan: 'lg:col-span-1' },
];


const predefinedCalendarColors: { name: string; value: string }[] = [
  { name: 'Red', value: '#F44336' },
  { name: 'Blue', value: '#2196F3' },
  { name: 'Orange', value: '#FF9800' },
  { name: 'Yellow', value: '#FFEB3B' },
  { name: 'Green', value: '#4CAF50' },
  { name: 'Purple', value: '#9C27B0' },
];
let lastAssignedCalendarColorIndex = -1;

const getNextCalendarFeedColor = (): string => {
  lastAssignedCalendarColorIndex = (lastAssignedCalendarColorIndex + 1) % predefinedCalendarColors.length;
  return predefinedCalendarColors[lastAssignedCalendarColorIndex].value;
};
const isValidHexColor = (color: string) => /^#([0-9A-F]{3}){1,2}$/i.test(color);


export default function LifeOSPage() {
  const [showGlobalWidgetSettings, setShowGlobalWidgetSettings] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // State for iCal feeds, managed at page level
  const [icalFeeds, setIcalFeeds] = useState<IcalFeedItem[]>([]);
  const [editingIcalFeed, setEditingIcalFeed] = useState<IcalFeedItem | null>(null);
  const [currentIcalEditData, setCurrentIcalEditData] = useState<{ url: string; label: string; color: string }>({ url: '', label: '', color: getNextCalendarFeedColor() });
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [newIcalLabel, setNewIcalLabel] = useState('');

  // Combine static widgets and dynamic calendar feed widgets for ordering and visibility
  const allConfigurableWidgets = (): WidgetConfig[] => {
    const calendarFeedWidgets: DynamicCalendarFeedWidgetConfig[] = icalFeeds.map(feed => ({
      id: `${CALENDAR_WIDGET_ID_PREFIX}${feed.id}`,
      name: feed.label || `Calendar: ${feed.url.substring(0,20)}...`,
      Component: CalendarWidget,
      props: { feed },
      columnSpan: 'lg:col-span-1',
      isCalendarFeed: true,
    }));
    return [...initialStaticWidgetConfigs, ...calendarFeedWidgets];
  };

  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => allConfigurableWidgets().map(w => w.id));
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>(() => {
    return allConfigurableWidgets().reduce((acc, widget) => ({ ...acc, [widget.id]: true }), {});
  });

  const getWidgetConfigById = (id: string): WidgetConfig | undefined => {
    return allConfigurableWidgets().find(widget => widget.id === id);
  };

  // Load iCal feeds from localStorage
  useEffect(() => {
    if (isClient) {
      const savedFeedsString = localStorage.getItem(ICAL_FEEDS_STORAGE_KEY_PAGE);
      if (savedFeedsString) {
        try {
          const parsedFeeds = JSON.parse(savedFeedsString) as IcalFeedItem[];
          setIcalFeeds(parsedFeeds.map(f => ({...f, color: (f.color && isValidHexColor(f.color)) ? f.color : getNextCalendarFeedColor()})));
        } catch (e) {
          console.error("Failed to parse iCal feeds from localStorage on page", e);
          setIcalFeeds([]);
        }
      }
    }
  }, [isClient]);

  // Save iCal feeds to localStorage
  useEffect(() => {
    if (isClient && icalFeeds.length > 0) { // Save even if empty to clear old data potentially
      localStorage.setItem(ICAL_FEEDS_STORAGE_KEY_PAGE, JSON.stringify(icalFeeds));
    } else if (isClient && icalFeeds.length === 0) {
       localStorage.removeItem(ICAL_FEEDS_STORAGE_KEY_PAGE);
    }
  }, [icalFeeds, isClient]);

  useEffect(() => {
    setIsClient(true);

    const savedOrder = localStorage.getItem(WIDGET_ORDER_STORAGE_KEY);
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder) as string[];
        // Filter out IDs that no longer exist (e.g. deleted calendar feeds)
        const currentWidgetIds = new Set(allConfigurableWidgets().map(w => w.id));
        const filteredOrder = parsedOrder.filter(id => currentWidgetIds.has(id));
        // Add any new widget IDs (e.g. newly added calendar feeds or new static widgets)
        const newIds = Array.from(currentWidgetIds).filter(id => !filteredOrder.includes(id));
        setWidgetOrder([...filteredOrder, ...newIds]);
      } catch (e) {
        console.error("Failed to parse widget order from localStorage", e);
        setWidgetOrder(allConfigurableWidgets().map(w => w.id));
      }
    } else {
      setWidgetOrder(allConfigurableWidgets().map(w => w.id));
    }

    const savedVisibility = localStorage.getItem(WIDGET_VISIBILITY_STORAGE_KEY);
    if (savedVisibility) {
      try {
        const parsedVisibility = JSON.parse(savedVisibility) as Record<string, boolean>;
        const currentConfigs = allConfigurableWidgets();
        const updatedVisibility: Record<string, boolean> = {};
        currentConfigs.forEach(widget => {
          updatedVisibility[widget.id] = parsedVisibility[widget.id] !== undefined ? parsedVisibility[widget.id] : true;
        });
        setWidgetVisibility(updatedVisibility);
      } catch (e) {
        console.error("Failed to parse widget visibility from localStorage", e);
        setWidgetVisibility(allConfigurableWidgets().reduce((acc, widget) => ({ ...acc, [widget.id]: true }), {}));
      }
    } else {
      setWidgetVisibility(allConfigurableWidgets().reduce((acc, widget) => ({ ...acc, [widget.id]: true }), {}));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, icalFeeds]); // Re-run if icalFeeds changes to update order/visibility for new/deleted feeds

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

  const dashboardWidgetsToRender = widgetOrder
    .map(id => getWidgetConfigById(id))
    .filter(Boolean)
    .filter(widget => widgetVisibility[widget!.id]) as WidgetConfig[];


  // Calendar Feed Management Logic (moved from CalendarWidget)
  const handleAddNewIcalFeed = useCallback(() => {
    if (icalFeeds.length >= MAX_ICAL_FEEDS_PAGE) {
      toast({ title: "Feed Limit Reached", description: `Max ${MAX_ICAL_FEEDS_PAGE} iCalendar feeds.`, variant: "destructive" });
      return;
    }
    if (!newIcalUrl.trim()) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
    // Basic URL validation
    const urlLower = newIcalUrl.toLowerCase();
    if (!(urlLower.startsWith('http') || urlLower.startsWith('webcal')) ||
        !(urlLower.endsWith('.ics') || urlLower.includes('format=ical'))) {
       toast({ title: "Invalid URL", description: "Please enter a valid iCalendar URL.", variant: "destructive" });
      return;
    }

    const newFeedItem: IcalFeedItem = {
      id: `feed-${Date.now()}-${Math.random().toString(36).substring(2,9)}`,
      url: newIcalUrl.trim(),
      label: newIcalLabel.trim() || `Calendar Feed ${icalFeeds.length + 1}`,
      color: getNextCalendarFeedColor(),
    };
    setIcalFeeds(prev => [...prev, newFeedItem]);
    setNewIcalUrl('');
    setNewIcalLabel('');
    toast({ title: "Calendar Feed Added", description: `"${newFeedItem.label}" added.` });
  }, [icalFeeds, newIcalUrl, newIcalLabel]);

  const handleRemoveIcalFeed = useCallback((idToRemove: string) => {
    const feedToRemove = icalFeeds.find(f => f.id === idToRemove);
    setIcalFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    // Also remove from widgetOrder and widgetVisibility
    const calendarWidgetId = `${CALENDAR_WIDGET_ID_PREFIX}${idToRemove}`;
    setWidgetOrder(prev => prev.filter(id => id !== calendarWidgetId));
    setWidgetVisibility(prev => {
      const newVis = {...prev};
      delete newVis[calendarWidgetId];
      return newVis;
    });
    toast({ title: "Calendar Feed Removed", description: `"${feedToRemove?.label}" removed.` });
  }, [icalFeeds]);

  const handleStartEditIcalFeed = useCallback((feed: IcalFeedItem) => {
    setEditingIcalFeed(feed);
    setCurrentIcalEditData({ url: feed.url, label: feed.label, color: feed.color });
  }, []);

  const handleCancelEditIcalFeed = useCallback(() => {
    setEditingIcalFeed(null);
    setCurrentIcalEditData({ url: '', label: '', color: getNextCalendarFeedColor() });
  }, []);

  const handleSaveIcalFeedChanges = useCallback(() => {
    if (!editingIcalFeed) return;
    const { url, label, color } = currentIcalEditData;
    if (!url.trim()) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
    const urlLower = url.toLowerCase();
     if (!(urlLower.startsWith('http') || urlLower.startsWith('webcal')) ||
        !(urlLower.endsWith('.ics') || urlLower.includes('format=ical'))) {
       toast({ title: "Invalid URL", description: "Please enter a valid iCalendar URL.", variant: "destructive" });
      return;
    }
    if (!isValidHexColor(color)) {
       toast({ title: "Invalid Color", description: "Please enter a valid hex color.", variant: "destructive" });
      return;
    }

    setIcalFeeds(prevFeeds =>
      prevFeeds.map(f =>
        f.id === editingIcalFeed.id ? { ...f, url: url.trim(), label: label.trim() || `Calendar Feed ${prevFeeds.findIndex(pf => pf.id === f.id) + 1}`, color } : f
      )
    );
    toast({ title: "Calendar Feed Updated", description: `Feed "${label.trim()}" settings saved.` });
    handleCancelEditIcalFeed();
  }, [editingIcalFeed, currentIcalEditData, handleCancelEditIcalFeed]);

  const handleIcalFeedColorChange = (feedId: string, newColor: string) => {
    if (!isValidHexColor(newColor) && newColor !== '') {
       toast({ title: "Invalid Color", description: "Please enter a valid hex color.", variant: "destructive" });
       return;
    }
    if (editingIcalFeed && editingIcalFeed.id === feedId) {
        setCurrentIcalEditData(prev => ({ ...prev, color: newColor }));
    }
  };


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
            aria-label="Toggle Global Widget Settings"
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
              <div className="p-4 border rounded-lg bg-muted/30 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {allConfigurableWidgets().map(widget => (
                  <div key={`vis-${widget.id}`} className="flex items-center justify-between space-x-2 p-2 rounded-md hover:bg-muted/50">
                    <Label htmlFor={`switch-vis-${widget.id}`} className="text-sm truncate" title={widget.name}>
                      {widget.name}
                    </Label>
                    <Switch
                      id={`switch-vis-${widget.id}`}
                      checked={!!widgetVisibility[widget.id]}
                      onCheckedChange={(checked) => handleWidgetVisibilityChange(widget.id, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <Separator/>
            
            {/* Calendar Feeds Management Section */}
            <div className="p-3 border rounded-lg bg-muted/20 shadow-sm">
                <CardTitle className="text-lg mb-3">Manage Calendar Feeds</CardTitle>
                <Card className="p-3 bg-muted/30 rounded-md mb-4">
                    <Label htmlFor="new-ical-label" className="text-xs font-medium">New Feed Label (Optional)</Label>
                    <Input id="new-ical-label" type="text" placeholder="e.g., Work Calendar" value={newIcalLabel} onChange={(e) => setNewIcalLabel(e.target.value)} className="h-9 text-sm mt-1" />
                    <Label htmlFor="new-ical-url" className="text-xs font-medium mt-2 block">iCal Feed URL*</Label>
                    <Input id="new-ical-url" type="url" placeholder="https://example.com/feed.ics" value={newIcalUrl} onChange={(e) => setNewIcalUrl(e.target.value)} className="h-9 text-sm mt-1" required />
                    <Button size="sm" onClick={handleAddNewIcalFeed} disabled={icalFeeds.length >= MAX_ICAL_FEEDS_PAGE || !newIcalUrl.trim()} className="w-full mt-3">
                        <PlusCircle className="w-4 h-4 mr-2" /> Add Feed ({icalFeeds.length}/{MAX_ICAL_FEEDS_PAGE})
                    </Button>
                </Card>

                {isClient && icalFeeds.length > 0 && (
                <div className="mt-3">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Active Calendar Feeds</h4>
                    <ScrollArea className="h-[240px] pr-1 custom-styled-scroll-area overflow-y-auto">
                    <div className="space-y-3">
                        {icalFeeds.map((feed) => (
                        <Card key={feed.id} className="p-2.5 shadow-sm border bg-background">
                            {editingIcalFeed && editingIcalFeed.id === feed.id ? (
                            <div className="space-y-2">
                                <div><Label htmlFor={`edit-label-${feed.id}`} className="text-xs">Label</Label><Input id={`edit-label-${feed.id}`} value={currentIcalEditData.label} onChange={(e) => setCurrentIcalEditData(prev => ({...prev, label: e.target.value}))} placeholder="Feed Label" className="h-8 text-sm mt-0.5" /></div>
                                <div><Label htmlFor={`edit-url-${feed.id}`} className="text-xs">URL</Label><Input id={`edit-url-${feed.id}`} type="url" value={currentIcalEditData.url} onChange={(e) => setCurrentIcalEditData(prev => ({...prev, url: e.target.value}))} placeholder="iCal Feed URL" className="h-8 text-sm mt-0.5" /></div>
                                <div>
                                <Label className="text-xs flex items-center mb-1.5 mt-1.5"><Palette size={14} className="mr-1.5 text-muted-foreground" /> Color</Label>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {predefinedCalendarColors.map(colorOption => (
                                    <button key={`edit-${feed.id}-${colorOption.value}`} type="button" title={colorOption.name}
                                        className={cn("w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1", currentIcalEditData.color === colorOption.value ? "border-foreground" : "border-transparent hover:border-muted-foreground/50")}
                                        style={{ backgroundColor: colorOption.value }} onClick={() => handleIcalFeedColorChange(feed.id, colorOption.value)} />
                                    ))}
                                    <Input type="text" placeholder="#HEX" value={currentIcalEditData.color} onChange={(e) => handleIcalFeedColorChange(feed.id, e.target.value)}
                                        className={cn("h-7 w-20 text-xs", currentIcalEditData.color && !isValidHexColor(currentIcalEditData.color) && currentIcalEditData.color !== '' ? "border-destructive focus-visible:ring-destructive" : "")} maxLength={7} />
                                </div>
                                </div>
                                <div className="mt-3 flex items-center justify-start gap-1">
                                <Button variant="default" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleSaveIcalFeedChanges} disabled={(currentIcalEditData.color !== '' && !isValidHexColor(currentIcalEditData.color)) || !currentIcalEditData.url.trim()}><Check className="w-3.5 h-3.5 mr-1" /> Save</Button>
                                <Button variant="outline" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleCancelEditIcalFeed}><XCircle className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
                                </div>
                            </div>
                            ) : (
                            <div className="flex flex-col">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-card-foreground truncate pr-2" title={feed.label} style={{color: isValidHexColor(feed.color) ? feed.color: 'inherit'}}>{feed.label}</span>
                                    <div className="flex-shrink-0">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEditIcalFeed(feed)}><Edit3 className="w-3.5 h-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleRemoveIcalFeed(feed.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground truncate mt-0.5" title={feed.url}><LinkIcon size={12} className="inline mr-1" />{feed.url}</span>
                            </div>
                            )}
                        </Card>
                        ))}
                    </div>
                    </ScrollArea>
                </div>
                )}
                 {isClient && icalFeeds.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No calendar feeds added yet.</p>}
            </div>


            {/* Existing Settings sections for other widgets */}
            <NewsWidget settingsOpen={true} displayMode="settingsOnly" />
            <AssetTrackerWidget settingsOpen={true} displayMode="settingsOnly" />
            <TaskListWidget settingsOpen={true} displayMode="settingsOnly" />
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
        <SortableContext items={dashboardWidgetsToRender.map(w => w.id)} strategy={rectSortingStrategy}>
          <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start auto-rows-min">
            {dashboardWidgetsToRender.map((widgetConfig) => {
                const { id, Component, props = {}, columnSpan = 'lg:col-span-1' } = widgetConfig;
                return (
                    <SortableWidgetItem key={id} id={id} isDragging={activeId === id} className={columnSpan}>
                    <Component {...props} />
                    </SortableWidgetItem>
                );
            })}
          </main>
        </SortableContext>
        <DragOverlay>
          {activeId && getWidgetConfigById(activeId) ? (
            <div className="opacity-75 shadow-2xl">
              {(() => {
                const activeWidgetConfig = getWidgetConfigById(activeId);
                if (activeWidgetConfig) {
                  const { Component, props = {} } = activeWidgetConfig;
                  // Ensure props for DragOverlay are minimal and serializable if needed by DND kit
                  // For calendar feeds, ensure the 'feed' prop is passed correctly
                  return <Component {...props} />;
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
