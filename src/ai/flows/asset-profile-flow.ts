
'use server';
/**
 * @fileOverview A Genkit flow to fetch asset profile information (like company name) using Finnhub API.
 *
 * - getAssetProfile - Fetches the profile for a given asset symbol.
 * - AssetProfileInput - Input schema (symbol).
 * - AssetProfileOutput - Output schema (assetName).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AssetProfileInputSchema = z.object({
  symbol: z.string().describe('The stock/asset symbol (e.g., AAPL, MSFT).'),
});
export type AssetProfileInput = z.infer<typeof AssetProfileInputSchema>;

const AssetProfileOutputSchema = z.object({
  assetName: z.string().nullable().describe('The name of the asset/company. Null if not found or error.'),
});
export type AssetProfileOutput = z.infer<typeof AssetProfileOutputSchema>;

export async function getAssetProfile(input: AssetProfileInput): Promise<AssetProfileOutput> {
  return assetProfileFlow(input);
}

const assetProfileFlow = ai.defineFlow(
  {
    name: 'assetProfileFlow',
    inputSchema: AssetProfileInputSchema,
    outputSchema: AssetProfileOutputSchema,
  },
  async ({ symbol }) => {
    const finnhubApiKey = process.env.FINNHUB_API_KEY;

    if (!finnhubApiKey) {
      const errorMsg = 'Finnhub API key (FINNHUB_API_KEY) is not configured in .env.local. Cannot fetch asset profiles.';
      console.error(errorMsg);
      // Not throwing a hard error here, as the primary price fetching might still work.
      // The widget should handle a null assetName gracefully.
      return { assetName: null };
    }

    const apiUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol.toUpperCase()}&token=${finnhubApiKey}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Finnhub Profile API Error for symbol ${symbol}: ${response.status} ${errorText}`);
        return { assetName: null };
      }
      const data = await response.json();

      // 'name' is the company name in Finnhub's profile2 response
      if (data && typeof data.name === 'string' && data.name.trim() !== '') {
        return { assetName: data.name };
      } else {
        // This can happen if the symbol is valid but Finnhub has no profile name (e.g., some indices or very new listings)
        // or if the data object is empty (Finnhub sometimes returns {} for invalid symbols like mutual funds for this endpoint)
        console.warn(`Finnhub: Company name not found for symbol ${symbol}. Full API response:`, JSON.stringify(data, null, 2));
        return { assetName: null };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch profile for symbol ${symbol} from Finnhub: ${errorMessage}`);
      return { assetName: null };
    }
  }
);
