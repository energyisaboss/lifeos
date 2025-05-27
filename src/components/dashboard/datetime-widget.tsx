
"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

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

  return (
    <Card className="shadow-lg h-full">
      <CardContent className="flex flex-col items-center justify-center h-full p-6">
        <p className="text-3xl font-semibold text-primary">{formattedTime}</p>
        <p className="text-base text-muted-foreground mt-1">{formattedDate}</p>
      </CardContent>
    </Card>
  );
}
