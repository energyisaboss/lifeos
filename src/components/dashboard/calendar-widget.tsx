
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SectionTitle } from './section-title';
import { CalendarDays, Settings, PlusCircle, Trash2, RefreshCw, LinkIcon, Palette, Check, Edit3, XCircle, GripVertical } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types'; // String dates
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


const MAX_ICAL_FEEDS = 10;
const LOCALSTORAGE_KEY_ICAL_FEEDS = 'icalFeedsLifeOS_v2';

interface IcalFeedItem {
  id: string;
  url: string;
  label: string;
  color: string;
}

interface ParsedCalendarEvent extends Omit<AppCalendarEvent, 'startTime' | 'endTime'> {
  startTime: Date;
  endTime: Date;
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

export function CalendarWidget() {
  const [showFeedManagement, setShowFeedManagement] = useState(false);
  const [icalFeeds, setIcalFeeds] = useState<IcalFeedItem[]>([]);
  const [allEvents, setAllEvents] = useState<ParsedCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Loading for events
  const [error, setError] = useState<string | null>(null);
  const [triggerRefetch, setTriggerRefetch] = useState(0);
  
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [newIcalLabel, setNewIcalLabel] = useState('');
  const [newIcalColor, setNewIcalColor] = useState(getNextFeedColor());

  const [editingFeed, setEditingFeed] = useState<IcalFeedItem | null>(null);
  const [editFeedUrl, setEditFeedUrl] = useState('');
  const [editFeedLabel, setEditFeedLabel] = useState('');
  const [editFeedColor, setEditFeedColor] = useState('');

  const feedListManagementRef = useRef<HTMLDivElement>(null);
  const [justAddedFeedId, setJustAddedFeedId] = useState<string | null>(null);

  const [isClientLoaded, setIsClientLoaded] = useState(false);

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
    if (isClientLoaded) { // Only save to localStorage after initial client load
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

  const parseEventDatesAndSort = (eventsStrings: AppCalendarEvent[]): ParsedCalendarEvent[] => {
    return eventsStrings
      .map(event => ({
        ...event,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
      }))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  };

  const fetchAndProcessEvents = useCallback(async () => {
    const validFeeds = icalFeeds.filter(feed => feed.url.trim().toLowerCase().startsWith('http') || feed.url.trim().toLowerCase().startsWith('webcal'));
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

    const fetchedEventsStrings: AppCalendarEvent[] = [];
    let hasErrors = false;
    results.forEach((result, index) => {
      const feed = validFeeds[index];
      if (result.status === 'fulfilled') {
        fetchedEventsStrings.push(...result.value);
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

    const parsedAndSortedEvents = parseEventDatesAndSort(fetchedEventsStrings);
    setAllEvents(parsedAndSortedEvents); 
    setIsLoading(false);
  }, [icalFeeds]); // Removed processIcalFeed from deps as it's an imported function

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
        description: `You can add a maximum of ${MAX_ICAL_FEEDS} iCalendar feeds.`,
        variant: "destructive",
      });
      return;
    }
    const newFeedId = `new-${Date.now().toString()}-${Math.random().toString(36).substring(2,7)}`;
    const defaultColor = getNextFeedColor();
    const newFeed = { 
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
      prevFeeds.map(feed =>
        feed.id === feedId ? { ...feed, [field]: value } : feed
      )
    );
  };
  
  const handleUpdateFeed = (idToUpdate: string) => {
    const feedToUpdate = icalFeeds.find(feed => feed.id === idToUpdate);
    if (!feedToUpdate) return;

    if (!feedToUpdate.url.trim()) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
     if (!feedToUpdate.url.toLowerCase().endsWith('.ics') && !feedToUpdate.url.toLowerCase().startsWith('webcal://') && !feedToUpdate.url.toLowerCase().startsWith('http://') && !feedToUpdate.url.toLowerCase().startsWith('https://')) {
       toast({
        title: "Invalid URL",
        description: "Please enter a valid iCalendar URL (ending in .ics or starting with webcal://, http://, https://).",
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
    
    // Ensure new feeds (that were placeholders) get a persistent ID once updated
    // This is now less critical as IDs are assigned on creation.
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
  
  const getUpcomingEventsForFeed = (feedLabel: string, feedColor: string): ParsedCalendarEvent[] => {
    return allEvents
      .filter(event => event.calendarSource === feedLabel && event.color === feedColor)
      .filter(event => event.endTime >= new Date(new Date().setHours(0,0,0,0))) 
      .slice(0, 15); 
  };

  const formatEventTime = (event: ParsedCalendarEvent) => {
    if (event.isAllDay) return "All Day";
    const start = format(event.startTime, 'p');
    if (!event.endTime || event.endTime.getTime() === event.startTime.getTime() || 
        (format(event.endTime, 'p') === start && event.startTime.toDateString() === event.endTime.toDateString())) {
      return start;
    }
    const end = format(event.endTime, 'p');
    return `${start} - ${end}`;
  };
  
  const formatEventDate = (event: ParsedCalendarEvent) => {
    return format(event.startTime, 'EEE, MMM d');
  }

  if (!isClientLoaded) {
    // Render a consistent placeholder during server render and initial client mount
    return (
      <React.Fragment>
        <div className="flex justify-between items-center mb-1 p-4 border-b">
          <SectionTitle icon={CalendarDays} title="Upcoming Events" className="mb-0 text-lg"/>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowFeedManagement(!showFeedManagement)}
            aria-label="Manage iCal Feeds"
            disabled // Disabled until client is loaded
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
        <Card className="shadow-md mt-4">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground p-2 py-2 text-center">
              Loading calendars...
            </p>
          </CardContent>
        </Card>
      </React.Fragment>
    );
  }


  return (
    <React.Fragment>
      <div className="flex justify-between items-center mb-1 p-4 border-b">
        <SectionTitle icon={CalendarDays} title="Upcoming Events" className="mb-0 text-lg"/>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowFeedManagement(!showFeedManagement)}
          aria-label="Manage iCal Feeds"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      {showFeedManagement && (
        <div className="p-4 border-b mb-2">
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
                      <Label className="text-xs flex items-center mb-1">
                        <Palette size={14} className="mr-1.5" /> Color
                      </Label>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-2">
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
                      Update Feed
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

      <div className="px-4 pb-4 space-y-4">
        {isLoading && isClientLoaded && ( // Show loading skeleton only if client loaded and actually loading events
          Array.from({ length: Math.max(1, icalFeeds.filter(f => f.url.trim()).length || 1) }).map((_, i) => (
            <Card key={`skel-${i}`} className="shadow-md mb-4">
              <CardHeader>
                <Skeleton className="h-5 w-1/2" />
              </CardHeader>
              <CardContent className="px-4 py-0">
                <div className="py-4">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {!isLoading && error && <p className="text-sm text-destructive p-2 py-2">{error}</p>}
        
        {!isLoading && !error && icalFeeds.filter(f => f.url.trim()).length === 0 && !showFeedManagement && (
            <Card className="shadow-md mt-4"><CardContent className="pt-6"><p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events. Click the settings icon <Settings className="inline h-4 w-4" /> to add an iCal feed.</p></CardContent></Card>
        )}

        {!isLoading && !error && icalFeeds.filter(f => f.url.trim()).length > 0 && (
          icalFeeds.map(feed => {
            if (!feed.url.trim()) return null; 
            const eventsForThisFeed = getUpcomingEventsForFeed(feed.label, feed.color);
            
            if (eventsForThisFeed.length === 0 && !isLoading) {
                // Still render the card for the feed, but with a "no events" message
                 return (
                    <Card key={feed.id} className="shadow-md mb-4">
                        <CardHeader>
                        <CardTitle className="text-lg flex items-center">
                            <div className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: feed.color }} />
                            {feed.label}
                        </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 py-0">
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No upcoming events for this feed.
                        </p>
                        </CardContent>
                    </Card>
                );
            }
            if (eventsForThisFeed.length === 0 && isLoading) return null; // Don't show empty cards while still loading other feeds.

            return (
              <Card key={feed.id} className="shadow-md mb-4">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                     <div className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: feed.color }} />
                    {feed.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-0">
                  {eventsForThisFeed.length > 0 ? (
                    <ScrollArea className="h-[200px] pr-3 py-2">
                      <ul className="space-y-3">
                        {eventsForThisFeed.map((event) => (
                          <li key={event.id} className="flex items-start space-x-3 pb-2 border-b border-border last:border-b-0">
                            <div className="flex-shrink-0 w-2 h-6 mt-1 rounded-full" style={{ backgroundColor: event.color }} />
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
                      {/* This case should be handled by the block above now for feeds with no events */}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
        {!isLoading && !error && icalFeeds.filter(f=>f.url.trim()).length > 0 && allEvents.length === 0 && !showFeedManagement && (
          <Card className="shadow-md mt-4"><CardContent className="pt-6"><p className="text-sm text-muted-foreground p-2 py-2 text-center">No upcoming events from any active feeds for the next 30 days, or feeds might need updating.</p></CardContent></Card>
          )}
      </div>
    </React.Fragment>
  );
}
      
