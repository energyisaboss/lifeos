"use client";

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { CalendarDays } from 'lucide-react';
import type { CalendarEvent } from '@/lib/types';
import { mockCalendarEvents } from '@/lib/mock-data';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

export function CalendarWidget() {
  // Filter for today and future events, sort them
  const upcomingEvents: CalendarEvent[] = mockCalendarEvents
    .filter(event => event.startTime >= new Date(new Date().setHours(0,0,0,0)))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, 10); // Limit to 10 upcoming events

  const formatEventTime = (event: CalendarEvent) => {
    if (event.isAllDay) return "All Day";
    const start = format(event.startTime, 'p');
    const end = format(event.endTime, 'p');
    if (start === end && event.startTime.toDateString() === event.endTime.toDateString()) return start; // If start and end are same, just show start
    return `${start} - ${end}`;
  };
  
  const formatEventDate = (event: CalendarEvent) => {
    return format(event.startTime, 'EEE, MMM d');
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <SectionTitle icon={CalendarDays} title="Upcoming Events" />
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[250px] pr-3">
          {upcomingEvents.length > 0 ? (
            <ul className="space-y-3">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-start space-x-3 pb-2 border-b border-border last:border-b-0">
                  <div className="flex-shrink-0 w-2 h-6 mt-1 rounded-full" style={{ backgroundColor: event.color }} />
                  <div>
                    <p className="font-medium text-card-foreground">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{formatEventDate(event)} - {formatEventTime(event)}</p>
                    <p className="text-xs text-muted-foreground italic">{event.calendarSource}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming events.</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
