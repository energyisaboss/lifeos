
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SectionTitle } from './section-title';
import { CalendarDays, Settings, PlusCircle, Trash2, RefreshCw, LinkIcon, Palette, Check, Edit3, XCircle, Settings2, Save } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { processIcalFeed } from '@/ai/flows/ical-processor-flow';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '../ui/separator';

const MAX_ICAL_FEEDS = 10;
const LOCALSTORAGE_KEY_ICAL_FEEDS = 'icalFeedsLifeOS_v2';

interface IcalFeedItem {
  id: string;
  url: string;
  label: string;
  color: string;
}

const predefinedNamedColors: { name: string, value: string }[] = [
  { name: 'Red', value: '#F44336' },
  { name: 'Blue', value: '#2196F3' },
  { name: 'Orange', value: '#FF9800' },
  { name: 'Yellow', value: '#FFEB3B' },
  { name: 'Green', value: '#4CAF50' },
  { name: 'Purple', value: '#9C27B0' },
];
let lastAssignedColorIndex = -1;

const getNextFeedColor = (): string => {
  lastAssignedColorIndex = (lastAssignedColorIndex + 1) % predefinedNamedColors.length;
  return predefinedNamedColors[lastAssignedColorIndex].value;
};

const isValidHexColor = (color: string) => {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

interface CalendarWidgetProps {
  settingsOpen: boolean;
  displayMode?: 'widgetOnly' | 'settingsOnly';
}

export function CalendarWidget({ settingsOpen, displayMode = 'widgetOnly' }: CalendarWidgetProps) {
  const [icalFeeds, setIcalFeeds] = useState<IcalFeedItem[]>([]);
  const [allEvents, setAllEvents] = useState<AppCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editFeedUrl, setEditFeedUrl] = useState('');
  const [editFeedLabel, setEditFeedLabel] = useState('');
  const [editFeedColor, setEditFeedColor] = useState('');

  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [newIcalLabel, setNewIcalLabel] = useState('');

  const feedListManagementRef = useRef<HTMLDivElement>(null);
  const [justAddedFeedId, setJustAddedFeedId] = useState<string | null>(null);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedFeedsString = localStorage.getItem(LOCALSTORAGE_KEY_ICAL_FEEDS);
      let loadedFeeds: IcalFeedItem[] = [];
      if (savedFeedsString) {
        try {
          const parsed = JSON.parse(savedFeedsString);
          if (Array.isArray(parsed)) {
            loadedFeeds = parsed.map((item: any, index: number) => ({
              id: item.id || `feed-${Date.now()}-${Math.random().toString(36).substring(2,9)}`,
              url: item.url || '',
              label: item.label || `Feed ${index + 1}`,
              color: (item.color && isValidHexColor(item.color)) ? item.color : getNextFeedColor(),
            })).filter(item => typeof item.url === 'string' && typeof item.label === 'string' && typeof item.color === 'string');
          }
        } catch (e) {
          console.error("Failed to parse iCal feeds from localStorage", e);
          toast({ title: "Storage Error", description: "Could not load saved iCal feeds.", variant: "destructive" });
        }
      }
      setIcalFeeds(loadedFeeds);
      setIsClientLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isClientLoaded && typeof window !== 'undefined') {
      localStorage.setItem(LOCALSTORAGE_KEY_ICAL_FEEDS, JSON.stringify(icalFeeds));
    }
  }, [icalFeeds, isClientLoaded]);

  useEffect(() => {
    if (justAddedFeedId && feedListManagementRef.current) {
      const newFeedCard = feedListManagementRef.current.querySelector(`[data-feed-id="${justAddedFeedId}"]`);
      if (newFeedCard) {
        newFeedCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      setJustAddedFeedId(null);
    }
  }, [icalFeeds, justAddedFeedId]);

  const fetchAndProcessEvents = useCallback(async () => {
    const validFeeds = icalFeeds.filter(feed => (feed.url.trim().toLowerCase().startsWith('http') || feed.url.trim().toLowerCase().startsWith('webcal')) && (feed.url.trim().toLowerCase().endsWith('.ics') || feed.url.includes('format=ical')));
    if (validFeeds.length === 0 && isClientLoaded) {
      setAllEvents([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (validFeeds.length === 0) return;

    setIsLoading(true);
    setError(null);

    const results = await Promise.allSettled(
      validFeeds.map(feed => processIcalFeed({ icalUrl: feed.url, label: feed.label, color: feed.color }))
    );

    const fetchedEvents: AppCalendarEvent[] = [];
    let hasErrors = false;
    results.forEach((result, index) => {
      const feed = validFeeds[index];
      if (result.status === 'fulfilled') {
        fetchedEvents.push(...result.value.map(event => ({
            ...event,
            startTime: new Date(event.startTime),
            endTime: new Date(event.endTime),
        })));
      } else {
        console.error(`Error fetching/processing iCal feed ${feed.label} (${feed.url}):`, result.reason);
        setError(prevError => {
          const newErrorMessage = `Failed to load ${feed.label || 'unlabeled feed'}`;
          return prevError ? `${prevError}, ${newErrorMessage}` : newErrorMessage;
        });
        hasErrors = true;
      }
    });

    if (hasErrors && typeof window !== 'undefined') {
      toast({
        title: "Error Loading Some Feeds",
        description: "Some iCalendar feeds could not be loaded. Please check settings.",
        variant: "destructive",
      });
    }

    fetchedEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    setAllEvents(fetchedEvents);
    setIsLoading(false);
  }, [icalFeeds, isClientLoaded]);

  useEffect(() => {
    if (isClientLoaded && icalFeeds.length > 0) {
        fetchAndProcessEvents();
    } else if (isClientLoaded && icalFeeds.length === 0) {
        setAllEvents([]);
        setIsLoading(false);
        setError(null);
    }
  }, [icalFeeds, isClientLoaded, fetchAndProcessEvents]);

  const handleAddNewFeed = useCallback(() => {
    if (icalFeeds.length >= MAX_ICAL_FEEDS) {
      toast({ title: "Feed Limit Reached", description: `Max ${MAX_ICAL_FEEDS} iCalendar feeds.`, variant: "destructive" });
      return;
    }
     if (!newIcalUrl.trim()) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
    if (!newIcalUrl.toLowerCase().endsWith('.ics') && !newIcalUrl.toLowerCase().includes('format=ical') && !newIcalUrl.toLowerCase().startsWith('webcal://') && !newIcalUrl.toLowerCase().startsWith('http://') && !newIcalUrl.toLowerCase().startsWith('https://')) {
       toast({ title: "Invalid URL", description: "Please enter a valid iCalendar URL.", variant: "destructive" });
      return;
    }

    const newFeedId = `feed-${Date.now()}-${Math.random().toString(36).substring(2,9)}`;
    const defaultColor = getNextFeedColor();
    const newFeed: IcalFeedItem = {
      id: newFeedId,
      url: newIcalUrl.trim(),
      label: newIcalLabel.trim() || `Feed ${icalFeeds.length + 1}`,
      color: defaultColor,
    };
    setIcalFeeds(prev => [...prev, newFeed]);
    setJustAddedFeedId(newFeedId);
    setNewIcalUrl('');
    setNewIcalLabel('');
    toast({ title: "Feed Added", description: `"${newFeed.label}" added. Events refreshing.` });
  }, [icalFeeds, newIcalUrl, newIcalLabel]);

  const handleRemoveIcalFeed = useCallback((idToRemove: string) => {
    const feedLabel = icalFeeds.find(f => f.id === idToRemove)?.label || "Feed";
    setIcalFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    toast({ title: "Feed Removed", description: `"${feedLabel}" has been removed.` });
  }, [icalFeeds]);

  const getUpcomingEventsForFeed = useCallback((feed: IcalFeedItem): AppCalendarEvent[] => {
    if (!feed) return [];
    return allEvents
      .filter(event => event.calendarSource === feed.label && event.color.toLowerCase() === feed.color.toLowerCase())
      .filter(event => new Date(event.endTime) >= new Date(new Date().setHours(0,0,0,0)))
      .slice(0, 15);
  }, [allEvents]);

  const formatEventTime = (event: AppCalendarEvent) => {
    const startTime = new Date(event.startTime);
    const endTime = new Date(event.endTime);
    if (event.isAllDay) return "All Day";
    const start = format(startTime, 'p');
    if (!endTime || endTime.getTime() === startTime.getTime() ||
        (format(endTime, 'p') === start && startTime.toDateString() === endTime.toDateString())) {
      return start;
    }
    const end = format(endTime, 'p');
    return `${start} - ${end}`;
  };

  const formatEventDate = (event: AppCalendarEvent) => {
    return format(new Date(event.startTime), 'EEE, MMM d');
  }

  const handleStartEditFeed = useCallback((feed: IcalFeedItem) => {
    setEditingFeedId(feed.id);
    setEditFeedUrl(feed.url);
    setEditFeedLabel(feed.label);
    setEditFeedColor(feed.color);
  }, []);

  const handleCancelEditFeed = useCallback(() => {
    setEditingFeedId(null);
    setEditFeedUrl('');
    setEditFeedLabel('');
    setEditFeedColor('');
  }, []);

  const handleSaveChangesToFeed = useCallback(() => {
    if (!editingFeedId) return;

    if (!editFeedUrl.trim()) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
    if (!editFeedUrl.toLowerCase().endsWith('.ics') && !editFeedUrl.toLowerCase().includes('format=ical') && !editFeedUrl.toLowerCase().startsWith('webcal://') && !editFeedUrl.toLowerCase().startsWith('http://') && !editFeedUrl.toLowerCase().startsWith('https://')) {
       toast({ title: "Invalid URL", description: "Please enter a valid iCalendar URL.", variant: "destructive" });
      return;
    }
    if (!isValidHexColor(editFeedColor)) {
       toast({ title: "Invalid Color", description: "Please enter a valid hex color code.", variant: "destructive" });
      return;
    }

    setIcalFeeds(prevFeeds => prevFeeds.map(f =>
      f.id === editingFeedId ? { ...f, url: editFeedUrl.trim(), label: editFeedLabel.trim() || `Feed ${prevFeeds.findIndex(pf => pf.id === f.id) + 1}`, color: editFeedColor } : f
    ));
    toast({ title: "Feed Updated", description: `Feed "${editFeedLabel || editFeedUrl}" settings saved. Events refreshing.` });
    handleCancelEditFeed(); // Clear editing state
    fetchAndProcessEvents();
  }, [editingFeedId, editFeedUrl, editFeedLabel, editFeedColor, handleCancelEditFeed, fetchAndProcessEvents, icalFeeds]);


  const renderSettings = () => (
    <div className="border rounded-lg p-3 bg-muted/10 shadow-sm">
      <CardHeader className="p-1 pb-3">
        <CardTitle className="text-lg">Calendar Settings</CardTitle>
      </CardHeader>
      <CardContent className="p-1 space-y-4">
        <div>
          <Label htmlFor="new-ical-label" className="text-xs">Feed Label (Optional)</Label>
          <Input
            id="new-ical-label"
            type="text"
            placeholder="e.g., Work Calendar"
            value={newIcalLabel}
            onChange={(e) => setNewIcalLabel(e.target.value)}
            className="h-9 text-sm mt-1"
          />
        </div>
        <div>
          <Label htmlFor="new-ical-url" className="text-xs">iCal Feed URL*</Label>
          <Input
            id="new-ical-url"
            type="url"
            placeholder="https://example.com/feed.ics"
            value={newIcalUrl}
            onChange={(e) => setNewIcalUrl(e.target.value)}
            className="h-9 text-sm mt-1"
            required
          />
        </div>
        <Button
          size="sm"
          onClick={handleAddNewFeed}
          disabled={icalFeeds.length >= MAX_ICAL_FEEDS || !newIcalUrl.trim()}
          className="w-full"
        >
          <PlusCircle className="w-4 h-4 mr-2" /> Add Feed ({icalFeeds.length}/{MAX_ICAL_FEEDS})
        </Button>

        {icalFeeds.length > 0 && <Separator className="my-3"/>}

        {icalFeeds.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Active Feeds</h4>
            <ScrollArea className="max-h-[240px] pr-1 calendar-feed-scroll-area" ref={feedListManagementRef}>
              <div className="space-y-3">
                {icalFeeds.map((feed) => (
                  <div key={feed.id} data-feed-id={feed.id} className="p-2.5 rounded-md bg-background/70 shadow-sm border flex flex-col">
                     {editingFeedId === feed.id ? (
                        // Inline Edit Form
                        <div className="space-y-2">
                            <div>
                                <Label htmlFor={`edit-label-${feed.id}`} className="text-xs">Label</Label>
                                <Input id={`edit-label-${feed.id}`} value={editFeedLabel} onChange={(e) => setEditFeedLabel(e.target.value)} placeholder="e.g., Work Calendar" className="h-8 text-sm mt-0.5"/>
                            </div>
                            <div>
                                <Label htmlFor={`edit-url-${feed.id}`} className="text-xs">URL</Label>
                                <Input id={`edit-url-${feed.id}`} type="url" value={editFeedUrl} onChange={(e) => setEditFeedUrl(e.target.value)} placeholder="iCal feed URL" className="h-8 text-sm mt-0.5"/>
                            </div>
                            <div>
                                <Label className="text-xs flex items-center mb-1.5">
                                    <Palette size={14} className="mr-1.5 text-muted-foreground" /> Feed Color
                                </Label>
                                <div className="flex flex-wrap items-center gap-1.5">
                                {predefinedNamedColors.map(colorOption => (
                                    <button
                                    key={colorOption.value}
                                    type="button"
                                    title={colorOption.name}
                                    className={cn(
                                        "w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                        editFeedColor === colorOption.value ? "border-foreground" : "border-transparent hover:border-muted-foreground/50"
                                    )}
                                    style={{ backgroundColor: colorOption.value }}
                                    onClick={() => setEditFeedColor(colorOption.value)}
                                    />
                                ))}
                                <Input
                                    type="text"
                                    placeholder="#HEX"
                                    value={editFeedColor}
                                    onChange={(e) => setEditFeedColor(e.target.value)}
                                    className={cn(
                                    "h-7 w-20 text-xs",
                                    editFeedColor && !isValidHexColor(editFeedColor) && editFeedColor !== '' ? "border-destructive focus-visible:ring-destructive" : ""
                                    )}
                                    maxLength={7}
                                />
                                </div>
                                {!isValidHexColor(editFeedColor) && editFeedColor !== '' && (
                                    <p className="text-xs text-destructive mt-1">Invalid hex color code.</p>
                                )}
                            </div>
                            <div className="mt-2 flex items-center justify-start gap-2">
                                <Button variant="default" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleSaveChangesToFeed} disabled={editFeedColor !== '' && !isValidHexColor(editFeedColor)}>
                                    <Save className="w-3.5 h-3.5 mr-1" /> Save
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleCancelEditFeed}>
                                    <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                                </Button>
                            </div>
                        </div>
                     ) : (
                        // Display View
                        <>
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-card-foreground truncate" title={feed.label}>{feed.label}</p>
                                    <div className="flex items-center text-xs text-muted-foreground">
                                        <LinkIcon size={12} className="mr-1 flex-shrink-0" style={{color: feed.color}}/>
                                        <span className="truncate" title={feed.url}>{feed.url}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2">
                                <Label className="text-xs flex items-center mb-1.5">
                                <Palette size={14} className="mr-1.5 text-muted-foreground" /> Feed Color
                                </Label>
                                <div className="flex flex-wrap items-center gap-1.5">
                                {predefinedNamedColors.map(colorOption => (
                                    <button
                                    key={colorOption.value}
                                    type="button"
                                    title={colorOption.name}
                                    className={cn(
                                        "w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                        feed.color === colorOption.value ? "border-foreground" : "border-transparent hover:border-muted-foreground/50"
                                    )}
                                    style={{ backgroundColor: colorOption.value }}
                                    onClick={() => { /* Color change directly updates state and localStorage when not in edit mode */
                                        setIcalFeeds(prev => prev.map(f => f.id === feed.id ? {...f, color: colorOption.value} : f));
                                        toast({title: "Color Updated", description: `Color for "${feed.label}" changed.`});
                                    }}
                                    />
                                ))}
                                <Input
                                    type="text"
                                    placeholder="#HEX"
                                    value={feed.color}
                                    onChange={(e) => {
                                        const newColor = e.target.value;
                                        if (newColor === '' || isValidHexColor(newColor)) {
                                            setIcalFeeds(prev => prev.map(f => f.id === feed.id ? {...f, color: newColor} : f));
                                            if (isValidHexColor(newColor)) toast({title: "Color Updated", description: `Color for "${feed.label}" changed.`});
                                        } else {
                                            toast({ title: "Invalid Color", description: "Please enter a valid hex color code.", variant: "destructive", duration:3000 });
                                        }
                                    }}
                                    className={cn(
                                        "h-7 w-20 text-xs",
                                        feed.color && !isValidHexColor(feed.color) && feed.color !== '' ? "border-destructive focus-visible:ring-destructive" : ""
                                    )}
                                    maxLength={7}
                                />
                                </div>
                                {!isValidHexColor(feed.color) && feed.color !== '' && (
                                    <p className="text-xs text-destructive mt-1">Invalid hex color code.</p>
                                )}
                            </div>
                            <div className="mt-2 flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEditFeed(feed)} aria-label="Edit feed">
                                <Edit3 className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleRemoveIcalFeed(feed.id)} aria-label="Delete feed">
                                <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </>
                     )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
        {icalFeeds.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground text-center py-2">No feeds added yet. Add one above.</p>
        )}
      </CardContent>
    </div>
  );


  if (displayMode === 'settingsOnly') {
    return settingsOpen ? renderSettings() : null;
  }

  if (!isClientLoaded && displayMode === 'widgetOnly') {
    return (
      <>
        <div className="flex justify-between items-center border-b pb-2 mb-2">
            <SectionTitle icon={CalendarDays} title="Upcoming Events" className="mb-0 text-lg"/>
        </div>
        {/* Simplified skeleton for widgetOnly initial load */}
        <Card className="shadow-md mb-4"><CardHeader className="p-3"><Skeleton className="h-5 w-1/2" /></CardHeader><CardContent className="px-3 py-0 pb-3"><div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div></CardContent></Card>
      </>
    );
  }

  // Main Widget Display
  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <SectionTitle icon={CalendarDays} title="Upcoming Events" className="mb-0 text-lg" />
      </div>

      {settingsOpen && displayMode === 'widgetOnly' && ( /* This condition might be redundant if settings are global */
         renderSettings()
      )}

      {isLoading && isClientLoaded && icalFeeds.filter(f => f.url.trim()).length > 0 && (
        Array.from({ length: Math.min(2, icalFeeds.filter(f => f.url.trim()).length || 1) }).map((_, i) => (
          <Card key={`skel-cat-${i}`} className="shadow-md mb-4" style={{borderTop: `4px solid hsl(var(--muted))`}}>
            <CardHeader className="p-3"> <Skeleton className="h-5 w-1/2" /> </CardHeader>
            <CardContent className="px-3 py-0 pb-3">
              <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
            </CardContent>
          </Card>
        ))
      )}

      {!isLoading && error && isClientLoaded && <div className="p-4 border rounded-md bg-destructive/10 text-destructive mb-4"><p className="text-sm p-2 py-2">{error}</p></div>}

      {!isLoading && !error && isClientLoaded && icalFeeds.filter(f => f.url.trim()).length === 0 && (
          <p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events. Add an iCal feed via global settings.</p>
      )}

      {!isLoading && !error && isClientLoaded && (
        icalFeeds.map(feed => {
          if (!feed.url.trim()) return null;
          const eventsForThisFeed = getUpcomingEventsForFeed(feed);

          if (!isLoading && !error && eventsForThisFeed.length === 0 && !icalFeeds.some(f => f.id === feed.id && f.url.trim())) return null;

          const feedColor = (feed.color && isValidHexColor(feed.color)) ? feed.color : 'hsl(var(--border))';

          return (
            <Card key={feed.id} className="shadow-md mb-4" style={{borderTop: `4px solid ${feedColor}`}}>
              <CardHeader className="p-3">
                <CardTitle className="text-lg flex items-center">
                   <CalendarDays className="w-5 h-5 mr-2" style={{ color: feedColor }} />
                  {feed.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-3 pb-3 flex flex-col flex-1">
                {isLoading && !allEvents.some(e => e.calendarSource === feed.label && e.color === feed.color) ? (
                     <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
                ) : eventsForThisFeed.length > 0 ? (
                  <ScrollArea className="flex-1 pr-2 py-2"> {/* Ensure ScrollArea can grow */}
                    <ul className="space-y-3">
                      {eventsForThisFeed.map((event) => (
                        <li key={event.id} className="flex items-start space-x-3 pb-2 border-b border-border last:border-b-0">
                           <div className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full" style={{ backgroundColor: event.color }} />
                          <div>
                            <p className="font-medium text-card-foreground">{event.title}</p>
                            <p className="text-xs text-muted-foreground">{formatEventDate(event)} - {formatEventTime(event)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No upcoming events for this feed.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
       {!isLoading && !error && isClientLoaded && icalFeeds.filter(f=>f.url.trim()).length > 0 && allEvents.length === 0 && (
        <p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events from any active feeds for the next 30 days, or feeds might need updating/checking.</p>
      )}
    </>
  );
}
