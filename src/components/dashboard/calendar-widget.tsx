
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Loader2, AlertCircle } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent, IcalFeedItem } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { processIcalFeed, type IcalProcessorInput } from '@/ai/flows/ical-processor-flow';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface CalendarWidgetProps {
  feed: IcalFeedItem; // Widget now receives a single feed to display
  // settingsOpen and displayMode are no longer needed here as settings are global
}

export function CalendarWidget({ feed }: CalendarWidgetProps) {
  const [events, setEvents] = useState<AppCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  const fetchAndProcessSingleFeed = useCallback(async () => {
    if (!isClientLoaded || !feed || !feed.url.trim()) {
      setEvents([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    console.log(`CalendarWidget: Fetching events for feed: ${feed.label} (${feed.id})`);
    setIsLoading(true);
    setError(null);

    try {
      const input: IcalProcessorInput = {
        icalUrl: feed.url,
        label: feed.label,
        color: feed.color,
      };
      const fetchedEvents = await processIcalFeed(input);
      fetchedEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setEvents(fetchedEvents);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Error fetching/processing iCal feed ${feed.label || feed.url}:`, errorMessage);
      setError(`Failed to load ${feed.label || 'feed'}: ${errorMessage.substring(0, 150)}...`);
      toast({
        title: `Error Loading Feed: ${feed.label}`,
        description: `Could not load events. ${errorMessage.substring(0, 100)}...`,
        variant: "destructive",
        duration: 7000,
      });
      setEvents([]); // Clear events for this feed on error
    } finally {
      setIsLoading(false);
    }
  }, [isClientLoaded, feed]);

  useEffect(() => {
    setIsClientLoaded(true);
  }, []);

  useEffect(() => {
    if (isClientLoaded && feed && feed.url) {
      fetchAndProcessSingleFeed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClientLoaded, feed, fetchAndProcessSingleFeed]); // fetchAndProcessSingleFeed is memoized

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

  const upcomingEventsForThisFeed = events.filter(event => new Date(event.endTime) >= new Date(new Date().setHours(0,0,0,0)));

  if (!isClientLoaded && !feed) { // Should ideally not happen if feed is always passed
    return (
      <Card className="shadow-md mb-4 flex flex-col" style={{ borderTop: `4px solid hsl(var(--muted))` }}>
        <CardHeader className="p-3 flex flex-row items-center space-x-2">
          <CalendarDays className="w-5 h-5 text-muted" />
          <Skeleton className="h-5 w-1/2" />
        </CardHeader>
        <CardContent className="px-3 py-0 pb-3 flex flex-col">
          <div className="py-2"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
        </CardContent>
      </Card>
    );
  }

  const finalFeedColor = (feed.color && /^#([0-9A-F]{3}){1,2}$/i.test(feed.color)) ? feed.color : 'hsl(var(--border))';

  return (
    <Card className="shadow-md mb-4 flex flex-col" style={{ borderTop: `4px solid ${finalFeedColor}` }}>
      <CardHeader className="p-3 flex flex-row items-center space-x-2">
        <CalendarDays className="w-5 h-5" style={{ color: finalFeedColor }} />
        <CardTitle className="text-lg truncate" title={feed.label}>{feed.label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-0 pb-3 flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading events...</div>
        ) : error ? (
          <div className="p-2 border rounded-md bg-destructive/10 text-destructive text-xs my-2">
            <AlertCircle className="inline h-4 w-4 mr-1" /> {error}
          </div>
        ) : upcomingEventsForThisFeed.length > 0 ? (
          <ScrollArea className="h-60 pr-2 py-2 custom-styled-scroll-area overflow-y-auto">
            <ul className="space-y-3">
              {upcomingEventsForThisFeed.map((event) => (
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
          <p className="text-sm text-muted-foreground py-4 px-2 text-center">
            No upcoming events for this feed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
