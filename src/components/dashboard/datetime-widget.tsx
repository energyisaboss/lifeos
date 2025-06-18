
"use client";

import { useEffect, useState } from 'react';
import { MapPinOff, Droplets, Wind } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { EnvironmentalData } from '@/lib/types';
import { getEnvironmentalData } from '@/ai/flows/environmental-data-flow';
import { Skeleton } from '@/components/ui/skeleton';

export function DateTimeWidget() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    // Set initial time on client mount
    setCurrentTime(new Date());

    const timerId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  const [environmentalData, setEnvironmentalData] = useState<EnvironmentalData | null>(null); // Keep environmentalData state
  const [isLoadingEnvironmental, setIsLoadingEnvironmental] = useState(true);
  const [environmentalError, setEnvironmentalError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

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
          setLocationError("Could not get your location. Showing data for a default location (Orlando).");
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

    
  useEffect(() => {
    const fetchEnvironmentalData = async (lat: number, lon: number) => {
      setIsLoadingEnvironmental(true);
      setEnvironmentalError(null);
      try {
        const data = await getEnvironmentalData({ latitude: lat, longitude: lon });
        setEnvironmentalData(data);
      } catch (err) {
        console.error("Failed to fetch environmental data:", err);
        setEnvironmentalError("Failed to load environmental data.");
      } finally {
        setIsLoadingEnvironmental(false);
      }
    };

    // Fetch data only if location is available and not already loading
    if (latitude !== null && longitude !== null) {
      fetchEnvironmentalData(latitude, longitude);
    } else if (locationError) {
       setIsLoadingEnvironmental(false); // Stop loading if location error
    }

    const intervalId = setInterval(() => {
       if (latitude !== null && longitude !== null) {
         console.log("DateTimeWidget: Auto-refreshing environmental data via interval.");
         fetchEnvironmentalData(latitude, longitude);
       }
    }, 15 * 60 * 1000); // Refresh environmental data every 15 minutes

    return () => clearInterval(intervalId);
  }, [latitude, longitude, locationError]);

   const formattedTime = currentTime
    ? currentTime.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--'; // Placeholder for initial render

  const formattedDate = currentTime
    ? currentTime.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Loading date...'; // Placeholder for initial render

  const currentWeather = environmentalData?.currentWeather; // Access currentWeather after environmentalData is set

  return (
    <Card className="shadow-lg">
      <CardContent className="flex flex-col items-center p-6 h-full">
        <p className="text-4xl font-semibold text-primary">{formattedTime}</p>
        <p className="text-base text-muted-foreground mt-1">{formattedDate}</p>

        {isLoadingEnvironmental && !currentWeather && !environmentalError ? (
           <Skeleton className="h-6 w-3/4 mt-4" />
        ) : currentWeather ? (
            <div className="flex flex-col items-center mt-4 text-center">
              <p className="text-5xl font-semibold">{currentWeather.temp}°F</p>
              <div className="flex items-center text-sm text-muted-foreground space-x-4 mt-2">
                <div className="flex items-center"><Droplets className="w-4 h-4 mr-1.5" /> Humidity: {currentWeather.humidity}%</div>
                <div className="flex items-center"><Wind className="w-4 h-4 mr-1.5" /> Wind: {currentWeather.windSpeed} mph</div>
              </div>
            </div>

        ) : null /* Render nothing if not loading, no current weather, and no environmental error */}

        {environmentalError && (
           <p className="text-xs text-destructive mt-2 text-center">{environmentalError}</p>
        )}
        {locationError && !environmentalData && !environmentalError && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 text-center flex items-center justify-center"><MapPinOff size={14} className="mr-1.5 flex-shrink-0" /> {locationError}</p>
        )}
      </CardContent>
    </Card>
  );
}
