
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
  symbol: z.string().describe('The stock/asset symbol (e.g., AAPL, MSFT).'),
});
export type AssetPriceInput = z.infer<typeof AssetPriceInputSchema>;

const AssetPriceOutputSchema = z.object({
  currentPrice: z.number().nullable().describe('The current market price of the asset. Null if not found or error.'),
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
        throw new Error(`FINNHUB_API_ERROR: ${response.status} for ${symbol}`);
      }
      const data = await response.json();

      // 'c' is the current price in Finnhub's quote response
      if (typeof data.c === 'number') {
        return { currentPrice: data.c };
      } else {
        console.warn(`Finnhub: Current price (c) not found or not a number for symbol ${symbol}. Full API response:`, JSON.stringify(data, null, 2));
        return { currentPrice: null }; // Symbol might be valid, but no price data (e.g., delisted, or no recent trade for stocks, or it's a fund)
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
