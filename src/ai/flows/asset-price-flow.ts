
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
      if (!response.ok) {
        const errorText = await response.text();
        const detailedErrorMsg = `Finnhub API Error for symbol ${symbol}: ${response.status} ${errorText}`;
        console.error(detailedErrorMsg);
        // Log more for specific errors if needed for debugging
        if (response.status === 401 || response.status === 403) {
           console.error(`Finnhub API Unauthorized/Forbidden for symbol ${symbol}. Check API key and permissions.`);
        }
        throw new Error(`FINNHUB_API_ERROR: ${response.status} for ${symbol}`);
      }
      const data = await response.json();
      console.log(`Finnhub API response for ${symbol}:`, JSON.stringify(data, null, 2));


      // 'c' is the current price, 'pc' is the previous close price.
      // For mutual funds, 'c' might be 0 or missing, but 'pc' might be available.
      let priceToUse: number | null = null;

      if (typeof data.c === 'number' && data.c > 0) {
        priceToUse = data.c;
      } else if (typeof data.pc === 'number' && data.pc > 0) {
        priceToUse = data.pc; // Use previous close if current is not valid
        console.log(`Finnhub: Using previous close price (pc: ${data.pc}) for symbol ${symbol} as current price (c) was ${data.c}.`);
      }

      if (priceToUse !== null) {
        return { currentPrice: priceToUse };
      } else {
        console.warn(`Finnhub: Neither current price (c) nor previous close price (pc) found or valid for symbol ${symbol}. Full API response:`, JSON.stringify(data, null, 2));
        return { currentPrice: null };
      }
    } catch (error) {
      // Handle errors already thrown (like API key or Finnhub API error)
      if (error instanceof Error && (error.message.startsWith('FINNHUB_API_KEY_NOT_CONFIGURED') || error.message.startsWith('FINNHUB_API_ERROR'))) {
        throw error; // Re-throw to be caught by the widget
      }
      // Handle generic fetch errors (network issues, etc.)
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch price for symbol ${symbol} from Finnhub (generic catch): ${errorMessage}`);
      throw new Error(`FETCH_ERROR: Could not fetch price for ${symbol} from Finnhub.`);
    }
  }
);
