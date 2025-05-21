
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
// Note: CalendarEvent type will now have string dates, matching the schema
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types';
import ICAL from 'ical.js';

const IcalProcessorInputSchema = z.object({
  icalUrl: z.string().url().describe('The URL of the iCalendar (.ics) feed.'),
});
export type IcalProcessorInput = z.infer<typeof IcalProcessorInputSchema>;

// Define a Zod schema for CalendarEvent to be used in the flow output
// This schema expects ISO date strings
const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string().datetime({ offset: true }).describe("Start time in ISO 8601 format"),
  endTime: z.string().datetime({ offset: true }).describe("End time in ISO 8601 format"),
  calendarSource: z.string(),
  color: z.string(),
  isAllDay: z.boolean().optional(),
});
const IcalProcessorOutputSchema = z.array(CalendarEventSchema);
// This type will be z.infer<typeof IcalProcessorOutputSchema>, which has string dates
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
      
      const processedEvents: IcalProcessorOutput = []; // Type matches schema (string dates)
      const feedColor = assignColor();

      for (const veventComponent of vevents) {
        const event = new ICAL.Event(veventComponent);

        if (event.summary && event.startDate) {
          let startTimeDate = event.startDate.toJSDate();
          let endTimeDate = event.endDate ? event.endDate.toJSDate() : new Date(startTimeDate);

          const isAllDay = event.startDate.isDate;

          if (isAllDay) {
            startTimeDate.setHours(0, 0, 0, 0);
            if (endTimeDate.getTime() > startTimeDate.getTime() && 
                endTimeDate.getHours() === 0 && 
                endTimeDate.getMinutes() === 0 && 
                endTimeDate.getSeconds() === 0) {
              endTimeDate = new Date(endTimeDate.getTime() - 1); 
            } else if (endTimeDate.getTime() === startTimeDate.getTime()) {
               endTimeDate = new Date(startTimeDate);
               endTimeDate.setHours(23, 59, 59, 999);
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
              if (calendarSource.toLowerCase().startsWith('mailto:')) {
                calendarSource = calendarSource.substring(7);
              }
            }
          }

          processedEvents.push({
            id: `${icalUrl}-${event.uid || event.startDate.toUnixTime()}`,
            title: String(event.summary || 'Untitled Event'),
            startTime: startTimeDate.toISOString(), // Convert to ISO string
            endTime: endTimeDate.toISOString(),     // Convert to ISO string
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
