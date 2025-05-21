
'use server';
/**
 * @fileOverview A Genkit flow to fetch and parse iCalendar (iCal) feeds.
 *
 * - processIcalFeed - Fetches and parses an iCal feed URL, returning calendar events.
 * - IcalProcessorInput - The input type for the processIcalFeed function.
 * - IcalProcessorOutput - The return type for the processIcalFeed function (array of CalendarEvent).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { CalendarEvent } from '@/lib/types';
import ical from 'node-ical';

const IcalProcessorInputSchema = z.object({
  icalUrl: z.string().url().describe('The URL of the iCalendar (.ics) feed.'),
});
export type IcalProcessorInput = z.infer<typeof IcalProcessorInputSchema>;

// Define a Zod schema for CalendarEvent to be used in the flow output
const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.date(),
  endTime: z.date(),
  calendarSource: z.string(),
  color: z.string(),
  isAllDay: z.boolean().optional(),
});
const IcalProcessorOutputSchema = z.array(CalendarEventSchema);
export type IcalProcessorOutput = z.infer<typeof IcalProcessorOutputSchema>;

const predefinedColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
];
let colorIndex = 0;

const assignColor = (): string => {
  const color = predefinedColors[colorIndex % predefinedColors.length];
  colorIndex++;
  return color;
};


export async function processIcalFeed(input: IcalProcessorInput): Promise<IcalProcessorOutput> {
  return icalProcessorFlow(input);
}

const icalProcessorFlow = ai.defineFlow(
  {
    name: 'icalProcessorFlow',
    inputSchema: IcalProcessorInputSchema,
    outputSchema: IcalProcessorOutputSchema,
  },
  async ({ icalUrl }) => {
    try {
      const eventsRaw = await ical.async.fromURL(icalUrl);
      const processedEvents: CalendarEvent[] = [];
      const feedColor = assignColor(); // Assign a consistent color for this feed

      for (const key in eventsRaw) {
        if (eventsRaw.hasOwnProperty(key)) {
          const event = eventsRaw[key];
          if (event.type === 'VEVENT' && event.start && event.summary) {
            // Basic check for essential fields
            const startTime = new Date(event.start);
            // End time might not always be present, or might be same as start for 0-duration
            // Or for all-day events, end might be the start of the next day.
            // node-ical usually makes event.end a Date object if it exists.
            let endTime = event.end ? new Date(event.end) : new Date(startTime);

            // Handle all-day events: node-ical sets datetype to 'date'
            // and typically start time to 00:00:00 and end time to 00:00:00 of the next day
            // or sometimes end time is not present or same as start.
            // A common convention for full-day events is that the time part is 00:00:00.
            const isAllDay = event.datetype === 'date' || 
                             (startTime.getHours() === 0 && startTime.getMinutes() === 0 && startTime.getSeconds() === 0 &&
                              endTime.getHours() === 0 && endTime.getMinutes() === 0 && endTime.getSeconds() === 0 &&
                              (endTime.getTime() > startTime.getTime() || event.summary.toLowerCase().includes('all day')));
            
            if (isAllDay && endTime.getTime() === startTime.getTime()) {
              // If it's an all-day event and end time is same as start, set end to end of day.
              endTime = new Date(startTime);
              endTime.setHours(23, 59, 59, 999);
            } else if (isAllDay && endTime.getTime() > startTime.getTime() && endTime.getHours() === 0 && endTime.getMinutes() === 0) {
                // If end time is start of next day, adjust to end of current day for simpler rendering
                endTime = new Date(endTime.getTime() - 1); 
            }


            // If it's a multi-day all-day event, endTime might be days later at 00:00.
            // Our current component might not render multi-day all-day events spanning across midnight perfectly,
            // but this parsing is a good start.

            processedEvents.push({
              id: `${icalUrl}-${event.uid || key}`, // Ensure unique ID by prefixing with URL
              title: String(event.summary || 'Untitled Event'),
              startTime: startTime,
              endTime: endTime,
              calendarSource: event.organizer ? (typeof event.organizer === 'string' ? event.organizer : event.organizer.params?.CN || icalUrl) : icalUrl,
              color: feedColor, 
              isAllDay: isAllDay,
            });
          }
        }
      }
      return processedEvents;
    } catch (error) {
      console.error(`Error processing iCal feed ${icalUrl}:`, error);
      // Return an empty array or throw a custom error to be handled by the client
      // For now, returning empty array on error to not break the whole widget if one feed fails.
      return []; 
    }
  }
);
