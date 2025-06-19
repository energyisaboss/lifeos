
'use server';
/**
 * @fileOverview A Genkit flow to fetch the current price of an asset using Tiingo API.
 *
 * - getAssetPrice - Fetches the latest end-of-day price for a given asset symbol.
 * - AssetPriceInput - Input schema (symbol).
 * - AssetPriceOutput - Output schema (price).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AssetPriceInputSchema = z.object({
  symbol: z.string().describe('The stock/asset symbol (e.g., AAPL, MSFT, FXAIX).'),
  apiKey: z.string().optional().describe('Optional Tiingo API key.'),
});
export type AssetPriceInput = z.infer<typeof AssetPriceInputSchema>;

const AssetPriceOutputSchema = z.object({
  currentPrice: z.number().nullable().describe('The latest end-of-day market price of the asset. Null if not found or error.'),
});
export type AssetPriceOutput = z.infer<typeof AssetPriceOutputSchema>;

export async function getAssetPrice(input: AssetPriceInput): Promise<AssetPriceOutput> {
  return assetPriceFlow(input);
}

const assetPriceFlow = ai.defineFlow(
  {
    name: 'assetPriceFlow',
    inputSchema: AssetPriceInputSchema,
    outputSchema: AssetPriceOutputSchema,
  },
  async ({ symbol, apiKey }) => {
    const finalApiKey = apiKey || process.env.TIINGO_API_KEY;

    if (!finalApiKey) {
      const errorMsg = 'Tiingo API key (TIINGO_API_KEY) is not configured in .env.local. Cannot fetch asset prices.';
      console.error(errorMsg);
      throw new Error('TIINGO_API_KEY_NOT_CONFIGURED');
    }

    // Tiingo EOD prices endpoint. Fetches historical data, we'll take the most recent.
    const apiUrl = `https://api.tiingo.com/tiingo/daily/${symbol.toUpperCase()}/prices`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${apiKey || tiingoApiKey}`
 }
      });

      const responseDataText = await response.text();
      console.log(`Tiingo API EOD price response text for ${symbol}:`, responseDataText);

      if (!response.ok) {
        const detailedErrorMsg = `Tiingo API Error for symbol ${symbol}: ${response.status} ${responseDataText}`;
        console.error(detailedErrorMsg);
        if (response.status === 401 || response.status === 403) {
           console.error(`Tiingo API Unauthorized/Forbidden for symbol ${symbol} (Status: ${response.status}). Check API key, permissions, and subscription plan.`);
           throw new Error(`TIINGO_API_ERROR: ${response.status} Unauthorized/Forbidden for ${symbol}. Check API key and plan.`);
        }
         if (response.status === 404) {
            console.warn(`Tiingo: Symbol ${symbol} not found (404). API response: ${responseDataText}`);
            return { currentPrice: null }; // Symbol not found by Tiingo
        }
        throw new Error(`TIINGO_API_ERROR: ${response.status} for ${symbol}`);
      }
      
      const data = JSON.parse(responseDataText); 

      if (!Array.isArray(data) || data.length === 0) {
        console.warn(`Tiingo: No price data returned for symbol ${symbol}. API response:`, JSON.stringify(data, null, 2));
        return { currentPrice: null };
      }

      // Data is an array of daily prices, sorted most recent first by default by Tiingo EOD.
      const latestPriceData = data[0];
      let priceToUse: number | null = null;

      if (latestPriceData && typeof latestPriceData.adjClose === 'number' && latestPriceData.adjClose > 0) {
        priceToUse = latestPriceData.adjClose;
      } else if (latestPriceData && typeof latestPriceData.close === 'number' && latestPriceData.close > 0) {
        priceToUse = latestPriceData.close;
        console.log(`Tiingo: Using close price (${latestPriceData.close}) for symbol ${symbol} as adjClose was ${latestPriceData.adjClose}.`);
      }

      if (priceToUse !== null) {
        console.log(`Tiingo: Using price ${priceToUse} from date ${latestPriceData.date} for symbol ${symbol}.`);
        return { currentPrice: priceToUse };
      } else {
        console.warn(`Tiingo: Valid price (adjClose or close) not found in latest data for symbol ${symbol}. Latest data point:`, JSON.stringify(latestPriceData, null, 2));
        return { currentPrice: null };
      }

    } catch (error) {
      if (error instanceof Error && (error.message.startsWith('TIINGO_API_KEY_NOT_CONFIGURED') || error.message.startsWith('TIINGO_API_ERROR'))) {
        throw error; 
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch price for symbol ${symbol} from Tiingo (generic catch): ${errorMessage}`);
      throw new Error(`FETCH_ERROR: Could not fetch price for ${symbol} from Tiingo.`);
    }
  }
);
