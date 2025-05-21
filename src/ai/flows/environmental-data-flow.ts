
'use server';
/**
 * @fileOverview A Genkit flow to fetch environmental data from OpenWeatherMap.
 *
 * - getEnvironmentalData - Fetches weather, UV index, and moon phase.
 * - EnvironmentalDataInput - Input schema (latitude, longitude).
 * - EnvironmentalDataOutput - Output schema based on src/lib/types.ts.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { EnvironmentalData as AppEnvironmentalData, WeatherDay } from '@/lib/types';
import { format } from 'date-fns';

const EnvironmentalDataInputSchema = z.object({
  latitude: z.number().describe('Latitude for the location.'),
  longitude: z.number().describe('Longitude for the location.'),
});
export type EnvironmentalDataInput = z.infer<typeof EnvironmentalDataInputSchema>;

// Mirrored from src/lib/types.ts, but without ReactNode for icons
const WeatherDaySchema = z.object({
  day: z.string(),
  iconName: z.string().describe('Identifier for the weather icon (e.g., Lucide icon name).'),
  tempHigh: z.number(),
  tempLow: z.number(),
  rainPercentage: z.number(),
});

const EnvironmentalDataOutputSchema = z.object({
  locationName: z.string().optional().describe('Name of the location/city.'),
  moonPhase: z.object({
    name: z.string(),
    iconName: z.string().describe('Identifier for the moon icon.'),
  }),
  uvIndex: z.object({
    value: z.number(),
    description: z.string(),
  }),
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
  // Basic mapping, can be expanded
  // OWM icons: https://openweathermap.org/weather-conditions#Weather-Condition-Codes-2
  // Lucide icons: https://lucide.dev/
  if (owmIcon.startsWith('01')) return 'Sun'; // clear sky
  if (owmIcon.startsWith('02')) return 'CloudSun'; // few clouds
  if (owmIcon.startsWith('03')) return 'Cloud'; // scattered clouds
  if (owmIcon.startsWith('04')) return 'Cloudy'; // broken clouds, overcast clouds
  if (owmIcon.startsWith('09')) return 'CloudDrizzle'; // shower rain
  if (owmIcon.startsWith('10')) return 'CloudRain'; // rain
  if (owmIcon.startsWith('11')) return 'CloudLightning'; // thunderstorm
  if (owmIcon.startsWith('13')) return 'CloudSnow'; // snow
  if (owmIcon.startsWith('50')) return 'CloudFog'; // mist / fog
  return 'Cloud'; // default
}

function getMoonPhaseDetails(phase: number): { name: string; iconName: string } {
  // Phase: 0=New Moon, 0.25=First Quarter, 0.5=Full Moon, 0.75=Last Quarter
  // 1 is also New Moon (cycle completes)
  if (phase === 0 || phase === 1) return { name: 'New Moon', iconName: 'Moon' }; // Could use a specific New Moon icon if available
  if (phase > 0 && phase < 0.25) return { name: 'Waxing Crescent', iconName: 'Moon' }; // Placeholder, specific icons needed
  if (phase === 0.25) return { name: 'First Quarter', iconName: 'Moon' };
  if (phase > 0.25 && phase < 0.5) return { name: 'Waxing Gibbous', iconName: 'Moon' };
  if (phase === 0.5) return { name: 'Full Moon', iconName: 'Moon' }; // Could use a specific Full Moon icon
  if (phase > 0.5 && phase < 0.75) return { name: 'Waning Gibbous', iconName: 'Moon' };
  if (phase === 0.75) return { name: 'Last Quarter', iconName: 'Moon' };
  if (phase > 0.75 && phase < 1) return { name: 'Waning Crescent', iconName: 'Moon' };
  return { name: 'Unknown', iconName: 'Moon' }; // Default
}

function getUviDescription(uvi: number): string {
  if (uvi <= 2) return 'Low';
  if (uvi <= 5) return 'Moderate';
  if (uvi <= 7) return 'High';
  if (uvi <= 10) return 'Very High';
  return 'Extreme';
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

    // Using One Call API 3.0
    // Exclude: minutely,hourly,alerts
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=minutely,hourly,alerts&appid=${apiKey}&units=metric`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorBody = await response.text();
        console.error("OpenWeatherMap API Error:", response.status, errorBody);
        throw new Error(`Failed to fetch weather data: ${response.statusText}`);
      }
      const data = await response.json();

      // Reverse geocode to get city name (optional, OpenWeatherMap doesn't provide this in onecall)
      // For simplicity, we'll skip detailed reverse geocoding here, but you could add another API call.
      // Or, if the client knows the city name, it could pass it.
      // const geoResponse = await fetch(`http://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${apiKey}`);
      // let locationName = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
      // if (geoResponse.ok) {
      //   const geoData = await geoResponse.json();
      //   if (geoData.length > 0) {
      //     locationName = geoData[0].name;
      //   }
      // }


      const weeklyWeather: WeatherDay[] = data.daily.slice(0, 7).map((day: any) => ({
        day: format(new Date(day.dt * 1000), 'EEE'), // Format to 'Mon', 'Tue', etc.
        iconName: mapOwmIconToLucideName(day.weather[0].icon),
        tempHigh: Math.round(day.temp.max),
        tempLow: Math.round(day.temp.min),
        rainPercentage: Math.round((day.pop || 0) * 100), // Probability of precipitation
      }));
      
      const moonPhaseDetails = getMoonPhaseDetails(data.daily[0].moon_phase); // Moon phase for today
      const uvi = data.current.uvi;

      return {
        // locationName: locationName, // Could be added if reverse geocoding is implemented
        moonPhase: moonPhaseDetails,
        uvIndex: {
          value: Math.round(uvi),
          description: getUviDescription(uvi),
        },
        currentWeather: {
          temp: Math.round(data.current.temp),
          description: data.current.weather[0].description,
          iconName: mapOwmIconToLucideName(data.current.weather[0].icon),
          humidity: data.current.humidity,
          windSpeed: Math.round(data.current.wind_speed * 3.6), // m/s to km/h
        },
        weeklyWeather,
      };
    } catch (error) {
      console.error('Error in environmentalDataFlow:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to process environmental data: ${errorMessage}`);
    }
  }
);
