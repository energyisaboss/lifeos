
'use server';
/**
 * @fileOverview A Genkit flow to fetch environmental data.
 * It uses OpenWeatherMap for current weather and 5-day forecast,
 * OpenUV for UV index, and WeatherAPI.com for moon phase.
 *
 * - getEnvironmentalData - Fetches and combines data from these sources.
 * - EnvironmentalDataInput - Input schema (latitude, longitude).
 * - EnvironmentalDataOutput - Output schema based on src/lib/types.ts.
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
  moonPhase: z.optional(z.object({
    name: z.string(),
    illumination: z.number(),
    iconName: z.string().describe('Identifier for the moon icon.'),
  })),
  uvIndex: z.optional(z.object({
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

function getUvIndexDescription(uv: number): string {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function mapMoonPhaseToIconName(phaseName: string): string {
    const lowerPhase = phaseName.toLowerCase();
    if (lowerPhase.includes('new moon')) return 'Eclipse';
    if (lowerPhase.includes('full moon')) return 'Sun';
    if (lowerPhase.includes('first quarter') || lowerPhase.includes('last quarter')) return 'CircleHalf';
    // For Crescents and Gibbous, 'Moon' (which is a crescent shape in Lucide) will be used.
    // Client-side logic will flip it for waning phases.
    if (lowerPhase.includes('crescent') || lowerPhase.includes('gibbous')) return 'Moon';
    return 'Moon'; // Default
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
    const openWeatherApiKey = process.env.OPENWEATHER_API_KEY;
    const openUvApiKey = process.env.OPENUV_API_KEY;
    const weatherApiComKey = process.env.WEATHERAPI_COM_KEY;

    let currentWeatherData: AppEnvironmentalData['currentWeather'] | undefined;
    let weeklyWeatherData: AppEnvironmentalData['weeklyWeather'] = [];
    let locationNameData: string | undefined;
    let uvIndexData: AppEnvironmentalData['uvIndex'] | undefined;
    let moonPhaseData: AppEnvironmentalData['moonPhase'] | undefined;

    const errors: string[] = [];

    // Fetch OpenWeatherMap Data
    if (openWeatherApiKey) {
      const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${openWeatherApiKey}&units=metric`;
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${openWeatherApiKey}&units=metric`;
      try {
        const [currentWeatherResponse, forecastResponse] = await Promise.all([
          fetch(currentWeatherUrl),
          fetch(forecastUrl),
        ]);

        if (!currentWeatherResponse.ok) {
          const errorText = await currentWeatherResponse.text();
          const errorMessage = `OpenWeatherMap Current Weather API Error: ${currentWeatherResponse.status} ${errorText}`;
          console.error(errorMessage);
          errors.push(errorMessage);
        } else {
          const currentData = await currentWeatherResponse.json();
          currentWeatherData = {
            temp: Math.round(currentData.main.temp),
            description: currentData.weather[0].description,
            iconName: mapOwmIconToLucideName(currentData.weather[0].icon),
            humidity: currentData.main.humidity,
            windSpeed: Math.round(currentData.wind.speed * 3.6), // m/s to km/h
          };
          locationNameData = currentData.name;
        }

        if (!forecastResponse.ok) {
           const errorText = await forecastResponse.text();
           const errorMessage = `OpenWeatherMap Forecast API Error: ${forecastResponse.status} ${errorText}`;
           console.error(errorMessage);
           errors.push(errorMessage);
        } else {
          const forecastData = await forecastResponse.json();
          const dailyForecasts: { [key: string]: { temps: number[], pops: number[], icons: string[] } } = {};
          forecastData.list.forEach((item: any) => {
            const date = format(parseISO(item.dt_txt.substring(0,10)), 'yyyy-MM-dd');
            if (!dailyForecasts[date]) {
              dailyForecasts[date] = { temps: [], pops: [], icons: [] };
            }
            dailyForecasts[date].temps.push(item.main.temp_min, item.main.temp_max);
            dailyForecasts[date].pops.push(item.pop || 0);
            const hour = parseISO(item.dt_txt).getHours();
            if (hour >= 11 && hour <= 14) { 
                 if (!dailyForecasts[date].icons.find(i => i === item.weather[0].icon)) {
                    dailyForecasts[date].icons.unshift(item.weather[0].icon);
                 }
            } else {
                 dailyForecasts[date].icons.push(item.weather[0].icon);
            }
          });
          weeklyWeatherData = Object.keys(dailyForecasts)
            .slice(0, 7)
            .map(dateStr => {
              const dayData = dailyForecasts[dateStr];
              const representativeIcon = dayData.icons[0] || (dayData.icons.length > 0 ? dayData.icons[0] : '03d');
              return {
                day: format(parseISO(dateStr), 'EEE'),
                iconName: mapOwmIconToLucideName(representativeIcon),
                tempHigh: Math.round(Math.max(...dayData.temps)),
                tempLow: Math.round(Math.min(...dayData.temps)),
                rainPercentage: Math.round(Math.max(...dayData.pops) * 100),
              };
            });
        }
      } catch (error) {
        const errorMessage = `Failed to fetch OpenWeatherMap data: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    } else {
      errors.push('OpenWeatherMap API key (OPENWEATHER_API_KEY) is not configured.');
    }

    // Fetch UV Index from OpenUV
    if (openUvApiKey) {
      const openUvUrl = `https://api.openuv.io/api/v1/uv?lat=${latitude}&lng=${longitude}`;
      try {
        const uvResponse = await fetch(openUvUrl, { headers: { 'x-access-token': openUvApiKey } });
        if (!uvResponse.ok) {
          const errorText = await uvResponse.text();
          const errorMessage = `OpenUV API Error: ${uvResponse.status} ${errorText}`;
          console.error(`OpenUV API Error: ${uvResponse.status} ${await uvResponse.text()}`);
          errors.push(errorMessage);
        } else {
          const uvData = await uvResponse.json();
          if (uvData && uvData.result && typeof uvData.result.uv === 'number') {
            uvIndexData = {
              value: parseFloat(uvData.result.uv.toFixed(1)),
              description: getUvIndexDescription(uvData.result.uv),
            };
          } else {
             const formatError = 'OpenUV API response format error or UV data missing.';
             console.error(formatError, uvData);
             errors.push(formatError);
          }
        }
      } catch (error) {
        const errorMessage = `Failed to fetch OpenUV data: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`Failed to fetch OpenUV data: ${error}`);
        errors.push(errorMessage);
      }
    } else {
      console.log('OpenUV API key (OPENUV_API_KEY) not configured, skipping UV index.');
    }

    // Fetch Moon Phase from WeatherAPI.com
    if (weatherApiComKey) {
      const weatherApiUrl = `https://api.weatherapi.com/v1/astronomy.json?key=${weatherApiComKey}&q=${latitude},${longitude}`;
      try {
        const moonResponse = await fetch(weatherApiUrl);
        if (!moonResponse.ok) {
          const errorText = await moonResponse.text();
          const errorMessage = `WeatherAPI.com Error: ${moonResponse.status} ${errorText}`;
          console.error(`WeatherAPI.com Error: ${moonResponse.status} ${await moonResponse.text()}`);
          errors.push(errorMessage);
        } else {
          const moonApiData = await moonResponse.json();
          if (moonApiData && moonApiData.astronomy && moonApiData.astronomy.astro) {
            const astro = moonApiData.astronomy.astro;
            moonPhaseData = {
              name: astro.moon_phase,
              illumination: parseInt(astro.moon_illumination, 10),
              iconName: mapMoonPhaseToIconName(astro.moon_phase),
            };
          } else {
            const formatError = 'WeatherAPI.com response format error or astronomy data missing.';
            console.error(formatError, moonApiData);
            errors.push(formatError);
          }
        }
      } catch (error) {
        const errorMessage = `Failed to fetch WeatherAPI.com data: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`Failed to fetch WeatherAPI.com data: ${error}`);
        errors.push(errorMessage);
      }
    } else {
       console.log('WeatherAPI.com key (WEATHERAPI_COM_KEY) not configured, skipping moon phase.');
    }

    if (!currentWeatherData && errors.length > 0) {
        const primaryError = errors.find(e => e.toLowerCase().includes('openweathermap'));
        throw new Error(primaryError || errors.join('; '));
    }
     if (!currentWeatherData && errors.length === 0) { 
        throw new Error('Failed to fetch primary weather data from OpenWeatherMap for an unknown reason.');
    }

    return {
      locationName: locationNameData,
      currentWeather: currentWeatherData!,
      weeklyWeather: weeklyWeatherData,
      uvIndex: uvIndexData,
      moonPhase: moonPhaseData,
    };
  }
);
