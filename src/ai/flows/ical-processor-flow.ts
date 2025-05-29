
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
  color: z.string().optional().describe('An optional hex color string for events from this feed (e.g., #FF0000).'),
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

const predefinedHexColors = [
  '#F44336', // Red
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#FFEB3B', // Yellow
  '#4CAF50', // Green
  '#9C27B0', // Purple
];
let colorIndex = 0;

const assignColor = (): string => {
  const color = predefinedHexColors[colorIndex % predefinedHexColors.length];
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
  async ({ icalUrl, label: feedLabelInput, color: feedColorInput }) => {
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
      const finalFeedColor = (feedColorInput && /^#([0-9A-F]{3}){1,2}$/i.test(feedColorInput)) ? feedColorInput : assignColor();


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
                // For multi-day all-day events, ical.js often sets the end date to midnight of the day *after* the event.
                // To make it inclusive, subtract one millisecond.
                endTimeDate = new Date(endTimeDate.getTime() - 1); 
              } else if (endTimeDate.getTime() === startTimeDate.getTime()) {
                 // Single all-day event, make it span the whole day
                 endTimeDate = new Date(startTimeDate);
                 endTimeDate.setHours(23, 59, 59, 999);
              } else if (endTimeDate.getHours() === 0 && endTimeDate.getMinutes() === 0 && endTimeDate.getSeconds() === 0 && endTimeDate.getMilliseconds() === 0) {
                 // If it ends exactly at midnight, make it end of previous day
                 endTimeDate = new Date(endTimeDate.getTime() -1);
              }
            }
            
            // Filter out events that have already passed or are too far in the future
            if (endTimeDate < today || startTimeDate >= expansionEndDate) {
              return; 
            }

            processedEvents.push({
              id: recurrenceIdStr ? `${icalUrl}-${instanceUid}-${recurrenceIdStr}` : `${icalUrl}-${instanceUid}`,
              title: instanceSummary,
              startTime: startTimeDate.toISOString(),
              endTime: endTimeDate.toISOString(),
              calendarSource: finalCalendarSource,
              color: finalFeedColor, 
              isAllDay: isAllDay,
            });
        };

        if (event.isRecurring()) {
          const iterator = event.iterator();
          let nextOccurrenceTime: ICAL.Time | null;

          while ((nextOccurrenceTime = iterator.next()) && nextOccurrenceTime.toJSDate() < expansionEndDate) {
            // Only process occurrences that are not fully in the past
            if (nextOccurrenceTime.toJSDate() >= today || event.endDate?.toJSDate() >= today) { 
              const occurrenceDetails = event.getOccurrenceDetails(nextOccurrenceTime);
              processEventInstance(
                occurrenceDetails.startDate,
                occurrenceDetails.endDate,
                String(occurrenceDetails.item.summary || originalSummary), // Use item's summary if available (for overridden recurrences)
                originalUid, // Use original event UID for linking
                occurrenceDetails.recurrenceId.toJSDate().toISOString() // Use recurrence ID for uniqueness
              );
            }
          }
        } else if (event.startDate) { // Handle non-recurring events
            processEventInstance(
                event.startDate,
                event.endDate || event.startDate, // If no end date, assume it's same as start
                originalSummary,
                originalUid
            );
        }
      }
      return processedEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    } catch (error) {
      console.error(`Error processing iCal feed ${icalUrl} with ical.js:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      // It's better to throw an error that Genkit can understand, or handle it gracefully
      throw new Error(`Failed to process iCal feed ${icalUrl}: ${errorMessage}`);
    }
  }
);

