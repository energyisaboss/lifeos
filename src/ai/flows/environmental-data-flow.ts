
'use server';
/**
 * @fileOverview A Genkit flow to fetch environmental data from OpenWeatherMap
 * using the Current Weather and 5-Day Forecast APIs.
 *
 * - getEnvironmentalData - Fetches current weather and a 5-day forecast.
 * - EnvironmentalDataInput - Input schema (latitude, longitude).
 * - EnvironmentalDataOutput - Output schema based on src/lib/types.ts.
 *   UV Index and Moon Phase are optional as they are not reliably available
 *   from these basic OpenWeatherMap APIs.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { EnvironmentalData as AppEnvironmentalData, WeatherDay } from '@/lib/types';
import { format, parseISO } from 'date-fns';

const EnvironmentalDataInputSchema = z.object({
  latitude: z.number().describe('Latitude for the location.'),
  longitude: z.number().describe('Longitude for the location.'),
});
export type EnvironmentalDataInput = z.infer<typeof EnvironmentalDataInputSchema>;

const WeatherDaySchema = z.object({
  day: z.string(),
  iconName: z.string().describe('Identifier for the weather icon (e.g., Lucide icon name).'),
  tempHigh: z.number(),
  tempLow: z.number(),
  rainPercentage: z.number(),
});

const EnvironmentalDataOutputSchema = z.object({
  locationName: z.string().optional().describe('Name of the location/city.'),
  moonPhase: z.optional(z.object({ // Made optional
    name: z.string(),
    iconName: z.string().describe('Identifier for the moon icon.'),
  })),
  uvIndex: z.optional(z.object({ // Made optional
    value: z.number(),
    description: z.string(),
  })),
  currentWeather: z.object({
    temp: z.number(),
    description: z.string(),
    iconName: z.string().describe('Identifier for the current weather icon.'),
    humidity: z.number(),
    windSpeed: z.number(),
  }),
  weeklyWeather: z.array(WeatherDaySchema),
});
export type EnvironmentalDataOutput = z.infer<typeof EnvironmentalDataOutputSchema>;


function mapOwmIconToLucideName(owmIcon: string): string {
  if (owmIcon.startsWith('01')) return 'Sun';
  if (owmIcon.startsWith('02')) return 'CloudSun';
  if (owmIcon.startsWith('03')) return 'Cloud';
  if (owmIcon.startsWith('04')) return 'Cloudy';
  if (owmIcon.startsWith('09')) return 'CloudDrizzle';
  if (owmIcon.startsWith('10')) return 'CloudRain';
  if (owmIcon.startsWith('11')) return 'CloudLightning';
  if (owmIcon.startsWith('13')) return 'CloudSnow';
  if (owmIcon.startsWith('50')) return 'CloudFog';
  return 'Cloud'; // default
}

export async function getEnvironmentalData(input: EnvironmentalDataInput): Promise<EnvironmentalDataOutput> {
  return environmentalDataFlow(input);
}

const environmentalDataFlow = ai.defineFlow(
  {
    name: 'environmentalDataFlow',
    inputSchema: EnvironmentalDataInputSchema,
    outputSchema: EnvironmentalDataOutputSchema,
  },
  async ({ latitude, longitude }) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenWeatherMap API key is not configured in .env.OPENWEATHER_API_KEY');
    }

    const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;

    try {
      const [currentWeatherResponse, forecastResponse] = await Promise.all([
        fetch(currentWeatherUrl),
        fetch(forecastUrl),
      ]);

      if (!currentWeatherResponse.ok) {
        const errorBody = await currentWeatherResponse.text();
        console.error("OpenWeatherMap Current Weather API Error:", currentWeatherResponse.status, errorBody);
        throw new Error(`Failed to fetch current weather data: ${currentWeatherResponse.statusText} - ${errorBody}`);
      }
      const currentData = await currentWeatherResponse.json();

      if (!forecastResponse.ok) {
        const errorBody = await forecastResponse.text();
        console.error("OpenWeatherMap Forecast API Error:", forecastResponse.status, errorBody);
        throw new Error(`Failed to fetch forecast data: ${forecastResponse.statusText} - ${errorBody}`);
      }
      const forecastData = await forecastResponse.json();

      // Process current weather
      const currentWeatherData = {
        temp: Math.round(currentData.main.temp),
        description: currentData.weather[0].description,
        iconName: mapOwmIconToLucideName(currentData.weather[0].icon),
        humidity: currentData.main.humidity,
        windSpeed: Math.round(currentData.wind.speed * 3.6), // m/s to km/h
      };
      const locationName = currentData.name;

      // Process 5-day forecast (aggregate from 3-hour intervals)
      const dailyForecasts: { [key: string]: { temps: number[], pops: number[], icons: string[] } } = {};
      
      forecastData.list.forEach((item: any) => {
        const date = format(parseISO(item.dt_txt.substring(0,10)), 'yyyy-MM-dd'); // group by date
        if (!dailyForecasts[date]) {
          dailyForecasts[date] = { temps: [], pops: [], icons: [] };
        }
        dailyForecasts[date].temps.push(item.main.temp_min, item.main.temp_max);
        dailyForecasts[date].pops.push(item.pop || 0); // Probability of precipitation
        
        // Store icon for midday or first available if midday not present
        const hour = parseISO(item.dt_txt).getHours();
        if (hour >= 11 && hour <= 14) { // Prefer icons around midday
             if (!dailyForecasts[date].icons.find(i => i === item.weather[0].icon)) { // Prioritize midday
                dailyForecasts[date].icons.unshift(item.weather[0].icon); // Add to front
             }
        } else {
             dailyForecasts[date].icons.push(item.weather[0].icon);
        }
      });

      const weeklyWeather: WeatherDay[] = Object.keys(dailyForecasts)
        .slice(0, 7) // Take up to 7 days
        .map(dateStr => {
          const dayData = dailyForecasts[dateStr];
          const tempLow = Math.round(Math.min(...dayData.temps));
          const tempHigh = Math.round(Math.max(...dayData.temps));
          const rainPercentage = Math.round(Math.max(...dayData.pops) * 100);
          // Use the first icon (prioritized for midday) or the most frequent if logic was more complex
          const representativeIcon = dayData.icons[0] || (dayData.icons.length > 0 ? dayData.icons[0] : '03d'); 

          return {
            day: format(parseISO(dateStr), 'EEE'),
            iconName: mapOwmIconToLucideName(representativeIcon),
            tempHigh,
            tempLow,
            rainPercentage,
          };
        });

      // UV Index and Moon Phase are not available from these APIs.
      // They will be undefined, and the schema allows for this.
      return {
        locationName,
        currentWeather: currentWeatherData,
        weeklyWeather,
        // uvIndex and moonPhase will be implicitly undefined
      };

    } catch (error) {
      console.error('Error in environmentalDataFlow:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check for specific API key related messages from OpenWeatherMap
      if (errorMessage.toLowerCase().includes("invalid api key") || errorMessage.includes("401")) {
           throw new Error(`Failed to process environmental data: Unauthorized or Invalid API Key. Please check your OpenWeatherMap API key and ensure it's active for the required services. Original error: ${errorMessage}`);
      }
      throw new Error(`Failed to process environmental data: ${errorMessage}`);
    }
  }
);
