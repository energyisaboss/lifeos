
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
import type { CalendarEvent as AppCalendarEvent } from '@/lib/types';
import ICAL from 'ical.js';

const IcalProcessorInputSchema = z.object({
  icalUrl: z.string().url().describe('The URL of the iCalendar (.ics) feed.'),
  label: z.string().optional().describe('An optional label for the calendar feed.'),
});
export type IcalProcessorInput = z.infer<typeof IcalProcessorInputSchema>;

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
  async ({ icalUrl, label: feedLabelInput }) => {
    try {
      const response = await fetch(icalUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch iCal feed: ${response.statusText}`);
      }
      const icalString = await response.text();
      const jcalData = ICAL.parse(icalString);
      const calendarComponent = new ICAL.Component(jcalData);
      const vevents = calendarComponent.getAllSubcomponents('vevent');
      
      const processedEvents: AppCalendarEvent[] = [];
      const feedColor = assignColor();

      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      const expansionEndDate = new Date(today);
      expansionEndDate.setDate(today.getDate() + 30); // Expand for the next 30 days

      for (const veventComponent of vevents) {
        const event = new ICAL.Event(veventComponent);
        const originalSummary = String(event.summary || 'Untitled Event');
        const originalUid = event.uid || event.startDate?.toUnixTime().toString() || Math.random().toString();

        let derivedCalendarSource = icalUrl; // Default
        const organizerProp = veventComponent.getFirstProperty('organizer');
        if (organizerProp) {
          const cnParam = organizerProp.getParameter('cn');
          if (cnParam) {
            derivedCalendarSource = cnParam;
          } else if (organizerProp.getValues().length > 0) {
            const mailto = String(organizerProp.getValues()[0]);
            if (mailto.toLowerCase().startsWith('mailto:')) {
              derivedCalendarSource = mailto.substring(7);
            } else {
              derivedCalendarSource = mailto;
            }
          }
        }
        
        const finalCalendarSource = feedLabelInput || derivedCalendarSource;

        const processEventInstance = (
            instanceStartTime: ICAL.Time, 
            instanceEndTime: ICAL.Time, 
            instanceSummary: string,
            instanceUid: string,
            recurrenceIdStr?: string
        ) => {
            let startTimeDate = instanceStartTime.toJSDate();
            let endTimeDate = instanceEndTime.toJSDate();
            const isAllDay = instanceStartTime.isDate;

            if (isAllDay) {
              startTimeDate.setHours(0, 0, 0, 0);
              if (endTimeDate.getTime() > startTimeDate.getTime() && 
                  endTimeDate.getHours() === 0 && 
                  endTimeDate.getMinutes() === 0 && 
                  endTimeDate.getSeconds() === 0 &&
                  endTimeDate.getMilliseconds() === 0) {
                endTimeDate = new Date(endTimeDate.getTime() - 1); 
              } else if (endTimeDate.getTime() === startTimeDate.getTime()) {
                 endTimeDate = new Date(startTimeDate);
                 endTimeDate.setHours(23, 59, 59, 999);
              } else if (endTimeDate.getHours() === 0 && endTimeDate.getMinutes() === 0 && endTimeDate.getSeconds() === 0 && endTimeDate.getMilliseconds() === 0) {
                 endTimeDate = new Date(endTimeDate.getTime() -1);
              }
            }
            
            if (endTimeDate < today || startTimeDate >= expansionEndDate) {
              return; 
            }

            processedEvents.push({
              id: recurrenceIdStr ? `${icalUrl}-${instanceUid}-${recurrenceIdStr}` : `${icalUrl}-${instanceUid}`,
              title: instanceSummary,
              startTime: startTimeDate.toISOString(),
              endTime: endTimeDate.toISOString(),
              calendarSource: finalCalendarSource,
              color: feedColor,
              isAllDay: isAllDay,
            });
        };

        if (event.isRecurring()) {
          const iterator = event.iterator();
          let nextOccurrenceTime: ICAL.Time | null;

          while ((nextOccurrenceTime = iterator.next()) && nextOccurrenceTime.toJSDate() < expansionEndDate) {
            if (nextOccurrenceTime.toJSDate() >= today || event.endDate?.toJSDate() >= today) { 
              const occurrenceDetails = event.getOccurrenceDetails(nextOccurrenceTime);
              processEventInstance(
                occurrenceDetails.startDate,
                occurrenceDetails.endDate,
                String(occurrenceDetails.item.summary || originalSummary),
                originalUid, 
                occurrenceDetails.recurrenceId.toJSDate().toISOString() 
              );
            }
          }
        } else if (event.startDate) { 
            processEventInstance(
                event.startDate,
                event.endDate || event.startDate, 
                originalSummary,
                originalUid
            );
        }
      }
      return processedEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    } catch (error) {
      console.error(`Error processing iCal feed ${icalUrl} with ical.js:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to process iCal feed ${icalUrl}: ${errorMessage}`);
    }
  }
);
