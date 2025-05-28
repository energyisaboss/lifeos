
'use server';
/**
 * @fileOverview A Genkit flow to fetch the current price of an asset using Finnhub API.
 *
 * - getAssetPrice - Fetches the current price for a given asset symbol.
 * - AssetPriceInput - Input schema (symbol).
 * - AssetPriceOutput - Output schema (price).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AssetPriceInputSchema = z.object({
  symbol: z.string().describe('The stock/asset symbol (e.g., AAPL, MSFT, FXAIX).'),
});
export type AssetPriceInput = z.infer<typeof AssetPriceInputSchema>;

const AssetPriceOutputSchema = z.object({
  currentPrice: z.number().nullable().describe('The current market price or previous closing price of the asset. Null if not found or error.'),
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
  async ({ symbol }) => {
    const finnhubApiKey = process.env.FINNHUB_API_KEY;

    if (!finnhubApiKey) {
      const errorMsg = 'Finnhub API key (FINNHUB_API_KEY) is not configured in .env.local. Cannot fetch asset prices.';
      console.error(errorMsg);
      throw new Error('FINNHUB_API_KEY_NOT_CONFIGURED');
    }

    const apiUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${finnhubApiKey}`;

    try {
      const response = await fetch(apiUrl);
      const responseDataText = await response.text(); // Get text for logging regardless of ok status
      console.log(`Finnhub API response text for ${symbol}:`, responseDataText);


      if (!response.ok) {
        const detailedErrorMsg = `Finnhub API Error for symbol ${symbol}: ${response.status} ${responseDataText}`;
        console.error(detailedErrorMsg);
        if (response.status === 401 || response.status === 403) {
           console.error(`Finnhub API Unauthorized/Forbidden for symbol ${symbol} (Status: ${response.status}). Check API key, permissions, and subscription plan.`);
           throw new Error(`FINNHUB_API_ERROR: ${response.status} Unauthorized/Forbidden for ${symbol}. Check API key and plan.`);
        }
        throw new Error(`FINNHUB_API_ERROR: ${response.status} for ${symbol}`);
      }
      
      const data = JSON.parse(responseDataText); // Parse after checking response.ok and logging text
      console.log(`Finnhub API parsed data for ${symbol}:`, JSON.stringify(data, null, 2));

      let priceToUse: number | null = null;

      if (typeof data.c === 'number' && data.c > 0) {
        priceToUse = data.c;
      } else if (typeof data.pc === 'number' && data.pc > 0) {
        priceToUse = data.pc; 
        console.log(`Finnhub: Using previous close price (pc: ${data.pc}) for symbol ${symbol} as current price (c) was ${data.c}.`);
      }

      if (priceToUse !== null) {
        return { currentPrice: priceToUse };
      } else {
        console.warn(`Finnhub: Valid price (c or pc) not found for symbol ${symbol}. API status was ${response.status}. Response data:`, JSON.stringify(data, null, 2));
        return { currentPrice: null };
      }
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith('FINNHUB_API_KEY_NOT_CONFIGURED') || error.message.startsWith('FINNHUB_API_ERROR'))) {
        throw error; 
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch price for symbol ${symbol} from Finnhub (generic catch): ${errorMessage}`);
      throw new Error(`FETCH_ERROR: Could not fetch price for ${symbol} from Finnhub.`);
    }
  }
);
