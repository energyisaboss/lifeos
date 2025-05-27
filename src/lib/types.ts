
export interface NewsArticle {
  id: string; // Can be guid or link if guid is missing
  title?: string;
  link?: string;
  sourceName: string; // From feed title or user-provided label
  contentSnippet?: string; // Short summary
  isoDate?: string; // ISO date string for sorting
  category?: string; // Optional category from feed item
  imageUrl?: string; // Optional image URL from feed item
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; 
  endTime: string;   
  calendarSource: string; 
  color: string; 
  isAllDay?: boolean;
}

export interface EnvironmentalData {
  locationName?: string;
  moonPhase?: {
    name: string; // e.g., "Waxing Crescent"
    illumination: number; // Moon illumination percentage
    iconName: string; // Lucide icon name, e.g., "Moon" or "Sun" for full moon
  };
  uvIndex?: {
    value: number;
    description: string; // e.g., "Low", "Moderate", "High"
  };
  airQuality?: {
    aqi: number; // OWM AQI Index (1-5)
    level: string; // e.g., "Good", "Fair", "Moderate", "Poor", "Very Poor"
    iconName: string; // Lucide icon name for the level
    colorClass: string; // Tailwind CSS class for text color
  };
  currentWeather: {
    temp: number;
    description: string;
    iconName: string;
    humidity: number;
    windSpeed: number;
  };
  weeklyWeather: WeatherDay[];
}

export interface WeatherDay {
  day: string; 
  iconName: string;
  tempHigh: number;
  tempLow: number;
  rainPercentage: number;
}

export interface Asset {
  id: string;
  name: string;
  symbol: string; // e.g., AAPL, BTC-USD, VOO
  quantity: number;
  purchasePrice: number; // Price per unit at the time of purchase
  type: 'stock' | 'fund' | 'crypto'; // Type of asset
}

export interface AssetHolding extends Asset {
  currentPricePerUnit?: number | null; // Fetched current price per unit
  totalValue: number; // quantity * currentPricePerUnit
  profitLoss: number;
  profitLossPercentage: number;
}

export interface AssetPortfolio {
  holdings: AssetHolding[];
  totalPortfolioValue: number;
  totalProfitLoss: number;
  // totalProfitLossPercentage field was removed as per user request
}

