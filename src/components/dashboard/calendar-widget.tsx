
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SectionTitle } from './section-title';
import { CalendarDays, Settings, PlusCircle, Trash2, LinkIcon, Palette, Edit3, Check, XCircle, Loader2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Skeleton } from '@/components/ui/skeleton';


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
  
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const feedListManagementRef = useRef<HTMLDivElement>(null);
  const [justAddedFeedId, setJustAddedFeedId] = useState<string | null>(null);

  const fetchAndProcessEvents = useCallback(async () => {
    console.log("CalendarWidget: fetchAndProcessEvents called. isClientLoaded:", isClientLoaded, 'Number of feeds:', icalFeeds.length);
    if (!isClientLoaded || icalFeeds.length === 0) {
      setAllEvents([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    
    const validFeeds = icalFeeds.filter(feed => (feed.url.trim().toLowerCase().startsWith('http') || feed.url.trim().toLowerCase().startsWith('webcal')) && (feed.url.trim().toLowerCase().endsWith('.ics') || feed.url.includes('format=ical')));
    
    if (validFeeds.length === 0 && displayMode === 'widgetOnly') {
      setAllEvents([]);
      setIsLoading(false);
      setError(null);
      console.log('CalendarWidget: No valid feeds to process for widget display.');
      return;
    }
    
    if (validFeeds.length === 0 && displayMode === 'settingsOnly' && settingsOpen) {
        // Even if no valid feeds, we might still want to show the settings UI
        // but clear any old events and errors.
        setAllEvents([]);
        setError(null);
        setIsLoading(false); // Not loading if no feeds to fetch
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
  }, [icalFeeds, isClientLoaded, displayMode, settingsOpen]); 

  useEffect(() => {
    console.log("CalendarWidget: Event fetching useEffect triggered. Dependencies: isClientLoaded, icalFeeds, fetchAndProcessEvents, refreshTrigger");
     if (isClientLoaded && (displayMode === 'widgetOnly' || settingsOpen)) {
        fetchAndProcessEvents();
    }
  }, [isClientLoaded, icalFeeds, fetchAndProcessEvents, refreshTrigger, displayMode, settingsOpen]);


  useEffect(() => {
    // Load feeds from localStorage on client mount
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

    const newFeedId = `feed-${Date.now()}-${Math.random().toString(36).substring(2,9)}`;
    const newFeedItem: IcalFeedItem = {
      id: newFeedId,
      url: newIcalUrl.trim(),
      label: newIcalLabel.trim() || `Feed ${icalFeeds.length + 1}`,
      color: getNextFeedColor(), // Assign a new color
    };
    setIcalFeeds(prev => [...prev, newFeedItem]);
    setJustAddedFeedId(newFeedId); 
    setNewIcalUrl('');
    setNewIcalLabel('');
    toast({ title: "Feed Added", description: `"${newFeedItem.label}" added. Events refreshing.` });
  }, [icalFeeds, newIcalUrl, newIcalLabel]);

  const handleRemoveIcalFeed = useCallback((idToRemove: string) => {
    const feedLabel = icalFeeds.find(f => f.id === idToRemove)?.label || "Feed";
    setIcalFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    toast({ title: "Feed Removed", description: `"${feedLabel}" has been removed.` });
  }, [icalFeeds]);
  
  const handleOpenEditDialog = useCallback((feedToEdit: IcalFeedItem) => {
    setEditingFeedId(feedToEdit.id);
    setCurrentEditFeedUrl(feedToEdit.url);
    setCurrentEditFeedLabel(feedToEdit.label);
    setCurrentEditFeedColor(feedToEdit.color);
  }, []);
  
  const handleCloseEditDialog = useCallback(() => {
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
    handleCloseEditDialog();
  }, [editingFeedId, icalFeeds, currentEditFeedUrl, currentEditFeedLabel, currentEditFeedColor, handleCloseEditDialog]);

  const handleFeedColorChange = useCallback((feedId: string, newColor: string) => {
    if (newColor !== '' && !isValidHexColor(newColor)) {
        toast({ title: "Invalid Color", description: "Please enter a valid hex color code (e.g. #RRGGBB).", variant: "destructive", duration:3000 });
        if (editingFeedId === feedId && currentEditFeedColor !== newColor) return; // Don't apply if invalid for current edit
    }
    
    if (editingFeedId === feedId) {
        setCurrentEditFeedColor(newColor);
    }
  }, [editingFeedId, currentEditFeedColor]);


  const getUpcomingEventsForFeed = useCallback((feed: IcalFeedItem): AppCalendarEvent[] => {
    if (!feed) return [];
    return allEvents
      .filter(event => {
        const labelMatch = event.calendarSource?.toLowerCase() === feed.label?.toLowerCase();
        const colorMatch = event.color?.toLowerCase() === feed.color?.toLowerCase();
        return labelMatch && colorMatch;
      })
      .filter(event => new Date(event.endTime) >= new Date(new Date().setHours(0,0,0,0)));
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
    <div className="p-3 border rounded-lg bg-muted/20 shadow-sm">
        <CardHeader className="p-1 pb-3">
            <CardTitle className="text-lg">Calendar Settings</CardTitle>
        </CardHeader>
        <CardContent className="p-1 space-y-3">
            <Card className="p-3">
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

            {icalFeeds.length > 0 && (
            <div className="mt-3">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Active Feeds ({icalFeeds.length}/{MAX_ICAL_FEEDS})</h4>
                <ScrollArea className="max-h-[240px] pr-1 calendar-feed-scroll-area" ref={feedListManagementRef}>
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
                                    <div className="mt-2 flex items-center justify-start gap-1">
                                        <Button variant="default" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleSaveChangesToFeed} disabled={(currentEditFeedColor !== '' && !isValidHexColor(currentEditFeedColor)) || !currentEditFeedUrl.trim()}>
                                            <Check className="w-3.5 h-3.5 mr-1" /> Save
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-7 px-2 py-1 text-xs" onClick={handleCloseEditDialog}>
                                            <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center min-w-0">
                                            <LinkIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{color: feed.color}} />
                                            <p className="text-sm font-medium text-card-foreground truncate" title={feed.label}>{feed.label}</p>
                                        </div>
                                    </div>
                                     <div className="mt-2 flex items-center justify-start gap-1"> {/* Aligned left */}
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
            {isLoading && displayMode === 'settingsOnly' && <div className="flex items-center justify-center py-3"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading events...</div>}
        </CardContent>

         {/* Edit Feed Dialog */}
        <Dialog open={!!editingFeedId && displayMode==='settingsOnly'} onOpenChange={(isOpen) => { if (!isOpen) handleCloseEditDialog(); }}>
            <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>Edit iCal Feed</DialogTitle>
                <DialogDescription>
                Update the details for &quot;{icalFeeds.find(f => f.id === editingFeedId)?.label || 'this feed'}&quot;.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-feed-label" className="text-right text-xs">Label</Label>
                <Input id="edit-feed-label" value={currentEditFeedLabel} onChange={(e) => setCurrentEditFeedLabel(e.target.value)} className="col-span-3 h-8 text-sm" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-feed-url" className="text-right text-xs">URL</Label>
                <Input id="edit-feed-url" value={currentEditFeedUrl} onChange={(e) => setCurrentEditFeedUrl(e.target.value)} className="col-span-3 h-8 text-sm" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right text-xs flex items-center col-span-1 justify-end">
                        <Palette size={14} className="mr-1.5 text-muted-foreground" /> Color
                    </Label>
                    <div className="col-span-3 flex flex-wrap items-center gap-1.5">
                        {predefinedNamedColors.map(colorOption => (
                            <button
                            key={`dialog-${editingFeedId}-${colorOption.value}`}
                            type="button"
                            title={colorOption.name}
                            className={cn(
                                "w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                currentEditFeedColor === colorOption.value ? "border-foreground" : "border-transparent hover:border-muted-foreground/50"
                            )}
                            style={{ backgroundColor: colorOption.value }}
                            onClick={() => editingFeedId && handleFeedColorChange(editingFeedId, colorOption.value)}
                            />
                        ))}
                        <Input
                            type="text"
                            placeholder="#HEX"
                            value={currentEditFeedColor}
                            onChange={(e) => editingFeedId && handleFeedColorChange(editingFeedId, e.target.value)}
                            className={cn(
                                "h-7 w-20 text-xs",
                                currentEditFeedColor && !isValidHexColor(currentEditFeedColor) && currentEditFeedColor !== '' ? "border-destructive focus-visible:ring-destructive" : ""
                            )}
                            maxLength={7}
                        />
                    </div>
                </div>
                 {!isValidHexColor(currentEditFeedColor) && currentEditFeedColor !== '' && (
                    <p className="col-span-4 text-xs text-destructive text-center">Invalid hex color code.</p>
                )}
            </div>
            <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="button" onClick={handleSaveChangesToFeed} disabled={(currentEditFeedColor !== '' && !isValidHexColor(currentEditFeedColor)) || !currentEditFeedUrl.trim()}>Save Changes</Button>
            </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
  
  const renderWidgetDisplayContent = () => (
    <React.Fragment>
      {!isClientLoaded && displayMode === 'widgetOnly' && (
        Array.from({ length: 1 }).map((_, i) => (
          <Card key={`skel-cat-outer-${i}`} className="shadow-md mb-4 flex flex-col" style={{borderTop: `4px solid hsl(var(--muted))`}}>
            <CardHeader className="p-3"> <Skeleton className="h-5 w-1/2" /> </CardHeader>
            <CardContent className="px-3 py-0 pb-3 flex flex-col flex-1">
              <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
            </CardContent>
          </Card>
        ))
      )}
      {isClientLoaded && !isLoading && error && <div className="p-4 border rounded-md bg-destructive/10 text-destructive mb-4"><p className="text-sm p-2 py-2">{error}</p></div>}

      {isClientLoaded && !isLoading && !error && icalFeeds.filter(f => f.url.trim()).length === 0 && (
          <p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events. Add or enable an iCal feed via global settings.</p>
      )}

      {isClientLoaded && icalFeeds.filter(f => f.url.trim()).length > 0 && (
        <>
          {icalFeeds.map((feed, index) => {
            if (!feed.url.trim()) return null; 
            const eventsForThisFeed = getUpcomingEventsForFeed(feed);
            const finalFeedColor = (feed.color && isValidHexColor(feed.color)) ? feed.color : 'hsl(var(--border))';
            const isFirstFeedCard = index === 0;

            if (isLoading && !eventsForThisFeed.length && !error) {
              return (
                <Card key={feed.id} className={cn("shadow-md mb-4 flex flex-col", isFirstFeedCard && displayMode === 'widgetOnly' && "border-t-0")} style={{borderTop: `4px solid ${finalFeedColor}`}}>
                  <CardHeader className="p-3">
                    <CardTitle className="text-lg flex items-center">
                      <CalendarDays className="w-5 h-5 mr-2" style={{ color: finalFeedColor }} />
                      {feed.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 px-4 pb-3 flex flex-col flex-1">
                    <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
                  </CardContent>
                </Card>
              );
            }
            // Only render the card if there are events for this feed or if it's loading
            if (eventsForThisFeed.length === 0 && !isLoading) {
                 return null; 
            }

            return (
            <Card key={feed.id} className={cn("shadow-md mb-4 flex flex-col", isFirstFeedCard && displayMode === 'widgetOnly' && "border-t-0")} style={{borderTop: `4px solid ${finalFeedColor}`}}>
                <CardHeader className="p-3">
                <CardTitle className="text-lg flex items-center">
                    <CalendarDays className="w-5 h-5 mr-2" style={{ color: finalFeedColor }} />
                    {feed.label}
                </CardTitle>
                </CardHeader>
                <CardContent className="py-0 px-4 pb-3 flex flex-col flex-1">
                {eventsForThisFeed.length > 0 ? (
                    <ScrollArea className="h-full max-h-60 pr-2 py-2">
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
    </React.Fragment>
  );
  
  if (displayMode === 'settingsOnly') {
    return settingsOpen ? renderSettings() : null;
  }

  if (!isClientLoaded && displayMode === 'widgetOnly') {
    return (
        Array.from({ length: 1 }).map((_, i) => (
          <Card key={`skel-cat-outer-${i}`} className="shadow-md mb-4 flex flex-col" style={{borderTop: `4px solid hsl(var(--muted))`}}>
            <CardHeader className="p-3"> <Skeleton className="h-5 w-1/2" /> </CardHeader>
            <CardContent className="px-3 py-0 pb-3 flex flex-col flex-1">
              <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
            </CardContent>
          </Card>
        ))
    );
  }
  return renderWidgetDisplayContent();
}
