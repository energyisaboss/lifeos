
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SectionTitle } from './section-title';
import { CalendarDays, Settings, PlusCircle, Trash2, RefreshCw, LinkIcon, Palette, Edit3, XCircle, Save, GripVertical } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types'; // Renamed to avoid conflict
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { processIcalFeed, type IcalProcessorInput } from '@/ai/flows/ical-processor-flow';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '../ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";


interface IcalFeedItem {
  id: string;
  url: string;
  label: string;
  color: string;
}

const MAX_ICAL_FEEDS = 10;
const LOCALSTORAGE_KEY_ICAL_FEEDS = 'icalFeedsLifeOS_v2';

const predefinedNamedColors: { name: string; value: string }[] = [
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
  const [currentEditFeedUrl, setCurrentEditFeedUrl] = useState('');
  const [currentEditFeedLabel, setCurrentEditFeedLabel] = useState('');
  const [currentEditFeedColor, setCurrentEditFeedColor] = useState('');
  
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [newIcalLabel, setNewIcalLabel] = useState('');
  const [newIcalColor, setNewIcalColor] = useState(predefinedNamedColors[0].value);

  const feedListManagementRef = useRef<HTMLDivElement>(null);
  const [justAddedFeedId, setJustAddedFeedId] = useState<string | null>(null);
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);


  const fetchAndProcessEvents = useCallback(async () => {
    console.log('CalendarWidget: fetchAndProcessEvents called. Number of feeds to process:', icalFeeds.filter(f => f.url.trim()).length);
    const validFeeds = icalFeeds.filter(feed => (feed.url.trim().toLowerCase().startsWith('http') || feed.url.trim().toLowerCase().startsWith('webcal')) && (feed.url.trim().toLowerCase().endsWith('.ics') || feed.url.includes('format=ical')));
    
    if (validFeeds.length === 0 && isClientLoaded) {
      setAllEvents([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (validFeeds.length === 0 || !isClientLoaded) return;

    setIsLoading(true);
    setError(null);

    const results = await Promise.allSettled(
      validFeeds.map(feed => processIcalFeed({ icalUrl: feed.url, label: feed.label, color: feed.color }))
    );

    const fetchedEvents: AppCalendarEvent[] = [];
    let hasErrors = false;
    let errorMessages: string[] = [];

    results.forEach((result, index) => {
      const feed = validFeeds[index];
      if (result.status === 'fulfilled') {
        fetchedEvents.push(...result.value);
      } else {
        const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`Error fetching/processing iCal feed ${feed.label || feed.url}:`, errorMessage);
        if (!errorMessages.some(msg => msg.includes(feed.label || 'unlabeled feed'))) {
          errorMessages.push(`Failed to load ${feed.label || 'unlabeled feed'}: ${errorMessage.substring(0, 100)}...`);
        }
        hasErrors = true;
      }
    });

    if (hasErrors) {
      setError(errorMessages.join('; '));
      toast({
        title: "Error Loading Some Feeds",
        description: `Some iCalendar feeds could not be loaded: ${errorMessages.join('; ')}. Check console for details.`,
        variant: "destructive",
        duration: 7000,
      });
    }

    fetchedEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    setAllEvents(fetchedEvents);
    setIsLoading(false);
  }, [icalFeeds, isClientLoaded]); 

  useEffect(() => {
    console.log('CalendarWidget: Event fetching useEffect triggered. isClientLoaded:', isClientLoaded, 'icalFeeds length:', icalFeeds.length);
    if (isClientLoaded) { // Only fetch if client is loaded
        fetchAndProcessEvents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClientLoaded, icalFeeds, fetchAndProcessEvents]); // Removed refreshTrigger as direct dependency, now relies on icalFeeds changes

  useEffect(() => {
    setIsClientLoaded(true); 
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
          })).filter(item => typeof item.id === 'string' && typeof item.url === 'string' && typeof item.label === 'string' && typeof item.color === 'string');
        }
      } catch (e) {
        console.error("Failed to parse iCal feeds from localStorage", e);
        toast({ title: "Storage Error", description: "Could not load saved iCal feeds.", variant: "destructive" });
      }
    }
    setIcalFeeds(loadedFeeds);
  }, []);

  useEffect(() => {
    if (isClientLoaded) { 
      localStorage.setItem(LOCALSTORAGE_KEY_ICAL_FEEDS, JSON.stringify(icalFeeds));
    }
  }, [icalFeeds, isClientLoaded]);

  useEffect(() => {
    if (justAddedFeedId && feedListManagementRef.current) {
      const newFeedCard = feedListManagementRef.current.querySelector(`[data-feed-id="${justAddedFeedId}"]`);
      if (newFeedCard) {
        newFeedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      setJustAddedFeedId(null); 
    }
  }, [icalFeeds, justAddedFeedId]);


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
       toast({ title: "Invalid URL", description: "Please enter a valid iCalendar URL (ends with .ics or contains format=ical).", variant: "destructive" });
      return;
    }
    if (!isValidHexColor(newIcalColor)) {
      toast({ title: "Invalid Color", description: "Please select a valid hex color.", variant: "destructive" });
      return;
    }

    const newFeedId = `feed-${Date.now()}-${Math.random().toString(36).substring(2,9)}`;
    const newFeedItem: IcalFeedItem = {
      id: newFeedId,
      url: newIcalUrl.trim(),
      label: newIcalLabel.trim() || `Feed ${icalFeeds.length + 1}`,
      color: newIcalColor,
    };
    setIcalFeeds(prev => [...prev, newFeedItem]);
    setJustAddedFeedId(newFeedId); 
    setNewIcalUrl('');
    setNewIcalLabel('');
    setNewIcalColor(getNextFeedColor());
    toast({ title: "Feed Added", description: `"${newFeedItem.label}" added. Events refreshing.` });
  }, [icalFeeds, newIcalUrl, newIcalLabel, newIcalColor, setIcalFeeds]);

  const handleRemoveIcalFeed = useCallback((idToRemove: string) => {
    const feedLabel = icalFeeds.find(f => f.id === idToRemove)?.label || "Feed";
    setIcalFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    toast({ title: "Feed Removed", description: `"${feedLabel}" has been removed.` });
  }, [icalFeeds, setIcalFeeds]);
  
  const handleOpenEditDialog = useCallback((feedToEdit: IcalFeedItem) => {
    setEditingFeedId(feedToEdit.id);
    setCurrentEditFeedUrl(feedToEdit.url);
    setCurrentEditFeedLabel(feedToEdit.label);
    setCurrentEditFeedColor(feedToEdit.color);
  }, []);
  
  const handleCancelEditFeed = useCallback(() => {
    setEditingFeedId(null);
    setCurrentEditFeedUrl('');
    setCurrentEditFeedLabel('');
    setCurrentEditFeedColor('');
  }, []);

  const handleSaveChangesToFeed = useCallback(() => {
    if (!editingFeedId) return;

    const urlToSave = currentEditFeedUrl.trim();
    const labelToSave = currentEditFeedLabel.trim() || `Feed ${icalFeeds.findIndex(f => f.id === editingFeedId) + 1}`;
    const colorToSave = currentEditFeedColor;

    if (!urlToSave) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
     if (!urlToSave.toLowerCase().endsWith('.ics') && !urlToSave.toLowerCase().includes('format=ical') && !urlToSave.toLowerCase().startsWith('webcal://') && !urlToSave.toLowerCase().startsWith('http://') && !urlToSave.toLowerCase().startsWith('https://')) {
       toast({ title: "Invalid URL", description: "Please enter a valid iCalendar URL (ends with .ics or contains format=ical).", variant: "destructive" });
      return;
    }
    if (!isValidHexColor(colorToSave)) {
       toast({ title: "Invalid Color", description: "Please enter a valid hex color code.", variant: "destructive" });
      return;
    }

    setIcalFeeds(prevFeeds => 
      prevFeeds.map(f =>
        f.id === editingFeedId ? { ...f, url: urlToSave, label: labelToSave, color: colorToSave } : f
      )
    );
    toast({ title: "Feed Updated", description: `Feed "${labelToSave}" settings saved. Events refreshing.` });
    setEditingFeedId(null); 
  }, [editingFeedId, icalFeeds, currentEditFeedUrl, currentEditFeedLabel, currentEditFeedColor, setIcalFeeds]);

  const handleFeedColorChange = useCallback((feedId: string | null, color: string, isEditing: boolean) => {
    if (!isValidHexColor(color) && color !== '') {
      toast({ title: "Invalid Color", description: "Please enter a valid hex color code (e.g. #RRGGBB).", variant: "destructive", duration:3000 });
      // Don't set invalid color for direct change, but allow typing in edit mode
      if (!isEditing) return;
    }
    if (isEditing && feedId === editingFeedId) {
      setCurrentEditFeedColor(color);
    }
  }, [editingFeedId]);

  const getUpcomingEventsForFeed = useCallback((feed: IcalFeedItem): AppCalendarEvent[] => {
    if (!feed) return [];
    return allEvents
      .filter(event => event.calendarSource === feed.label && event.color?.toLowerCase() === feed.color?.toLowerCase())
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

  const renderSettings = () => (
    <div className="border-b pb-3 mb-3">
      <Card className="p-3 mb-3">
        <Label htmlFor="new-ical-label" className="text-xs font-medium">New Feed Label (Optional)</Label>
        <Input
          id="new-ical-label"
          type="text"
          placeholder="e.g., Work Calendar"
          value={newIcalLabel}
          onChange={(e) => setNewIcalLabel(e.target.value)}
          className="h-9 text-sm mt-1"
        />
        <Label htmlFor="new-ical-url" className="text-xs font-medium mt-2 block">iCal Feed URL*</Label>
        <Input
          id="new-ical-url"
          type="url"
          placeholder="https://example.com/feed.ics"
          value={newIcalUrl}
          onChange={(e) => setNewIcalUrl(e.target.value)}
          className="h-9 text-sm mt-1"
          required
        />
        <Label className="text-xs font-medium flex items-center mt-2 mb-1.5">
            <Palette size={14} className="mr-1.5 text-muted-foreground" /> New Feed Color
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
        {predefinedNamedColors.map(colorOption => (
            <button
            key={`new-${colorOption.value}`}
            type="button"
            title={colorOption.name}
            className={cn(
                "w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                newIcalColor === colorOption.value ? "border-foreground" : "border-transparent hover:border-muted-foreground/50"
            )}
            style={{ backgroundColor: colorOption.value }}
            onClick={() => setNewIcalColor(colorOption.value)}
            />
        ))}
        <Input
            type="text"
            placeholder="#HEX"
            value={newIcalColor}
            onChange={(e) => setNewIcalColor(e.target.value)}
            className={cn(
            "h-7 w-20 text-xs",
            newIcalColor && !isValidHexColor(newIcalColor) && newIcalColor !== '' ? "border-destructive focus-visible:ring-destructive" : ""
            )}
            maxLength={7}
        />
        </div>
        <Button
          size="sm"
          onClick={handleAddNewFeed}
          disabled={icalFeeds.length >= MAX_ICAL_FEEDS || !newIcalUrl.trim() || (newIcalColor !== '' && !isValidHexColor(newIcalColor))}
          className="w-full mt-3"
        >
          <PlusCircle className="w-4 h-4 mr-2" /> Add Feed ({icalFeeds.length}/{MAX_ICAL_FEEDS})
        </Button>
      </Card>

      {icalFeeds.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Active Feeds ({icalFeeds.length}/{MAX_ICAL_FEEDS})</h4>
          <ScrollArea className="h-[240px] pr-1 calendar-feed-scroll-area" ref={feedListManagementRef}>
            <div className="space-y-3">
              {icalFeeds.map((feed) => (
                <Card key={feed.id} data-feed-id={feed.id} className="p-2.5 shadow-sm border">
                   {editingFeedId === feed.id ? (
                      <div className="space-y-2">
                          <div>
                              <Label htmlFor={`edit-label-${feed.id}`} className="text-xs">Label</Label>
                              <Input id={`edit-label-${feed.id}`} value={currentEditFeedLabel} onChange={(e) => setCurrentEditFeedLabel(e.target.value)} placeholder="e.g., Work Calendar" className="h-8 text-sm mt-0.5"/>
                          </div>
                          <div>
                              <Label htmlFor={`edit-url-${feed.id}`} className="text-xs">URL</Label>
                              <Input id={`edit-url-${feed.id}`} type="url" value={currentEditFeedUrl} onChange={(e) => setCurrentEditFeedUrl(e.target.value)} placeholder="iCal feed URL" className="h-8 text-sm mt-0.5"/>
                          </div>
                          <div>
                              <Label className="text-xs flex items-center mb-1.5 mt-1.5">
                                  <Palette size={14} className="mr-1.5 text-muted-foreground" /> Feed Color
                              </Label>
                              <div className="flex flex-wrap items-center gap-1.5">
                              {predefinedNamedColors.map(colorOption => (
                                  <button
                                  key={`edit-${feed.id}-${colorOption.value}`}
                                  type="button"
                                  title={colorOption.name}
                                  className={cn(
                                      "w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                      currentEditFeedColor === colorOption.value ? "border-foreground" : "border-transparent hover:border-muted-foreground/50"
                                  )}
                                  style={{ backgroundColor: colorOption.value }}
                                  onClick={() => handleFeedColorChange(feed.id, colorOption.value, true)}
                                  />
                              ))}
                              <Input
                                  type="text"
                                  placeholder="#HEX"
                                  value={currentEditFeedColor}
                                  onChange={(e) => handleFeedColorChange(feed.id, e.target.value, true)}
                                  className={cn(
                                  "h-7 w-20 text-xs",
                                  currentEditFeedColor && !isValidHexColor(currentEditFeedColor) && currentEditFeedColor !== '' ? "border-destructive focus-visible:ring-destructive" : ""
                                  )}
                                  maxLength={7}
                              />
                              </div>
                              {!isValidHexColor(currentEditFeedColor) && currentEditFeedColor !== '' && (
                                  <p className="text-xs text-destructive mt-1">Invalid hex color code.</p>
                              )}
                          </div>
                          <div className="mt-2 flex items-center justify-start gap-1">
                              <Button variant="default" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleSaveChangesToFeed} disabled={(currentEditFeedColor !== '' && !isValidHexColor(currentEditFeedColor)) || !currentEditFeedUrl.trim()}>
                                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleCancelEditFeed}>
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                              </Button>
                          </div>
                      </div>
                   ) : (
                      <div className="flex flex-col">
                         <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-card-foreground truncate" title={feed.label}>{feed.label}</p>
                              </div>
                          </div>
                           <div className="mt-2 flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEditDialog(feed)} aria-label="Edit feed">
                              <Edit3 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleRemoveIcalFeed(feed.id)} aria-label="Delete feed">
                              <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                          </div>
                      </div>
                   )}
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
      {icalFeeds.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground text-center py-2">No feeds added yet. Add one above.</p>
      )}
    </div>
  );

  const renderWidgetDisplay = () => (
    <>
      {isClientLoaded && !isLoading && error && <div className="p-4 border rounded-md bg-destructive/10 text-destructive mb-4"><p className="text-sm p-2 py-2">{error}</p></div>}

      {isClientLoaded && !isLoading && !error && icalFeeds.filter(f=>f.url.trim()).length === 0 && (
          <Card className="mb-6 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events. Add or enable an iCal feed via global settings.</p>
            </CardContent>
          </Card>
      )}

      {isClientLoaded && icalFeeds.filter(f => f.url.trim()).length > 0 && (
        <>
          {icalFeeds.map(feed => {
            if (!feed.url.trim()) return null; 
            const eventsForThisFeed = getUpcomingEventsForFeed(feed);
            const feedColor = (feed.color && isValidHexColor(feed.color)) ? feed.color : 'hsl(var(--border))';

            // Don't render the card if loading events for this feed and it has no events yet, or if there are no events and no loading.
            if ((isLoading && !eventsForThisFeed.length) && !error) {
                // Optionally, show a per-feed skeleton or loading indicator here
                return (
                     <Card key={feed.id} className="shadow-md mb-4" style={{borderTop: `4px solid ${feedColor}`}}>
                        <CardHeader className="p-3">
                            <CardTitle className="text-lg flex items-center">
                                <CalendarDays className="w-5 h-5 mr-2" style={{ color: feedColor }} />
                                {feed.label}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="py-0 px-4 pb-3 flex flex-col flex-1">
                           <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
                        </CardContent>
                    </Card>
                );
            }
            if (!isLoading && !eventsForThisFeed.length && !error) {
                 return null; // Don't show empty feed cards after initial load
            }


            return (
              <Card key={feed.id} className="shadow-md mb-4" style={{borderTop: `4px solid ${feedColor}`}}>
                <CardHeader className="p-3">
                  <CardTitle className="text-lg flex items-center">
                      <CalendarDays className="w-5 h-5 mr-2" style={{ color: feedColor }} />
                      {feed.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 px-4 pb-3 flex flex-col flex-1">
                  {eventsForThisFeed.length > 0 ? (
                    <ScrollArea className="flex-1 pr-2 py-2 max-h-60">
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
                    !isLoading && <p className="text-sm text-muted-foreground py-4 text-center">
                      No upcoming events for this feed.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </>
  );

  const renderMainContent = () => (
    <>
      <div className="p-4 border-b flex justify-between items-center">
        <SectionTitle icon={CalendarDays} title="Upcoming Events" className="mb-0 text-lg" />
      </div>
      
      {settingsOpen && (
        <div className="p-3 border-b bg-muted/20">
          {renderSettings()}
        </div>
      )}

      <div className="p-4 space-y-4">
        {!isClientLoaded && (
          Array.from({ length: 1 }).map((_, i) => (
            <Card key={`skel-cat-outer-${i}`} className="shadow-md" style={{borderTop: `4px solid hsl(var(--muted))`}}>
              <CardHeader className="p-3"> <Skeleton className="h-5 w-1/2" /> </CardHeader>
              <CardContent className="px-3 py-0 pb-3">
                <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
              </CardContent>
            </Card>
          ))
        )}
        {isClientLoaded && renderWidgetDisplay()}
      </div>
    </>
  );

  if (displayMode === 'settingsOnly') {
    return settingsOpen ? renderSettings() : null;
  }
  // For widgetOnly or default displayMode
  return renderMainContent();
}
