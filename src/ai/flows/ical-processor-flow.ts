
'use server';
/**
 * @fileOverview A Genkit flow to fetch and parse iCalendar (iCal) feeds using ical.js.
 *
 * - processIcalFeed - Fetches and parses an iCal feed URL, returning calendar events.
 * - IcalProcessorInput - The input type for the processIcalFeed function.
 * - IcalProcessorOutput - The return type for the processIcalFeed function (array of CalendarEvent).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { CalendarEvent } from '@/lib/types';
import ICAL from 'ical.js';

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
      const response = await fetch(icalUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch iCal feed: ${response.statusText}`);
      }
      const icalString = await response.text();
      const jcalData = ICAL.parse(icalString);
      const calendarComponent = new ICAL.Component(jcalData);
      const vevents = calendarComponent.getAllSubcomponents('vevent');
      
      const processedEvents: CalendarEvent[] = [];
      const feedColor = assignColor();

      for (const veventComponent of vevents) {
        const event = new ICAL.Event(veventComponent);

        if (event.summary && event.startDate) {
          const startTime = event.startDate.toJSDate();
          let endTime = event.endDate ? event.endDate.toJSDate() : new Date(startTime);

          const isAllDay = event.startDate.isDate;

          if (isAllDay) {
            // For all-day events, ical.js endDate is often the start of the next day.
            // Adjust to be the end of the current day for consistency.
            // Ensure startTime is at the beginning of the day for all-day events.
            startTime.setHours(0, 0, 0, 0);

            if (endTime.getTime() > startTime.getTime() && 
                endTime.getHours() === 0 && 
                endTime.getMinutes() === 0 && 
                endTime.getSeconds() === 0) {
              endTime = new Date(endTime.getTime() - 1); // Set to 23:59:59.999 of the previous day
            } else if (endTime.getTime() === startTime.getTime()) {
              // If it's an all-day event and end time is same as start, set end to end of day.
               endTime = new Date(startTime);
               endTime.setHours(23, 59, 59, 999);
            }
          }
          
          const organizerProp = veventComponent.getFirstProperty('organizer');
          let calendarSource = icalUrl;
          if (organizerProp) {
            const cnParam = organizerProp.getParameter('cn');
            if (cnParam) {
              calendarSource = cnParam;
            } else if (organizerProp.getValues().length > 0) {
              calendarSource = String(organizerProp.getValues()[0]);
               // Basic check for mailto link, remove it
              if (calendarSource.toLowerCase().startsWith('mailto:')) {
                calendarSource = calendarSource.substring(7);
              }
            }
          }


          processedEvents.push({
            id: `${icalUrl}-${event.uid || event.startDate.toUnixTime()}`, // Ensure unique ID
            title: String(event.summary || 'Untitled Event'),
            startTime: startTime,
            endTime: endTime,
            calendarSource: calendarSource,
            color: feedColor, 
            isAllDay: isAllDay,
          });
        }
      }
      return processedEvents;
    } catch (error) {
      console.error(`Error processing iCal feed ${icalUrl} with ical.js:`, error);
      return []; 
    }
  }
);
