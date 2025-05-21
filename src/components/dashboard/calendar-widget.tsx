
"use client";

import React, { useState, useEffect, FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { CalendarDays, LinkIcon, PlusCircle, Trash2 } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types'; // CalendarEvent now has string dates
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { processIcalFeed } from '@/ai/flows/ical-processor-flow';
import { format } from 'date-fns';
import { Separator } from '../ui/separator';
import { toast } from '@/hooks/use-toast';

const MAX_ICAL_FEEDS = 3;

// Helper type for internal use with Date objects after parsing
interface ParsedCalendarEvent extends Omit<AppCalendarEvent, 'startTime' | 'endTime'> {
  startTime: Date;
  endTime: Date;
}

export function CalendarWidget() {
  const [icalUrls, setIcalUrls] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const savedUrls = localStorage.getItem('icalUrls');
      return savedUrls ? JSON.parse(savedUrls) : [];
    }
    return [];
  });
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [allEvents, setAllEvents] = useState<ParsedCalendarEvent[]>([]); // Internal state uses Date objects
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      localStorage.setItem('icalUrls', JSON.stringify(icalUrls));
    }

    const fetchAndProcessEvents = async () => {
      setIsLoading(true);
      setError(null);
      
      if (icalUrls.length === 0) {
        setAllEvents([]); 
        setIsLoading(false);
        return;
      }
      
      const results = await Promise.allSettled(
        icalUrls.map(url => processIcalFeed({ icalUrl: url }))
      );

      const fetchedEventsStrings: AppCalendarEvent[] = [];
      let hasErrors = false;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          fetchedEventsStrings.push(...result.value);
        } else {
          console.error(`Error fetching/processing iCal feed ${icalUrls[index]}:`, result.reason);
          const shortUrl = icalUrls[index].length > 30 ? `${icalUrls[index].substring(0,30)}...` : icalUrls[index];
          setError(prevError => prevError ? `${prevError}, Failed to load ${shortUrl}` : `Failed to load ${shortUrl}`);
          hasErrors = true;
        }
      });
      
      if (hasErrors) {
        toast({
          title: "Error Loading Feeds",
          description: "Some iCalendar feeds could not be loaded. Please check URLs.",
          variant: "destructive",
        });
      }

      const parsedAndSortedEvents = parseEventDatesAndSort(fetchedEventsStrings);
      setAllEvents(parsedAndSortedEvents); 
      setIsLoading(false);
    };

    fetchAndProcessEvents();
  }, [icalUrls]);

  const handleAddIcalUrl = async (e: FormEvent) => {
    e.preventDefault();
    if (newIcalUrl && !icalUrls.includes(newIcalUrl) && icalUrls.length < MAX_ICAL_FEEDS) {
      if (!newIcalUrl.toLowerCase().endsWith('.ics') && !newIcalUrl.toLowerCase().startsWith('webcal://') && !newIcalUrl.toLowerCase().startsWith('http://') && !newIcalUrl.toLowerCase().startsWith('https://')) {
         toast({
          title: "Invalid URL",
          description: "Please enter a valid iCalendar URL (ending in .ics, or starting with webcal://, http://, or https://).",
          variant: "destructive",
        });
        return;
      }
      setIcalUrls(prev => [...prev, newIcalUrl]);
      setNewIcalUrl('');
    } else if (icalUrls.length >= MAX_ICAL_FEEDS) {
        toast({
          title: "Feed Limit Reached",
          description: `You can add a maximum of ${MAX_ICAL_FEEDS} iCalendar feeds.`,
          variant: "destructive",
        });
    }
  };

  const handleRemoveIcalUrl = (urlToRemove: string) => {
    setIcalUrls(prev => prev.filter(url => url !== urlToRemove));
  };
  
  const upcomingEvents = allEvents
    .filter(event => event.startTime >= new Date(new Date().setHours(0,0,0,0))) 
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
        <SectionTitle icon={CalendarDays} title="Upcoming Events" />
      </CardHeader>
      <CardContent className="px-4 py-0 flex-grow overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 pr-3">
          {isLoading && <p className="text-sm text-muted-foreground p-2">Loading events...</p>}
          {!isLoading && error && <p className="text-sm text-destructive p-2">{error}</p>}
          {!isLoading && !error && upcomingEvents.length === 0 && (
             <p className="text-sm text-muted-foreground p-2">No upcoming events. Add an iCal feed below.</p>
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
      <Separator className="mx-4" />
      <CardFooter className="px-4 pt-3 pb-4 flex-col items-start">
        <form onSubmit={handleAddIcalUrl} className="flex gap-2 w-full">
          <Input
            type="url"
            placeholder="Add iCal feed URL (.ics or webcal://)"
            value={newIcalUrl}
            onChange={(e) => setNewIcalUrl(e.target.value)}
            className="h-9 text-xs"
            disabled={icalUrls.length >= MAX_ICAL_FEEDS}
          />
          <Button type="submit" size="sm" variant="outline" className="h-9" disabled={icalUrls.length >= MAX_ICAL_FEEDS || !newIcalUrl}>
            <PlusCircle className="w-4 h-4" />
          </Button>
        </form>
        {icalUrls.length > 0 && (
          <div className="w-full space-y-1 mt-3">
            <p className="text-xs text-muted-foreground">Active Feeds ({icalUrls.length}/{MAX_ICAL_FEEDS}):</p>
            <ScrollArea className="h-auto max-h-[60px]">
            {icalUrls.map(url => (
              <div key={url} className="flex items-center justify-between text-xs bg-muted/50 p-1.5 rounded-sm">
                <div className="flex items-center space-x-1 truncate">
                  <LinkIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate" title={url}>{url}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveIcalUrl(url)}>
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            ))}
            </ScrollArea>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
