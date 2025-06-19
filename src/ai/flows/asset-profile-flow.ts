
'use server';
/**
 * @fileOverview A Genkit flow to fetch asset profile information (like company name) using Tiingo API.
 *
 * - getAssetProfile - Fetches the profile for a given asset symbol.
 * - AssetProfileInput - Input schema (symbol).
 * - AssetProfileOutput - Output schema (assetName).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AssetProfileInputSchema = z.object({
  symbol: z.string().describe('The stock/asset symbol (e.g., AAPL, MSFT, FXAIX).'),
  apiKey: z.string().optional().describe('Optional Tiingo API key.'),
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
  async ({ symbol, apiKey }) => {

    const tiingoApiKey = apiKey || process.env.TIINGO_API_KEY;
    if (!tiingoApiKey) {
      const errorMsg = 'Tiingo API key (TIINGO_API_KEY) is not configured in .env.local. Cannot fetch asset profiles.';
      console.error(errorMsg);
      // Do not throw hard error, allow graceful degradation in UI if name isn't found.
      return { assetName: null }; 
    }

    // Tiingo metadata endpoint
    const apiUrl = `https://api.tiingo.com/tiingo/daily/${symbol.toUpperCase()}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${tiingoApiKey}`
        }
      });
      
      const responseDataText = await response.text();
      console.log(`Tiingo API metadata response text for ${symbol}:`, responseDataText);


      if (!response.ok) {
        console.error(`Tiingo Profile API Error for symbol ${symbol}: ${response.status} ${responseDataText}`);
         if (response.status === 404) {
            console.warn(`Tiingo: Symbol ${symbol} not found for profile (404). API response: ${responseDataText}`);
        }
        return { assetName: null };
      }
      
      const data = JSON.parse(responseDataText);

      if (data && typeof data.name === 'string' && data.name.trim() !== '') {
        return { assetName: data.name };
      } else {
        console.warn(`Tiingo: Company name not found for symbol ${symbol} in metadata. Full API response:`, JSON.stringify(data, null, 2));
        return { assetName: null };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to fetch profile for symbol ${symbol} from Tiingo: ${errorMessage}`);
      return { assetName: null };
    }
  }
);
