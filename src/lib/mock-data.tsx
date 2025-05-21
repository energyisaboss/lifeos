
import type { NewsArticle, CalendarEvent, EnvironmentalData, Asset, AssetPortfolio, AssetHolding } from './types';
import { CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react';

export const mockNewsArticles: NewsArticle[] = [
  { id: '1', title: 'Global Tech Summit Concludes with AI Breakthroughs', source: 'Tech Chronicle', summary: 'The annual Global Tech Summit saw major announcements in AI and quantum computing...', url: '#', category: 'Technology', publishedAt: '2024-07-28T10:00:00Z' },
  { id: '2', title: 'Market Hits Record High Amidst Positive Economic Outlook', source: 'Finance Today', summary: 'Stock markets soared to new heights following optimistic economic reports...', url: '#', category: 'Finance', publishedAt: '2024-07-28T09:30:00Z' },
  { id: '3', title: 'New Space Mission Launched to Explore Mars Moons', source: 'Science Weekly', summary: 'NASA launched its latest mission aimed at studying Phobos and Deimos...', url: '#', category: 'Science', publishedAt: '2024-07-27T15:00:00Z' },
  { id: '4', title: 'Tips for a More Productive Work From Home Setup', source: 'Lifestyle Hub', summary: 'Experts share their best advice for optimizing your remote work environment...', url: '#', category: 'Lifestyle', publishedAt: '2024-07-27T11:00:00Z' },
];

const today = new Date();
const createDate = (dayOffset: number, hour: number, minute: number) => {
  const date = new Date(today);
  date.setDate(today.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

const createAllDayDate = (dayOffset: number, start: boolean) => {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);
    if (start) {
        date.setHours(0,0,0,0);
    } else {
        date.setHours(23,59,59,999);
    }
    return date.toISOString();
}


export const mockCalendarEvents: CalendarEvent[] = [
  { id: '1', title: 'Team Meeting', startTime: createDate(0, 10, 0), endTime: createDate(0, 11, 0), calendarSource: 'Work Calendar', color: 'hsl(var(--chart-1))' },
  { id: '2', title: 'Dentist Appointment', startTime: createDate(0, 14, 30), endTime: createDate(0, 15, 30), calendarSource: 'Personal Calendar', color: 'hsl(var(--chart-2))' },
  { id: '3', title: 'Project Deadline', startTime: createDate(1, 17, 0), endTime: createDate(1, 17, 0), calendarSource: 'Work Calendar', color: 'hsl(var(--chart-1))', isAllDay: false },
  { id: '4', title: 'Gym Session', startTime: createDate(2, 7, 0), endTime: createDate(2, 8, 0), calendarSource: 'Fitness Calendar', color: 'hsl(var(--chart-3))' },
  { id: '5', title: 'Weekend Getaway', startTime: createAllDayDate(3, true), endTime: createAllDayDate(5, false), calendarSource: 'Personal Calendar', color: 'hsl(var(--chart-2))', isAllDay: true },
];


const weatherIcons = {
  sunny: <Sun className="w-5 h-5 text-yellow-400" />,
  partlyCloudy: <CloudSun className="w-5 h-5 text-gray-400" />,
  cloudy: <CloudFog className="w-5 h-5 text-gray-500" />,
  rain: <CloudRain className="w-5 h-5 text-blue-400" />,
  showers: <CloudDrizzle className="w-5 h-5 text-blue-300" />,
  snow: <CloudSnow className="w-5 h-5 text-sky-300" />,
  thunderstorm: <CloudLightning className="w-5 h-5 text-yellow-500" />,
};

export const mockEnvironmentalData: EnvironmentalData = {
  moonPhase: { name: 'Waxing Crescent', icon: <Moon className="w-5 h-5" /> },
  uvIndex: { value: 7, description: 'High' },
  weeklyWeather: [
    { day: 'Mon', icon: weatherIcons.sunny, tempHigh: 28, tempLow: 18, rainPercentage: 10 },
    { day: 'Tue', icon: weatherIcons.partlyCloudy, tempHigh: 29, tempLow: 19, rainPercentage: 20 },
    { day: 'Wed', icon: weatherIcons.rain, tempHigh: 25, tempLow: 17, rainPercentage: 80 },
    { day: 'Thu', icon: weatherIcons.showers, tempHigh: 26, tempLow: 18, rainPercentage: 60 },
    { day: 'Fri', icon: weatherIcons.sunny, tempHigh: 30, tempLow: 20, rainPercentage: 5 },
    { day: 'Sat', icon: weatherIcons.partlyCloudy, tempHigh: 31, tempLow: 21, rainPercentage: 10 },
    { day: 'Sun', icon: weatherIcons.thunderstorm, tempHigh: 27, tempLow: 19, rainPercentage: 40 },
  ],
};

export const mockAssets: Asset[] = [
  { id: '1', name: 'Apple Inc.', symbol: 'AAPL', quantity: 10, purchasePrice: 150, currentValue: 175, type: 'stock' },
  { id: '2', name: 'Vanguard S&P 500 ETF', symbol: 'VOO', quantity: 5, purchasePrice: 380, currentValue: 420, type: 'fund' },
  { id: '3', name: 'Bitcoin', symbol: 'BTC', quantity: 0.1, purchasePrice: 30000, currentValue: 40000, type: 'crypto' },
  { id: '4', name: 'Microsoft Corp.', symbol: 'MSFT', quantity: 8, purchasePrice: 280, currentValue: 330, type: 'stock' },
];


export function calculateAssetPortfolio(assets: Asset[]): AssetPortfolio {
  let totalPortfolioValue = 0;
  let totalInitialCost = 0;

  const holdings: AssetHolding[] = assets.map(asset => {
    const initialCost = asset.quantity * asset.purchasePrice;
    const currentValue = asset.quantity * asset.currentValue;
    const profitLoss = currentValue - initialCost;
    const profitLossPercentage = initialCost === 0 ? 0 : (profitLoss / initialCost) * 100;

    totalPortfolioValue += currentValue;
    totalInitialCost += initialCost;

    return {
      ...asset,
      totalValue: currentValue,
      profitLoss,
      profitLossPercentage,
    };
  });

  const totalProfitLoss = totalPortfolioValue - totalInitialCost;
  const totalProfitLossPercentage = totalInitialCost === 0 ? 0 : (totalProfitLoss / totalInitialCost) * 100;

  return {
    holdings,
    totalPortfolioValue,
    totalProfitLoss,
    totalProfitLossPercentage,
  };
}
