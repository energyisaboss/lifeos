
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import * as LucideIcons from 'lucide-react';
import type { EnvironmentalData } from '@/lib/types';
import { getEnvironmentalData } from '@/ai/flows/environmental-data-flow';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

const IconComponent = ({ name, ...props }: { name: string } & LucideIcons.LucideProps) => {
  const Icon = (LucideIcons as any)[name];
  if (!Icon) {
    console.warn(`Icon not found: ${name}, falling back to HelpCircle`);
    return <LucideIcons.HelpCircle {...props} />;
  }
  return <Icon {...props} />;
};


export function EnvironmentalWidget() {
  const [data, setData] = useState<EnvironmentalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Default to San Francisco, CA
  const latitude = 37.7749;
  const longitude = -122.4194;

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getEnvironmentalData({ latitude, longitude });
        setData(result);
      } catch (err) {
        console.error("Failed to fetch environmental data:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.includes("OpenWeatherMap API key is not configured")) {
             setError("OpenWeatherMap API key is missing. Please add OPENWEATHER_API_KEY to your .env.local file and restart server.");
        } else if (errorMessage.includes("OpenUV API key not configured") || errorMessage.includes("OPENUV_API_KEY")) {
             setError("OpenUV API key for UV Index is missing. Please add OPENUV_API_KEY to .env.local and restart.");
        } else if (errorMessage.includes("WeatherAPI.com key not configured") || errorMessage.includes("WEATHERAPI_API_KEY")) {
             setError("WeatherAPI.com key for Moon Phase is missing. Please add WEATHERAPI_API_KEY to .env.local and restart.");
        } else if (errorMessage.toLowerCase().includes("unauthorized") || errorMessage.includes("401")) {
            setError("Failed to fetch weather data: Unauthorized. Check your API keys (OpenWeatherMap, OpenUV, WeatherAPI.com), ensure they are active, and subscribed to necessary services.");
        }
        else {
             setError(`Failed to load environmental data. ${errorMessage.substring(0,300)}`); // Truncate long messages
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [latitude, longitude]);

  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={LucideIcons.Cloud} title="Environment" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20 w-full" /> {/* Moon Phase Placeholder */}
            <Skeleton className="h-20 w-full" /> {/* UV Index Placeholder */}
          </div>
           <div className="p-3 rounded-md bg-muted/30"> {/* Current Weather Placeholder */}
             <Skeleton className="h-8 w-1/2 mb-2" />
             <Skeleton className="h-6 w-full" />
             <Skeleton className="h-4 w-3/4 mt-1" />
          </div>
          <div>
            <Skeleton className="h-8 w-1/3 mb-2" />
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
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
            <AlertTitle>Error Loading Data</AlertTitle>
            <AlertDescription className="break-words text-xs">
              {error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.currentWeather) { // Ensure currentWeather is present
    return (
       <Card className="shadow-lg">
        <CardHeader>
          <SectionTitle icon={LucideIcons.Cloud} title="Environment" />
        </CardHeader>
        <CardContent>
          <p>No environmental data available or primary weather fetch failed.</p>
        </CardContent>
      </Card>
    );
  }
  
  const { locationName, moonPhase, uvIndex, currentWeather, weeklyWeather } = data;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <SectionTitle icon={LucideIcons.Cloud} title={locationName ? `Environment - ${locationName}`: "Environment"} />
         {currentWeather && (
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground pt-1">
            <div className="flex items-center">
              <IconComponent name={currentWeather.iconName} className="w-5 h-5 mr-1 text-primary" /> 
              <span>{currentWeather.temp}°C, {currentWeather.description}</span>
            </div>
            <div className="flex items-center">
                <LucideIcons.Droplets className="w-4 h-4 mr-1" /> {currentWeather.humidity}%
            </div>
             <div className="flex items-center">
                <LucideIcons.Wind className="w-4 h-4 mr-1" /> {currentWeather.windSpeed} km/h
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {moonPhase ? (
            <div className="p-3 rounded-md bg-muted/30 min-h-[80px]">
              <div className="flex items-center text-sm text-muted-foreground mb-1">
                <IconComponent name={moonPhase.iconName} className="w-4 h-4 mr-2" />
                Moon Phase
              </div>
              <div className="flex items-center">
                <p className="text-lg font-medium text-card-foreground">{moonPhase.name}</p>
              </div>
              <p className="text-xs text-muted-foreground">Illumination: {moonPhase.illumination}%</p>
            </div>
          ) : <div className="p-3 rounded-md bg-muted/30 min-h-[80px] flex items-center justify-center"><p className="text-xs text-muted-foreground">Moon phase data N/A</p></div>}

          {uvIndex ? (
            <div className="p-3 rounded-md bg-muted/30 min-h-[80px]">
              <div className="flex items-center text-sm text-muted-foreground mb-1">
                <LucideIcons.Sun className="w-4 h-4 mr-2" />
                UV Index
              </div>
              <p className="text-2xl font-semibold text-primary">{uvIndex.value}</p>
              <p className="text-sm text-card-foreground">{uvIndex.description}</p>
            </div>
          ) : <div className="p-3 rounded-md bg-muted/30 min-h-[80px] flex items-center justify-center"><p className="text-xs text-muted-foreground">UV index data N/A</p></div>}
        </div>
        
        {weeklyWeather && weeklyWeather.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Weekly Weather</h4>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
              {weeklyWeather.map((dayWeather) => (
                <div key={dayWeather.day} className="p-2 rounded-md bg-muted/30 flex flex-col items-center justify-between min-h-[90px]">
                  <p className="text-xs font-medium text-card-foreground">{dayWeather.day}</p>
                  <IconComponent name={dayWeather.iconName} className="my-1 text-2xl text-primary" />
                  <p className="text-xs text-card-foreground">{dayWeather.tempHigh}° / {dayWeather.tempLow}°</p>
                  <div className="flex items-center text-xs text-muted-foreground mt-1">
                    <LucideIcons.Droplets className="w-3 h-3 mr-1" />
                    <span>{dayWeather.rainPercentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
