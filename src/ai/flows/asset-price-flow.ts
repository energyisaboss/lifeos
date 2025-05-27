
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
  // We might add 'type' here later if different APIs/endpoints are needed for stocks, crypto, funds
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
      console.error('Finnhub API key (FINNHUB_API_KEY) is not configured.');
      // It's important not to throw here if we want to allow partial data loading in the widget
      // The widget should handle the null price.
      return { currentPrice: null };
    }

    // For stocks, Finnhub uses a simple symbol. For crypto, it's often like 'BINANCE:BTCUSDT'.
    // For this initial version, we'll assume stock symbols.
    // TODO: Add logic to handle different asset types (stock, crypto, fund) if necessary,
    // possibly by using different Finnhub endpoints or symbol formatting.
    const apiUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${finnhubApiKey}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Finnhub API Error for symbol ${symbol}: ${response.status} ${errorText}`);
        return { currentPrice: null };
      }
      const data = await response.json();

      // 'c' is the current price in Finnhub's quote response
      if (typeof data.c === 'number') {
        return { currentPrice: data.c };
      } else {
        console.warn(`Finnhub: Current price (c) not found or not a number for symbol ${symbol}. Data:`, data);
        return { currentPrice: null };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch price for symbol ${symbol} from Finnhub: ${errorMessage}`);
      return { currentPrice: null };
    }
  }
);
