
"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionTitle } from './section-title';
import { Clock } from 'lucide-react';

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
    <Card className="shadow-lg">
      <CardHeader>
        <SectionTitle icon={Clock} title="Current Date & Time" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-primary">{formattedTime}</p>
        <p className="text-base text-muted-foreground">{formattedDate}</p>
      </CardContent>
    </Card>
  );
}
