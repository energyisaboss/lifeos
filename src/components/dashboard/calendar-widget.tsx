
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarDays, Settings, PlusCircle, Trash2, LinkIcon, Palette, Edit3, Check, XCircle, Loader2, RefreshCw } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types';
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
  
  const [editingFeed, setEditingFeed] = useState<IcalFeedItem | null>(null);
  const [currentEditFeedUrl, setCurrentEditFeedUrl] = useState('');
  const [currentEditFeedLabel, setCurrentEditFeedLabel] = useState('');
  const [currentEditFeedColor, setCurrentEditFeedColor] = useState('');
  
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [newIcalLabel, setNewIcalLabel] = useState('');

  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const feedListManagementRef = useRef<HTMLDivElement>(null);
  const [justAddedFeedId, setJustAddedFeedId] = useState<string | null>(null);

  const fetchAndProcessEvents = useCallback(async () => {
    console.log("CalendarWidget: fetchAndProcessEvents called. isClientLoaded:", isClientLoaded, 'Number of feeds:', icalFeeds.length, 'Dependencies: icalFeeds');
    if (!isClientLoaded || icalFeeds.length === 0) {
      setAllEvents([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const validFeeds = icalFeeds.filter(feed => (feed.url.trim().toLowerCase().startsWith('http') || feed.url.trim().toLowerCase().startsWith('webcal')) && (feed.url.trim().toLowerCase().endsWith('.ics') || feed.url.includes('format=ical')));

    if (validFeeds.length === 0) {
      setAllEvents([]);
      setIsLoading(false);
      setError(null);
      console.log('CalendarWidget: No valid feeds to process.');
      return;
    }

    setIsLoading(true);
    setError(null);
    console.log(`CalendarWidget: Processing ${validFeeds.length} valid feeds.`);

    const results = await Promise.allSettled(
      validFeeds.map(feed => {
        const input: IcalProcessorInput = {
            icalUrl: feed.url,
            label: feed.label,
            color: (feed.color && isValidHexColor(feed.color)) ? feed.color : getNextFeedColor()
        };
        return processIcalFeed(input);
      })
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
    console.log('CalendarWidget: Event fetching and processing complete. Total events:', fetchedEvents.length);
  }, [isClientLoaded, icalFeeds]);


  useEffect(() => {
    if (isClientLoaded) {
        console.log("CalendarWidget: Event fetching useEffect triggered by isClientLoaded, icalFeeds, or refreshTrigger. Refresh trigger:", refreshTrigger);
        fetchAndProcessEvents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClientLoaded, icalFeeds, fetchAndProcessEvents, refreshTrigger]);


  useEffect(() => {
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
    setIsClientLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        newFeedCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

    const newFeedId = `feed-${Date.now()}-${Math.random().toString(36).substring(2,9)}`;
    const newFeedItem: IcalFeedItem = {
      id: newFeedId,
      url: newIcalUrl.trim(),
      label: newIcalLabel.trim() || `Feed ${icalFeeds.length + 1}`,
      color: getNextFeedColor(),
    };
    setIcalFeeds(prev => [...prev, newFeedItem]);
    setJustAddedFeedId(newFeedId);
    setNewIcalUrl('');
    setNewIcalLabel('');
    toast({ title: "Feed Added", description: `"${newFeedItem.label}" added.` });
    // setRefreshTrigger(prev => prev + 1); // Removed as icalFeeds dependency in useEffect will trigger
  }, [icalFeeds, newIcalUrl, newIcalLabel]);

  const handleRemoveIcalFeed = useCallback((idToRemove: string) => {
    const feedLabel = icalFeeds.find(f => f.id === idToRemove)?.label || "Feed";
    setIcalFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    toast({ title: "Feed Removed", description: `"${feedLabel}" has been removed.` });
    // setRefreshTrigger(prev => prev + 1); // Removed
  }, [icalFeeds]);

  const handleOpenEditDialog = useCallback((feedToEdit: IcalFeedItem) => {
    setEditingFeed(feedToEdit);
    setCurrentEditFeedLabel(feedToEdit.label);
    setCurrentEditFeedUrl(feedToEdit.url);
    setCurrentEditFeedColor(feedToEdit.color);
  }, []);

  const handleCloseEditDialog = useCallback(() => {
    setEditingFeed(null);
    setCurrentEditFeedLabel('');
    setCurrentEditFeedUrl('');
    setCurrentEditFeedColor('');
  }, []);

  const handleSaveChangesToFeed = useCallback(() => {
    if (!editingFeed) return;

    const urlToSave = currentEditFeedUrl.trim();
    const labelToSave = currentEditFeedLabel.trim() || `Feed ${icalFeeds.findIndex(f => f.id === editingFeed.id) + 1}`;
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
        f.id === editingFeed.id ? { ...f, url: urlToSave, label: labelToSave, color: colorToSave } : f
      )
    );
    toast({ title: "Feed Updated", description: `Feed "${labelToSave}" settings saved.` });
    handleCloseEditDialog();
    // setRefreshTrigger(prev => prev + 1); // Removed
  }, [editingFeed, icalFeeds, currentEditFeedUrl, currentEditFeedLabel, currentEditFeedColor, handleCloseEditDialog]);

  const handleFeedColorChange = useCallback((feedId: string, newColor: string) => {
     if (newColor !== '' && !isValidHexColor(newColor)) {
         toast({ title: "Invalid Color", description: "Please enter a valid hex color code (e.g. #RRGGBB).", variant: "destructive", duration:3000 });
     }
    
    // For inline editing, update currentEditFeedColor directly
    if(editingFeed && editingFeed.id === feedId){
      setCurrentEditFeedColor(newColor);
    } else {
      // For direct click in settings list (if applicable later)
      setIcalFeeds(prevFeeds =>
        prevFeeds.map(f =>
          f.id === feedId ? { ...f, color: newColor } : f
        )
      );
      // setRefreshTrigger(prev => prev + 1); // Removed
    }
  }, [editingFeed]);


  const getUpcomingEventsForFeed = useCallback((feed: IcalFeedItem): AppCalendarEvent[] => {
    if (!feed || !isClientLoaded) return []; 
    return allEvents
      .filter(event => {
        const urlMatch = event.id.startsWith(feed.url);
        const labelMatch = event.calendarSource === feed.label;
        const colorMatch = event.color === feed.color;
        return urlMatch && labelMatch && colorMatch;
      })
      .filter(event => new Date(event.endTime) >= new Date(new Date().setHours(0,0,0,0)));
  }, [allEvents, isClientLoaded]);

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

  const renderSettingsContent = () => (
     <div className="p-3 border rounded-lg bg-muted/20 shadow-sm">
        <CardContent className="p-1 space-y-4">
            <Card className="p-3 bg-muted/30 rounded-md">
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
                <Button
                    size="sm"
                    onClick={handleAddNewFeed}
                    disabled={icalFeeds.length >= MAX_ICAL_FEEDS || !newIcalUrl.trim()}
                    className="w-full mt-3"
                >
                    <PlusCircle className="w-4 h-4 mr-2" /> Add Feed ({icalFeeds.length}/{MAX_ICAL_FEEDS})
                </Button>
            </Card>

            {isClientLoaded && icalFeeds.length > 0 && (
            <div className="mt-3">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Active Feeds ({icalFeeds.length}/{MAX_ICAL_FEEDS})</h4>
                <ScrollArea className="h-[240px] pr-1 custom-styled-scroll-area overflow-y-auto" ref={feedListManagementRef}>
                <div className="space-y-3">
                    {icalFeeds.map((feed) => (
                    <Card key={feed.id} data-feed-id={feed.id} className="p-2.5 shadow-sm border bg-background">
                        {editingFeed && editingFeed.id === feed.id ? (
                        // Inline Edit Form
                        <div className="space-y-2">
                            <div>
                                <Label htmlFor={`edit-label-${feed.id}`} className="text-xs">Label</Label>
                                <Input id={`edit-label-${feed.id}`} value={currentEditFeedLabel} onChange={(e) => setCurrentEditFeedLabel(e.target.value)} placeholder="e.g., Work Calendar" className="h-8 text-sm mt-0.5" />
                            </div>
                            <div>
                                <Label htmlFor={`edit-url-${feed.id}`} className="text-xs">URL</Label>
                                <Input id={`edit-url-${feed.id}`} type="url" value={currentEditFeedUrl} onChange={(e) => setCurrentEditFeedUrl(e.target.value)} placeholder="iCal feed URL" className="h-8 text-sm mt-0.5" />
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
                                        onClick={() => handleFeedColorChange(feed.id, colorOption.value)}
                                    />
                                    ))}
                                    <Input
                                        type="text"
                                        placeholder="#HEX"
                                        value={currentEditFeedColor}
                                        onChange={(e) => handleFeedColorChange(feed.id, e.target.value)}
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
                            <div className="mt-3 flex items-center justify-start gap-1">
                                <Button variant="default" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleSaveChangesToFeed} disabled={(currentEditFeedColor !== '' && !isValidHexColor(currentEditFeedColor)) || !currentEditFeedUrl.trim()}>
                                    <Check className="w-3.5 h-3.5 mr-1" /> Save
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleCloseEditDialog}>
                                    <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                                </Button>
                            </div>
                        </div>
                        ) : (
                        // Default Compact Display
                        <div className="flex flex-col">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center min-w-0">
                                    <span className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: feed.color }}></span>
                                    <p className="text-sm font-medium text-card-foreground truncate" title={feed.label}>{feed.label}</p>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center justify-start gap-1">
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
            {isClientLoaded && icalFeeds.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground text-center py-2">No feeds added yet. Add one above.</p>
            )}
        </CardContent>
     </div>
  );
  
  const renderWidgetDisplayContent = () => (
    <React.Fragment>
      {isClientLoaded && isLoading && <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin mr-2" />Loading events...</div>}

      {isClientLoaded && !isLoading && error && <div className="p-4 border rounded-md bg-destructive/10 text-destructive mb-4"><p className="text-sm p-2 py-2">{error}</p></div>}

      {isClientLoaded && !isLoading && !error && icalFeeds.filter(f => f.url.trim()).length === 0 && (
          <p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events. Add or enable an iCal feed via global settings.</p>
      )}

      {isClientLoaded && icalFeeds.filter(f => f.url.trim()).length > 0 && (
        <div className="space-y-4">
          {icalFeeds.map((feed, index) => {
            if (!feed.url.trim()) return null;
            const eventsForThisFeed = getUpcomingEventsForFeed(feed);
            const finalFeedColor = (feed.color && isValidHexColor(feed.color)) ? feed.color : 'hsl(var(--border))';
            
            if (isLoading && !eventsForThisFeed.length && !error) {
              return (
                <Card key={feed.id} className={cn("shadow-md flex flex-col")} style={{borderTop: `4px solid ${finalFeedColor}`}}>
                   <CardHeader className="p-3 flex flex-row items-center space-x-2">
                     <CalendarDays className="w-5 h-5" style={{ color: finalFeedColor }} />
                     <CardTitle className="text-lg">{feed.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 px-4 pb-3 flex flex-col">
                    <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
                  </CardContent>
                </Card>
              );
            }
            if (eventsForThisFeed.length === 0 && !isLoading) {
                 return null; 
            }

            return (
            <Card key={feed.id} className={cn("shadow-md flex flex-col", index === 0 && displayMode === 'widgetOnly' && "border-t-0")} style={{borderTop: `4px solid ${finalFeedColor}`}}>
                <CardHeader className="p-3 flex flex-row items-center space-x-2">
                    <CalendarDays className="w-5 h-5" style={{ color: finalFeedColor }} />
                    <CardTitle className="text-lg">{feed.label}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-0 flex flex-col"> 
                    {eventsForThisFeed.length > 0 ? (
                        <ScrollArea className="h-60 custom-styled-scroll-area pr-2 py-2 overflow-y-auto">
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
                        !isLoading && <p className="text-sm text-muted-foreground py-4 px-2 text-center">
                        No upcoming events for this feed.
                        </p>
                    )}
                </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </React.Fragment>
  );
  
  if (!isClientLoaded && displayMode === 'widgetOnly') {
    return (
        <div className="space-y-4">
         {Array.from({ length: 1 }).map((_, i) => (
           <Card key={`skel-cat-outer-${i}`} className="shadow-md mb-4 flex flex-col" style={{borderTop: `4px solid hsl(var(--muted))`}}>
             <CardHeader className="p-3 flex flex-row items-center space-x-2">
                 <CalendarDays className="w-5 h-5 text-muted" />
                 <Skeleton className="h-5 w-1/2" />
             </CardHeader>
             <CardContent className="px-3 py-0 pb-3 flex flex-col">
               <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
             </CardContent>
           </Card>
         ))}
         </div>
    );
  }

  if (displayMode === 'settingsOnly') {
    return settingsOpen ? (
      <div>
        {renderSettingsContent()}
        {editingFeed && ( /* This dialog is only for the popup version, not inline */
          <Dialog open={!!editingFeed} onOpenChange={(open) => !open && handleCloseEditDialog()}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Feed: {editingFeed.label}</DialogTitle>
                <DialogDescription>Update the details for your iCal feed.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-3">
                <div>
                  <Label htmlFor="dialog-edit-label">Label</Label>
                  <Input id="dialog-edit-label" value={currentEditFeedLabel} onChange={(e) => setCurrentEditFeedLabel(e.target.value)} placeholder="e.g., Work Calendar" />
                </div>
                <div>
                  <Label htmlFor="dialog-edit-url">URL</Label>
                  <Input id="dialog-edit-url" type="url" value={currentEditFeedUrl} onChange={(e) => setCurrentEditFeedUrl(e.target.value)} placeholder="iCal feed URL" />
                </div>
                <div>
                  <Label className="text-xs flex items-center mb-1.5 mt-1">
                      <Palette size={14} className="mr-1.5 text-muted-foreground" /> Feed Color
                  </Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                      {predefinedNamedColors.map(colorOption => (
                      <button
                          key={`dialog-edit-${editingFeed.id}-${colorOption.value}`}
                          type="button"
                          title={colorOption.name}
                          className={cn(
                          "w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                          currentEditFeedColor === colorOption.value ? "border-foreground" : "border-transparent hover:border-muted-foreground/50"
                          )}
                          style={{ backgroundColor: colorOption.value }}
                          onClick={() => handleFeedColorChange(editingFeed.id, colorOption.value)}
                      />
                      ))}
                      <Input
                          type="text"
                          placeholder="#HEX"
                          value={currentEditFeedColor}
                          onChange={(e) => handleFeedColorChange(editingFeed.id, e.target.value)}
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
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="button" onClick={handleSaveChangesToFeed} disabled={(currentEditFeedColor !== '' && !isValidHexColor(currentEditFeedColor)) || !currentEditFeedUrl.trim()}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    ) : null;
  }
  return renderWidgetDisplayContent();
}
