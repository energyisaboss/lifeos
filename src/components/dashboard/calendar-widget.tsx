
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SectionTitle } from './section-title';
import { CalendarDays, Settings, PlusCircle, Trash2, RefreshCw, LinkIcon, Palette, Check, Edit3, XCircle, GripVertical } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types'; 
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { processIcalFeed } from '@/ai/flows/ical-processor-flow';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';


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

const getNextFeedColor = () => {
  lastAssignedColorIndex = (lastAssignedColorIndex + 1) % predefinedNamedColors.length;
  return predefinedNamedColors[lastAssignedColorIndex].value;
};

const isValidHexColor = (color: string) => {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

interface CalendarWidgetProps {
  settingsOpen: boolean;
}

export function CalendarWidget({ settingsOpen }: CalendarWidgetProps) {
  const [icalFeeds, setIcalFeeds] = useState<IcalFeedItem[]>([]);
  const [allEvents, setAllEvents] = useState<AppCalendarEvent[]>([]); // Store as string dates
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerRefetch, setTriggerRefetch] = useState(0);
  
  const [editingFeed, setEditingFeed] = useState<IcalFeedItem | null>(null);
  const [editFeedUrl, setEditFeedUrl] = useState('');
  const [editFeedLabel, setEditFeedLabel] = useState('');
  const [editFeedColor, setEditFeedColor] = useState('');

  const feedListManagementRef = useRef<HTMLDivElement>(null);
  const [justAddedFeedId, setJustAddedFeedId] = useState<string | null>(null);

  const [isClientLoaded, setIsClientLoaded] = useState(false);

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
          })).filter(item => typeof item.url === 'string' && typeof item.label === 'string' && typeof item.color === 'string');
        }
      } catch (e) {
        console.error("Failed to parse iCal feeds from localStorage", e);
        toast({ title: "Storage Error", description: "Could not load saved iCal feeds.", variant: "destructive" });
      }
    }
    setIcalFeeds(loadedFeeds);
    setIsClientLoaded(true);
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

  const fetchAndProcessEvents = useCallback(async () => {
    const validFeeds = icalFeeds.filter(feed => (feed.url.trim().toLowerCase().startsWith('http') || feed.url.trim().toLowerCase().startsWith('webcal')) && (feed.url.trim().toLowerCase().endsWith('.ics') || feed.url.includes('format=ical')));
    if (validFeeds.length === 0) {
      setAllEvents([]);
      setIsLoading(false);
      setError(null);
      return;
    }

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
        fetchedEvents.push(...result.value);
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

    // Sort events by startTime (which are strings in ISO format)
    fetchedEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    setAllEvents(fetchedEvents); 
    setIsLoading(false);
  }, [icalFeeds]);

  useEffect(() => {
    if (isClientLoaded && icalFeeds.length > 0) {
        fetchAndProcessEvents();
    } else if (isClientLoaded && icalFeeds.length === 0) {
        setAllEvents([]);
        setIsLoading(false);
        setError(null);
    }
  }, [icalFeeds, isClientLoaded, triggerRefetch, fetchAndProcessEvents]);


  const handleAddNewFeedCard = () => {
    if (icalFeeds.length >= MAX_ICAL_FEEDS) {
      toast({
        title: "Feed Limit Reached",
        description: `Max ${MAX_ICAL_FEEDS} iCalendar feeds.`,
        variant: "destructive",
      });
      return;
    }
    const newFeedId = `new-${Date.now().toString()}-${Math.random().toString(36).substring(2,7)}`;
    const defaultColor = getNextFeedColor();
    const newFeed: IcalFeedItem = { 
      id: newFeedId,
      url: '', 
      label: `New Feed ${icalFeeds.length + 1}`, 
      color: defaultColor,
    };
    setIcalFeeds(prev => [...prev, newFeed]);
    setJustAddedFeedId(newFeedId);
  };

  const handleFeedInputChange = (feedId: string, field: 'url' | 'label' | 'color', value: string) => {
    setIcalFeeds(prevFeeds =>
      prevFeeds.map(feed => {
        if (feed.id === feedId) {
          if (field === 'color' && value !== '' && !isValidHexColor(value)) {
             toast({ title: "Invalid Color", description: "Please enter a valid hex color code (e.g. #RRGGBB).", variant: "destructive", duration: 3000 });
             return { ...feed, [field]: value }; // still update state to show invalid input
          }
          return { ...feed, [field]: value };
        }
        return feed;
      })
    );
  };
  
  const handleUpdateFeed = (idToUpdate: string) => {
    const feedToUpdate = icalFeeds.find(feed => feed.id === idToUpdate);
    if (!feedToUpdate) return;

    if (!feedToUpdate.url.trim()) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
     if (!feedToUpdate.url.toLowerCase().endsWith('.ics') && !feedToUpdate.url.toLowerCase().includes('format=ical') && !feedToUpdate.url.toLowerCase().startsWith('webcal://') && !feedToUpdate.url.toLowerCase().startsWith('http://') && !feedToUpdate.url.toLowerCase().startsWith('https://')) {
       toast({
        title: "Invalid URL",
        description: "Please enter a valid iCalendar URL (ending in .ics, containing 'format=ical', or starting with webcal://, http://, https://).",
        variant: "destructive",
      });
      return;
    }
    if (!isValidHexColor(feedToUpdate.color)) {
      toast({
        title: "Invalid Color",
        description: "Please enter a valid hex color code (e.g., #RRGGBB or #RGB).",
        variant: "destructive",
      });
      return;
    }
    
    setIcalFeeds(prevFeeds => prevFeeds.map(f => 
        f.id === idToUpdate && idToUpdate.startsWith('new-') 
        ? {...f, id: `feed-${Date.now()}-${Math.random().toString(36).substring(2,9)}`} 
        : f 
    ));
    
    setTriggerRefetch(prev => prev + 1); 
    toast({ title: "Feed Updated", description: `Feed "${feedToUpdate.label || feedToUpdate.url}" settings saved. Events refreshing.` });
  };

  const handleRemoveIcalFeed = (idToRemove: string) => {
    setIcalFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    toast({ title: "Feed Removed", description: "The iCal feed has been removed." });
  };
  
  const getUpcomingEventsForFeed = (feedLabel: string, feedColor: string): AppCalendarEvent[] => {
    return allEvents
      .filter(event => event.calendarSource === feedLabel && event.color === feedColor)
      .filter(event => new Date(event.endTime) >= new Date(new Date().setHours(0,0,0,0))) 
      .slice(0, 15); 
  };

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

  const handleOpenEditDialog = (feed: IcalFeedItem) => {
    setEditingFeed(feed);
    setEditFeedUrl(feed.url);
    setEditFeedLabel(feed.label);
    setEditFeedColor(feed.color);
  };

  const handleCloseEditDialog = () => {
    setEditingFeed(null);
    setEditFeedUrl('');
    setEditFeedLabel('');
    setEditFeedColor('');
  };

  const handleSaveChangesToFeed = () => {
    if (!editingFeed) return;

    if (!editFeedUrl.trim()) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
    if (!editFeedUrl.toLowerCase().endsWith('.ics') && !editFeedUrl.toLowerCase().includes('format=ical') && !editFeedUrl.toLowerCase().startsWith('webcal://') && !editFeedUrl.toLowerCase().startsWith('http://') && !editFeedUrl.toLowerCase().startsWith('https://')) {
       toast({
        title: "Invalid URL",
        description: "Please enter a valid iCalendar URL (ending in .ics, containing 'format=ical', or starting with webcal://, http://, https://).",
        variant: "destructive",
      });
      return;
    }
    if (!isValidHexColor(editFeedColor)) {
       toast({
        title: "Invalid Color",
        description: "Please enter a valid hex color code (e.g., #RRGGBB or #RGB).",
        variant: "destructive",
      });
      return;
    }

    setIcalFeeds(prevFeeds => prevFeeds.map(f =>
      f.id === editingFeed.id ? { ...f, url: editFeedUrl, label: editFeedLabel || `Feed ${prevFeeds.findIndex(pf => pf.id === f.id) + 1}`, color: editFeedColor } : f
    ));
    setTriggerRefetch(prev => prev + 1);
    toast({ title: "Feed Updated", description: `Feed "${editFeedLabel || editFeedUrl}" settings saved. Events refreshing.` });
    handleCloseEditDialog();
  };


  if (!isClientLoaded) {
    return (
      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-1 p-4 border-b">
          <SectionTitle icon={CalendarDays} title="Upcoming Events" className="mb-0 text-lg"/>
        </div>
        <div className="px-4 pb-4">
          <Card className="shadow-md mt-4">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground p-2 py-2 text-center">
                Loading calendars...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }


  return (
    <React.Fragment>
      <div className="flex justify-between items-center mb-1 p-4 border-b">
        <SectionTitle icon={CalendarDays} title="Upcoming Events" className="mb-0 text-lg"/>
      </div>

      {settingsOpen && (
        <div className="px-4 pb-2 pt-2 border-b mb-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleAddNewFeedCard} 
            disabled={icalFeeds.length >= MAX_ICAL_FEEDS} 
            className="w-full mb-3"
          >
            <PlusCircle className="w-4 h-4 mr-2" /> Add New Feed ({icalFeeds.length}/{MAX_ICAL_FEEDS})
          </Button>
          
          <ScrollArea className="max-h-[300px] pr-1 overflow-y-auto calendar-feed-scroll-area" ref={feedListManagementRef}>
            <div className="space-y-3">
              {icalFeeds.map((feed) => (
                <Card key={feed.id} data-feed-id={feed.id} className="p-3 bg-muted/10 shadow-md">
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor={`label-${feed.id}`} className="text-xs">Label</Label>
                      <Input
                        id={`label-${feed.id}`}
                        type="text"
                        placeholder="e.g., Work Calendar"
                        value={feed.label}
                        onChange={(e) => handleFeedInputChange(feed.id, 'label', e.target.value)}
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`url-${feed.id}`} className="text-xs">URL</Label>
                      <Input
                        id={`url-${feed.id}`}
                        type="url"
                        placeholder="iCal feed URL (.ics or webcal://)"
                        value={feed.url}
                        onChange={(e) => handleFeedInputChange(feed.id, 'url', e.target.value)}
                        className="h-8 text-xs mt-1"
                        required
                      />
                    </div>
                     <div>
                      <Label className="text-xs flex items-center mb-1.5">
                        <Palette size={14} className="mr-1.5 text-muted-foreground" /> Color
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
                            onClick={() => handleFeedInputChange(feed.id, 'color', colorOption.value)}
                          />
                        ))}
                         <Input
                          type="text"
                          placeholder="#HEX"
                          value={feed.color}
                          onChange={(e) => handleFeedInputChange(feed.id, 'color', e.target.value)}
                          className={cn(
                              "h-7 w-20 text-xs",
                              feed.color && !isValidHexColor(feed.color) && feed.color !== '' ? "border-destructive focus-visible:ring-destructive" : ""
                          )}
                          maxLength={7}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                     <Button variant="outline" size="sm" className="h-8" onClick={() => handleUpdateFeed(feed.id)}>
                      <RefreshCw className="w-3 h-3 mr-1.5" />
                      Update
                    </Button>
                    <Button variant="destructive" size="sm" className="h-8" onClick={() => handleRemoveIcalFeed(feed.id)}>
                      <Trash2 className="w-3 h-3 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
           {icalFeeds.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground text-center py-2">No feeds added yet. Click "Add New Feed".</p>
           )}
        </div>
      )}

      {isLoading && isClientLoaded && (
        Array.from({ length: Math.max(1, icalFeeds.filter(f => f.url.trim()).length || 1) }).map((_, i) => (
          <Card key={`skel-${i}`} className="shadow-md mb-4 mx-4">
            <CardHeader className="p-4">
              <Skeleton className="h-5 w-1/2" />
            </CardHeader>
            <CardContent className="px-4 py-0 pb-4">
              <div className="py-2">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {!isLoading && error && <div className="px-4 pb-4"><p className="text-sm text-destructive p-2 py-2">{error}</p></div>}
      
      {!isLoading && !error && icalFeeds.filter(f => f.url.trim()).length === 0 && !settingsOpen && (
          <Card className="shadow-md mx-4 mt-4"><CardContent className="pt-6"><p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events. Open settings to add an iCal feed.</p></CardContent></Card>
      )}

      {!isLoading && !error && (
        <div className="space-y-4 px-4 pb-4">
        {icalFeeds.map(feed => {
          if (!feed.url.trim() || !isClientLoaded) return null; 
          const eventsForThisFeed = getUpcomingEventsForFeed(feed.label, feed.color);
          
          if (eventsForThisFeed.length === 0 && !isLoading && !settingsOpen) { // Only show this message if settings are closed
               return (
                  <Card key={feed.id} className="shadow-md">
                      <CardHeader className="p-4">
                      <CardTitle className="text-lg flex items-center">
                          <CalendarDays className="w-5 h-5 mr-2" style={{ color: feed.color }} />
                          {feed.label}
                      </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pt-0 pb-4">
                      <p className="text-sm text-muted-foreground py-4 text-center">
                          No upcoming events for this feed.
                      </p>
                      </CardContent>
                  </Card>
              );
          }
          if (eventsForThisFeed.length === 0 && (isLoading || settingsOpen)) return null; // Don't render empty card if loading or settings are open

          return (
            <Card key={feed.id} className="shadow-md">
              <CardHeader className="p-4">
                <CardTitle className="text-lg flex items-center">
                   <CalendarDays className="w-5 h-5 mr-2" style={{ color: feed.color }} />
                  {feed.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                {eventsForThisFeed.length > 0 ? (
                  <ScrollArea className="h-[200px] pr-3 py-2">
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
                     {/* Message is handled by the block above if settings are closed */}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        </div>
      )}
      {!isLoading && !error && icalFeeds.filter(f=>f.url.trim()).length > 0 && allEvents.length === 0 && !settingsOpen && (
        <Card className="shadow-md mx-4 mt-4"><CardContent className="pt-6"><p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events from any active feeds for the next 30 days, or feeds might need updating/checking.</p></CardContent></Card>
        )}

        <Dialog open={!!editingFeed} onOpenChange={(isOpen) => !isOpen && handleCloseEditDialog()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit iCal Feed</DialogTitle>
                    <DialogDescription>Update the URL, label, or color for this feed.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div>
                        <Label htmlFor="edit-feed-label">Label</Label>
                        <Input id="edit-feed-label" value={editFeedLabel} onChange={(e) => setEditFeedLabel(e.target.value)} placeholder="e.g., Work Calendar" />
                    </div>
                    <div>
                        <Label htmlFor="edit-feed-url">URL</Label>
                        <Input id="edit-feed-url" type="url" value={editFeedUrl} onChange={(e) => setEditFeedUrl(e.target.value)} placeholder="iCal feed URL" />
                    </div>
                    <div>
                      <Label className="flex items-center"><Palette size={16} className="mr-1.5" /> Color</Label>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {predefinedNamedColors.map(colorOption => (
                          <button
                            key={`edit-${colorOption.value}`}
                            type="button"
                            title={colorOption.name}
                            className={cn(
                              "w-6 h-6 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
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
                            "h-8 w-24 text-sm",
                            editFeedColor && !isValidHexColor(editFeedColor) && editFeedColor !== '' ? "border-destructive focus-visible:ring-destructive" : ""
                          )}
                          maxLength={7}
                        />
                      </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button type="button" onClick={handleSaveChangesToFeed}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </React.Fragment>
  );
}
      
