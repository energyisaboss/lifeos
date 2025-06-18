
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import * as LucideIcons from 'lucide-react';
import type { EnvironmentalData } from '@/lib/types';
import { getEnvironmentalData } from '@/ai/flows/environmental-data-flow';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, MapPinOff, Gauge, Smile, Meh, Frown, CloudFog, Skull, HelpCircle, Cloud, Sun, Eclipse, CircleHalf, Moon } from "lucide-react";
import { cn } from '@/lib/utils';
import { Progress } from "@/components/ui/progress";

const REFRESH_INTERVAL_MS = 1 * 60 * 60 * 1000; // 1 hour

const IconComponent = ({ name, className, style, ...props }: { name: string, className?: string, style?: React.CSSProperties } & LucideIcons.LucideProps) => {
  if (!name || typeof name !== 'string') {
    console.warn(`IconComponent received invalid name: ${name}, falling back to Moon`);
    return <LucideIcons.Moon className={className} style={style} {...props} />;
  }
  const Icon = (LucideIcons as any)[name];
  if (!Icon) {
    console.warn(`Icon not found: ${name}, falling back to Moon`);
    return <LucideIcons.Moon className={className} style={style} {...props} />;
  }
  return <Icon className={className} style={style} {...props} />;
};

const getUvIndexTextColor = (description?: string): string => {
  if (!description) return 'text-primary';
  const lowerDesc = description.toLowerCase();
  if (lowerDesc === 'low') return 'text-green-500';
  if (lowerDesc === 'moderate') return 'text-yellow-500';
  if (lowerDesc === 'high' || lowerDesc === 'very high' || lowerDesc === 'extreme') return 'text-red-500';
  return 'text-primary';
};

const getUvBarClass = (description?: string): string => {
  if (!description) return '';
  const lowerDesc = description.toLowerCase();
  if (lowerDesc === 'low') return 'uv-bar-low';
  if (lowerDesc === 'moderate') return 'uv-bar-moderate';
  if (lowerDesc === 'high' || lowerDesc === 'very high' || lowerDesc === 'extreme') return 'uv-bar-high';
  return '';
};


export function EnvironmentalWidget() {
  const [data, setData] = useState<EnvironmentalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
          setLocationError(null);
        },
        (err) => {
          console.error("Error getting geolocation:", err);
          setLocationError("Could not get your location. Please enable location services. Showing data for a default location (Orlando).");
          setLatitude(28.5384); // Default to Orlando
          setLongitude(-81.3789); // Default to Orlando
        }
      );
    } else {
      setLocationError("Geolocation is not supported by your browser. Showing data for a default location (Orlando).");
      setLatitude(28.5384); // Default to Orlando
      setLongitude(-81.3789); // Default to Orlando
    }
  }, []);

  const fetchData = useCallback(async (lat: number, lon: number) => {
    if (isFetchingRef.current) {
      console.log("EnvironmentalWidget: Fetch already in progress, skipping new fetch.");
      return;
    }
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getEnvironmentalData({ latitude: lat, longitude: lon });
      setData(result);
      if (locationError && result.locationName && !result.locationName.toLowerCase().includes("san francisco")) {
        setLocationError(`Could not get your location. Showing data for ${result.locationName}. Please enable location services for local data.`);
      } else if (locationError && result.locationName && result.locationName.toLowerCase().includes("san francisco")) {
         // Keep existing locationError about default location if it's SF
      } else if (!locationError) {
        setLocationError(null); 
      }
    } catch (err) {
      console.error("Failed to fetch environmental data in widget:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage.includes("GEMINI_API_KEY") || errorMessage.includes("GOOGLE_API_KEY") || errorMessage.toLowerCase().includes("failed_precondition") || errorMessage.toLowerCase().includes("api key not valid")) {
         setError("Google AI API key is missing. Please add GOOGLE_API_KEY or GEMINI_API_KEY to your .env.local file and restart the server. See https://firebase.google.com/docs/genkit/plugins/google-genai for details.");
      } else if ((errorMessage.includes("OPENWEATHER_API_KEY") || errorMessage.includes("OpenWeatherMap API key")) && (errorMessage.toLowerCase().includes("not configured") || errorMessage.toLowerCase().includes("missing"))) {
         setError("OpenWeatherMap API key is missing. Please add OPENWEATHER_API_KEY to your .env.local file and restart server.");
      } else if ((errorMessage.includes("OPENUV_API_KEY") || errorMessage.includes("OpenUV API key")) && (errorMessage.toLowerCase().includes("not configured") || errorMessage.toLowerCase().includes("missing"))) {
         setError("OpenUV API key for UV Index is missing. Please add OPENUV_API_KEY to .env.local and restart server. Note: OpenUV has low free tier limits.");
      } else if ((errorMessage.includes("WEATHERAPI_COM_KEY") || errorMessage.includes("WeatherAPI.com key")) && (errorMessage.toLowerCase().includes("not configured") || errorMessage.toLowerCase().includes("missing"))) {
         setError("WeatherAPI.com key for Moon Phase is missing. Please add WEATHERAPI_COM_KEY to .env.local and restart server. Note: WeatherAPI.com has low free tier limits.");
      } else if (errorMessage.toLowerCase().includes("unauthorized") || errorMessage.includes("401")) {
          setError("Failed to fetch weather data: Unauthorized. Check your API keys (OpenWeatherMap, OpenUV, WeatherAPI.com), ensure they are active, and subscribed to necessary services.");
      }
      else {
           setError(`Failed to load environmental data. ${errorMessage.substring(0,300)}`);
      }
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [locationError]); // locationError dependency ensures re-evaluation of error messages if needed

  useEffect(() => {
    if (latitude === null || longitude === null) {
      if (!locationError) {
        setIsLoading(true);
        return;
      }
    }

    if (latitude !== null && longitude !== null) {
      fetchData(latitude, longitude); // Initial fetch

      const intervalId = setInterval(() => {
        console.log("EnvironmentalWidget: Auto-refreshing environmental data via interval.");
        fetchData(latitude, longitude);
      }, REFRESH_INTERVAL_MS);

      return () => {
        console.log("EnvironmentalWidget: Clearing environmental data refresh interval.");
        clearInterval(intervalId);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, fetchData]); // fetchData is now stable due to useCallback

  const getMoonIconStyle = (phaseName?: string): React.CSSProperties => {
    if (!phaseName) return {};
    const lowerPhase = phaseName.toLowerCase();
    if (lowerPhase.includes('last quarter') || lowerPhase.includes('waning crescent') || lowerPhase.includes('waning gibbous')) {
      return { transform: 'scaleX(-1)' };
    }
    return {};
  };


  if (isLoading && (latitude === null || longitude === null) && !locationError) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={LucideIcons.LocateFixed} title="Fetching Location..." />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (locationError && !data && !error && !(latitude && longitude)) { 
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={MapPinOff} title="Location Error" />
        </CardHeader>
        <CardContent>
           <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Location Access Denied/Unavailable</AlertTitle>
            <AlertDescription className="break-words text-xs">
              {locationError}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !data) { // Show loading skeleton if loading and no data yet
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={Cloud} title="Environment" />
           {locationError && !error && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 flex items-center">
                <MapPinOff size={14} className="mr-1.5 flex-shrink-0" /> {locationError}
            </p>
           )}
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="p-4 rounded-md bg-muted/30 shadow-md">
             <Skeleton className="h-8 w-1/2 mb-2" />
             <Skeleton className="h-6 w-full" />
             <Skeleton className="h-4 w-3/4 mt-1" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full md:col-span-1" />
          </div>
          <div className="flex flex-col items-center">
            <Skeleton className="h-8 w-1/3 mb-2" />
            <div className="flex flex-wrap justify-center gap-2 text-center">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-16" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={LucideIcons.CloudOff} title="Environment" />
        </CardHeader>
        <CardContent>
           <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error Loading Environmental Data</AlertTitle>
            <AlertDescription className="break-words text-xs">
              {error}
              {locationError && <div className="mt-2 opacity-80">{locationError}</div>}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.currentWeather) {
    return (
       <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={Cloud} title="Environment" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No environmental data available or primary weather fetch failed.</p>
           {locationError && <p className="text-xs text-destructive mt-2">{locationError}</p>}
        </CardContent>
      </Card>
    );
  }

  const { moonPhase, uvIndex, airQuality, currentWeather } = data; // Removed locationName as it's handled in fetchData
  const moonIconStyle = getMoonIconStyle(moonPhase?.name);
  const moonIconName = (moonPhase?.iconName && typeof moonPhase.iconName === 'string') ? moonPhase.iconName : "Moon";
  const uvProgressValue = uvIndex ? Math.min(100, (uvIndex.value / 11) * 100) : 0;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <SectionTitle icon={Cloud} title="Environment" />
         {locationError && !error && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 flex items-center">
                <MapPinOff size={14} className="mr-1.5 flex-shrink-0" /> {locationError}
            </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        
        {currentWeather && (
          <div className="p-4 rounded-md bg-muted/30 shadow-md">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-2">
              <div className="flex items-center mb-2 sm:mb-0">
                <IconComponent name={currentWeather.iconName || "Cloud"} className="w-12 h-12 mr-3 text-primary" />
                <span className="text-5xl font-semibold">{currentWeather.temp}°F</span>
              </div>
              <div className="flex flex-col items-center sm:items-end">
                <span className="text-lg text-card-foreground capitalize text-center sm:text-right">{currentWeather.description}</span>
                {data.locationName && <span className="text-xs text-muted-foreground">in {data.locationName}</span>}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-around text-sm text-muted-foreground space-y-1 sm:space-y-0 sm:space-x-4 mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center">
                <LucideIcons.Droplets className="w-4 h-4 mr-1.5" /> Humidity: {currentWeather.humidity}%
              </div>
              <div className="flex items-center">
                <LucideIcons.Wind className="w-4 h-4 mr-1.5" /> Wind: {currentWeather.windSpeed} mph
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {moonPhase ? (
             <div className="p-3 rounded-md bg-muted/30 min-h-[80px] flex flex-col items-center justify-center text-center">
              <IconComponent name={moonIconName || "Moon"} className="w-8 h-8 mb-1 text-primary" style={moonIconStyle} />
              <p className="text-md font-medium text-card-foreground">{moonPhase.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Illumination: {moonPhase.illumination}%</p>
            </div>
          ) : <div className="p-3 rounded-md bg-muted/30 min-h-[80px] flex items-center justify-center"><p className="text-xs text-muted-foreground">Moon phase data N/A</p></div>}

          {uvIndex ? (
             <div className="p-3 rounded-md bg-muted/30 min-h-[80px] flex flex-col items-center justify-center text-center space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <Sun className="w-4 h-4 mr-2 text-primary" />
                UV Index
              </div>
              <p className={cn("text-2xl font-semibold", getUvIndexTextColor(uvIndex.description))}>{uvIndex.value}</p>
              <p className="text-sm text-card-foreground">{uvIndex.description}</p>
              <Progress
                value={uvProgressValue}
                className={cn("h-2 w-3/4 mt-1", getUvBarClass(uvIndex.description))}
                aria-label={`UV Index level: ${uvIndex.description}, value ${uvIndex.value}`}
              />
            </div>
          ) : (
            <div className="p-3 rounded-md bg-muted/30 min-h-[80px] flex flex-col items-center justify-center text-center">
                <HelpCircle size={24} className="mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">UV index data N/A.</p>
                <p className="text-xs text-muted-foreground/80 mt-0.5 px-1">
                  Check <code className="text-xs bg-muted/70 px-1 py-0.5 rounded">.env.local</code> for <code className="text-xs bg-muted/70 px-1 py-0.5 rounded">OPENUV_API_KEY</code> &amp; server logs for details.
                </p>
            </div>
          )}

          {airQuality ? (
            <div className="p-3 rounded-md bg-muted/30 min-h-[80px] flex flex-col items-center justify-center text-center">
                <IconComponent name={airQuality.iconName || "HelpCircle"} className={cn("w-8 h-8 mb-1", airQuality.colorClass || 'text-primary')} />
                <p className={cn("text-md font-medium", airQuality.colorClass || 'text-card-foreground')}>{airQuality.level}</p>
                <p className="text-xs text-muted-foreground mt-0.5">AQI (1-5): {airQuality.aqi}</p>
            </div>
          ) : <div className="p-3 rounded-md bg-muted/30 min-h-[80px] flex items-center justify-center"><p className="text-xs text-muted-foreground">Air Quality data N/A</p></div>}
        </div>
         
         <div className="flex flex-col items-center">
            <h4 className="text-sm font-medium text-muted-foreground mb-2 text-center">Weekly Weather</h4>
            {data.weeklyWeather && data.weeklyWeather.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-2 text-center">
                {data.weeklyWeather.map((dayWeather) => (
                    <div key={dayWeather.day} className="w-16 p-2 rounded-md bg-muted/30 flex flex-col items-center justify-between min-h-[90px] text-center">
                    <p className="text-xs font-medium text-card-foreground">{dayWeather.day}</p>
                    <IconComponent name={dayWeather.iconName || "Cloud"} className="my-1 text-2xl text-primary" />
                    <p className="text-xs text-card-foreground">{dayWeather.tempHigh}°F / {dayWeather.tempLow}°F</p>
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                        <LucideIcons.Droplets className="w-3 h-3 mr-1" />
                        <span>{dayWeather.rainPercentage}%</span>
                    </div>
                    </div>
                ))}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Weekly forecast data N/A.</p>
            )}
        </div>
      </CardContent>
    </Card>
  );
}

    