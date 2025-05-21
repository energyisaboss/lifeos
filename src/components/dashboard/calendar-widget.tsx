
"use client";

import React, { useState, useEffect, FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { CalendarDays, LinkIcon, PlusCircle, Trash2, Pencil, Check, XCircle } from 'lucide-react';
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { processIcalFeed } from '@/ai/flows/ical-processor-flow';
import { format } from 'date-fns';
import { Separator } from '../ui/separator';
import { toast } from '@/hooks/use-toast';

const MAX_ICAL_FEEDS = 3;

interface IcalFeedItem {
  id: string;
  url: string;
  label: string;
}

interface ParsedCalendarEvent extends Omit<AppCalendarEvent, 'startTime' | 'endTime'> {
  startTime: Date;
  endTime: Date;
}

export function CalendarWidget() {
  const [icalFeeds, setIcalFeeds] = useState<IcalFeedItem[]>(() => {
    if (typeof window !== 'undefined') {
      const savedFeeds = localStorage.getItem('icalFeeds');
      try {
        const parsed = savedFeeds ? JSON.parse(savedFeeds) : [];
        return Array.isArray(parsed) ? parsed.map(item => ({
          id: item.id || Date.now().toString() + Math.random(),
          url: item.url || '',
          label: item.label || item.url || 'Unnamed Feed',
        })).filter(item => item.url) : [];
      } catch (e) {
        console.error("Failed to parse iCal feeds from localStorage", e);
        return [];
      }
    }
    return [];
  });
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [newIcalLabel, setNewIcalLabel] = useState('');
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);

  const [allEvents, setAllEvents] = useState<ParsedCalendarEvent[]>([]);
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
      localStorage.setItem('icalFeeds', JSON.stringify(icalFeeds));
    }

    const fetchAndProcessEvents = async () => {
      setIsLoading(true);
      setError(null);
      
      if (icalFeeds.length === 0) {
        setAllEvents([]); 
        setIsLoading(false);
        return;
      }
      
      const results = await Promise.allSettled(
        icalFeeds.map(feed => processIcalFeed({ icalUrl: feed.url, label: feed.label }))
      );

      const fetchedEventsStrings: AppCalendarEvent[] = [];
      let hasErrors = false;
      results.forEach((result, index) => {
        const feed = icalFeeds[index];
        if (result.status === 'fulfilled') {
          fetchedEventsStrings.push(...result.value);
        } else {
          console.error(`Error fetching/processing iCal feed ${feed.label} (${feed.url}):`, result.reason);
          setError(prevError => prevError ? `${prevError}, Failed to load ${feed.label}` : `Failed to load ${feed.label}`);
          hasErrors = true;
        }
      });
      
      if (hasErrors) {
        toast({
          title: "Error Loading Feeds",
          description: "Some iCalendar feeds could not be loaded. Please check URLs and labels.",
          variant: "destructive",
        });
      }

      const parsedAndSortedEvents = parseEventDatesAndSort(fetchedEventsStrings);
      setAllEvents(parsedAndSortedEvents); 
      setIsLoading(false);
    };

    fetchAndProcessEvents();
  }, [icalFeeds]);

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newIcalUrl.trim()) {
      toast({ title: "URL Required", description: "Please enter an iCal feed URL.", variant: "destructive" });
      return;
    }
     if (!newIcalUrl.toLowerCase().endsWith('.ics') && !newIcalUrl.toLowerCase().startsWith('webcal://') && !newIcalUrl.toLowerCase().startsWith('http://') && !newIcalUrl.toLowerCase().startsWith('https://')) {
       toast({
        title: "Invalid URL",
        description: "Please enter a valid iCalendar URL (ending in .ics, or starting with webcal://, http://, or https://).",
        variant: "destructive",
      });
      return;
    }

    const feedLabel = newIcalLabel.trim() || newIcalUrl;

    if (editingFeedId) {
      setIcalFeeds(prevFeeds => 
        prevFeeds.map(feed => 
          feed.id === editingFeedId ? { ...feed, url: newIcalUrl, label: feedLabel } : feed
        )
      );
      toast({ title: "Feed Updated", description: `Feed "${feedLabel}" has been updated.` });
      setEditingFeedId(null);
    } else {
      if (icalFeeds.length >= MAX_ICAL_FEEDS) {
        toast({
          title: "Feed Limit Reached",
          description: `You can add a maximum of ${MAX_ICAL_FEEDS} iCalendar feeds.`,
          variant: "destructive",
        });
        return;
      }
      if (icalFeeds.some(feed => feed.url === newIcalUrl && feed.label === feedLabel)) {
        toast({ title: "Feed Exists", description: "This iCal feed URL and label combination has already been added.", variant: "destructive" });
        return;
      }
      setIcalFeeds(prev => [...prev, { id: Date.now().toString(), url: newIcalUrl, label: feedLabel }]);
      toast({ title: "Feed Added", description: `Feed "${feedLabel}" has been added.` });
    }
    setNewIcalUrl('');
    setNewIcalLabel('');
  };

  const handleRemoveIcalFeed = (idToRemove: string) => {
    setIcalFeeds(prev => prev.filter(feed => feed.id !== idToRemove));
    if (editingFeedId === idToRemove) {
      setEditingFeedId(null);
      setNewIcalUrl('');
      setNewIcalLabel('');
    }
    toast({ title: "Feed Removed", description: "The iCal feed has been removed." });
  };

  const startEditFeed = (feedToEdit: IcalFeedItem) => {
    setEditingFeedId(feedToEdit.id);
    setNewIcalUrl(feedToEdit.url);
    setNewIcalLabel(feedToEdit.label);
  };

  const cancelEditFeed = () => {
    setEditingFeedId(null);
    setNewIcalUrl('');
    setNewIcalLabel('');
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

  const isAddDisabled = !editingFeedId && (icalFeeds.length >= MAX_ICAL_FEEDS || !newIcalUrl.trim());
  const isSaveDisabled = !!editingFeedId && !newIcalUrl.trim();


  return (
    <Card className="shadow-lg flex flex-col h-full">
      <CardHeader>
        <SectionTitle icon={CalendarDays} title="Upcoming Events" />
      </CardHeader>
      <CardContent className="px-4 py-0 flex-grow overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 pr-3">
          {isLoading && <p className="text-sm text-muted-foreground p-2">Loading events...</p>}
          {!isLoading && error && <p className="text-sm text-destructive p-2">{error}</p>}
          {!isLoading && !error && upcomingEvents.length === 0 && icalFeeds.length === 0 && (
             <p className="text-sm text-muted-foreground p-2">No upcoming events. Add an iCal feed below.</p>
          )}
           {!isLoading && !error && upcomingEvents.length === 0 && icalFeeds.length > 0 && (
             <p className="text-sm text-muted-foreground p-2">No upcoming events from active feeds for the next 30 days.</p>
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
        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row gap-2 w-full items-start mt-2">
          <Input
            type="text"
            placeholder="Label (e.g., Work)"
            value={newIcalLabel}
            onChange={(e) => setNewIcalLabel(e.target.value)}
            className="h-9 text-xs sm:flex-1"
            disabled={!editingFeedId && icalFeeds.length >= MAX_ICAL_FEEDS}
          />
          <div className="flex gap-2 w-full sm:w-auto">
            <Input
              type="url"
              placeholder="iCal feed URL (.ics or webcal://)"
              value={newIcalUrl}
              onChange={(e) => setNewIcalUrl(e.target.value)}
              className="h-9 text-xs flex-grow"
              disabled={!editingFeedId && icalFeeds.length >= MAX_ICAL_FEEDS}
              required
            />
            {editingFeedId ? (
              <>
                <Button type="submit" size="sm" variant="outline" className="h-9" disabled={isSaveDisabled}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-9" onClick={cancelEditFeed}>
                  <XCircle className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button type="submit" size="sm" variant="outline" className="h-9" disabled={isAddDisabled}>
                <PlusCircle className="w-4 h-4" />
              </Button>
            )}
          </div>
        </form>
        {icalFeeds.length > 0 && (
          <div className="w-full space-y-1 mt-3">
            <p className="text-xs text-muted-foreground">Active Feeds ({icalFeeds.length}/{MAX_ICAL_FEEDS}):</p>
            <ScrollArea className="h-auto max-h-[70px] pr-1">
            {icalFeeds.map(feed => (
              <div key={feed.id} className="flex w-full items-center text-xs bg-muted/50 p-1.5 rounded-sm mb-1 last:mb-0">
                <span className="font-medium truncate mr-1.5" title={feed.label}>
                  {feed.label}
                </span>
                <LinkIcon className="w-3 h-3 text-muted-foreground flex-shrink-0 mr-1.5" />
                <span className="text-muted-foreground truncate flex-1 min-w-0 mr-1.5" title={feed.url}>
                  {feed.url}
                </span>
                <div className="flex items-center flex-shrink-0 space-x-1">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => startEditFeed(feed)}>
                    <Pencil className="w-3 h-3 text-primary" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveIcalFeed(feed.id)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            </ScrollArea>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
    

      