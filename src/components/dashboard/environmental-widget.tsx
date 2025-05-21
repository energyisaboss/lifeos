"use client";

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { Sun, Cloud, Droplets, Thermometer, Moon as MoonIcon } from 'lucide-react';
import type { EnvironmentalData } from '@/lib/types';
import { mockEnvironmentalData } from '@/lib/mock-data';

export function EnvironmentalWidget() {
  const data: EnvironmentalData = mockEnvironmentalData; // In a real app, fetch this data

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <SectionTitle icon={Cloud} title="Environment" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Moon Phase & UV Index */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-md bg-muted/30">
            <div className="flex items-center text-sm text-muted-foreground mb-1">
              <MoonIcon className="w-4 h-4 mr-2" />
              Moon Phase
            </div>
            <div className="flex items-center">
              {data.moonPhase.icon && <span className="mr-2 text-xl">{data.moonPhase.icon}</span>}
              <p className="text-lg font-medium text-card-foreground">{data.moonPhase.name}</p>
            </div>
          </div>

          <div className="p-3 rounded-md bg-muted/30">
            <div className="flex items-center text-sm text-muted-foreground mb-1">
              <Sun className="w-4 h-4 mr-2" />
              UV Index
            </div>
            <p className="text-2xl font-semibold text-primary">{data.uvIndex.value}</p>
            <p className="text-sm text-card-foreground">{data.uvIndex.description}</p>
          </div>
        </div>
        
        {/* Weekly Weather */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Weekly Weather</h4>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
            {data.weeklyWeather.map((dayWeather) => (
              <div key={dayWeather.day} className="p-2 rounded-md bg-muted/30 flex flex-col items-center">
                <p className="text-xs font-medium text-card-foreground">{dayWeather.day}</p>
                <div className="my-1 text-2xl text-primary">{dayWeather.icon}</div>
                <p className="text-xs text-card-foreground">{dayWeather.tempHigh}° / {dayWeather.tempLow}°</p>
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  <Droplets className="w-3 h-3 mr-1" />
                  <span>{dayWeather.rainPercentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
