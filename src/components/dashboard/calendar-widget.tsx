
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { CalendarDays, Settings, PlusCircle, Trash2, RefreshCw, LinkIcon } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types'; // String dates
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { processIcalFeed } from '@/ai/flows/ical-processor-flow';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const MAX_ICAL_FEEDS = 5;

const widgetPredefinedColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
];

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

export function CalendarWidget() {
  const [showFeedManagement, setShowFeedManagement] = useState(false);
  const [icalFeeds, setIcalFeeds] = useState<IcalFeedItem[]>(() => {
    if (typeof window !== 'undefined') {
      const savedFeeds = localStorage.getItem('icalFeedsLifeOS_v2');
      try {
        const parsed = savedFeeds ? JSON.parse(savedFeeds) : [];
        return Array.isArray(parsed) ? parsed.map((item: any, index: number) => ({
          id: item.id || Date.now().toString() + Math.random(),
          url: item.url || '',
          label: item.label || item.url || `Feed ${index + 1}`,
          color: item.color || widgetPredefinedColors[index % widgetPredefinedColors.length],
        })).filter(item => typeof item.url === 'string' && typeof item.label === 'string' && typeof item.color === 'string') : [];
      } catch (e) {
        console.error("Failed to parse iCal feeds from localStorage", e);
        return [];
      }
    }
    return [];
  });

  const [allEvents, setAllEvents] = useState<ParsedCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerRefetch, setTriggerRefetch] = useState(0);

  const parseEventDatesAndSort = (eventsStrings: AppCalendarEvent[]): ParsedCalendarEvent[] => {
    return eventsStrings
      .map(event => ({
        ...event,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
      }))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('icalFeedsLifeOS_v2', JSON.stringify(icalFeeds));
    }
  }, [icalFeeds]);

  useEffect(() => {
    const fetchAndProcessEvents = async () => {
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
    };

    fetchAndProcessEvents();
  }, [icalFeeds, triggerRefetch]);

  const handleAddNewFeed = () => {
    if (icalFeeds.length >= MAX_ICAL_FEEDS) {
      toast({
        title: "Feed Limit Reached",
        description: `You can add a maximum of ${MAX_ICAL_FEEDS} iCalendar feeds.`,
        variant: "destructive",
      });
      return;
    }
    const newFeedColor = widgetPredefinedColors[icalFeeds.length % widgetPredefinedColors.length];
    setIcalFeeds(prev => [...prev, { 
      id: Date.now().toString() + Math.random().toString(36).substring(2, 15), 
      url: '', 
      label: `Feed ${prev.length + 1}`, 
      color: newFeedColor 
    }]);
  };

  const handleFeedInputChange = (id: string, field: 'url' | 'label' | 'color', value: string) => {
    setIcalFeeds(prevFeeds =>
      prevFeeds.map(feed =>
        feed.id === id ? { ...feed, [field]: value } : feed
      )
    );
  };

  const handleUpdateFeed = (id: string) => {
    const feedToUpdate = icalFeeds.find(feed => feed.id === id);
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
    
    setTriggerRefetch(prev => prev + 1);
    toast({ title: "Feed Updated", description: `Feed "${feedToUpdate.label || feedToUpdate.url}" settings saved. Events refreshing.` });
  };

  const handleRemoveIcalFeed = (idToRemove: string) => {
    setIcalFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    toast({ title: "Feed Removed", description: "The iCal feed has been removed." });
  };
  
  const upcomingEvents = allEvents
    .filter(event => event.endTime >= new Date(new Date().setHours(0,0,0,0))) 
    .slice(0, 15);

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

  return (
    <Card className="shadow-lg flex flex-col h-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <SectionTitle icon={CalendarDays} title="Upcoming Events" />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowFeedManagement(!showFeedManagement)}
            aria-label="Manage iCal Feeds"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 py-0 flex-grow overflow-hidden flex flex-col">
        {showFeedManagement && (
          <div className="pt-3 pb-2 border-b border-border mb-2">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-medium text-muted-foreground">Manage iCal Feeds</h4>
              <Button size="sm" variant="outline" onClick={handleAddNewFeed} disabled={icalFeeds.length >= MAX_ICAL_FEEDS}>
                <PlusCircle className="w-4 h-4 mr-2" /> Add New Feed ({icalFeeds.length}/{MAX_ICAL_FEEDS})
              </Button>
            </div>
            
            {icalFeeds.length > 0 && (
              <ScrollArea className="h-auto max-h-[300px] pr-1 space-y-3"> {/* Increased max-h */}
                {icalFeeds.map(feed => (
                  <Card key={feed.id} className="p-3 bg-muted/30">
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
                        <Label className="text-xs">Color</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1"> {/* Added flex-wrap and gap */}
                          {widgetPredefinedColors.map(colorValue => (
                            <button
                              key={colorValue}
                              type="button"
                              title={colorValue}
                              className={cn(
                                "w-5 h-5 rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                feed.color === colorValue ? "border-foreground" : "border-transparent hover:border-muted-foreground/50"
                              )}
                              style={{ backgroundColor: colorValue }}
                              onClick={() => handleFeedInputChange(feed.id, 'color', colorValue)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2"> {/* Added flex-wrap and gap */}
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
              </ScrollArea>
            )}
             {icalFeeds.length === 0 && !isLoading && (
                <p className="text-xs text-muted-foreground text-center py-2">No feeds added yet. Click "Add New Feed".</p>
             )}
          </div>
        )}

        <ScrollArea className="flex-1 pr-3">
          {isLoading && <p className="text-sm text-muted-foreground p-2 py-2">Loading events...</p>}
          {!isLoading && error && <p className="text-sm text-destructive p-2 py-2">{error}</p>}
          {!isLoading && !error && upcomingEvents.length === 0 && icalFeeds.filter(f => f.url.trim()).length === 0 && (
             <p className="text-sm text-muted-foreground p-2 py-2">No upcoming events. Click the settings icon to add and update an iCal feed.</p>
          )}
           {!isLoading && !error && upcomingEvents.length === 0 && icalFeeds.filter(f => f.url.trim()).length > 0 && (
             <p className="text-sm text-muted-foreground p-2 py-2">No upcoming events from active feeds for the next 30 days, or feeds might need updating.</p>
          )}
          {!isLoading && !error && upcomingEvents.length > 0 && (
            <ul className="space-y-3 py-2">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-start space-x-3 pb-2 border-b border-border last:border-b-0">
                  <div className="flex-shrink-0 w-2 h-6 mt-1 rounded-full" style={{ backgroundColor: event.color }} />
                  <div>
                    <p className="font-medium text-card-foreground">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{formatEventDate(event)} - {formatEventTime(event)}</p>
                    <p className="text-xs text-muted-foreground italic truncate max-w-[200px] sm:max-w-xs" title={event.calendarSource}>{event.calendarSource}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


