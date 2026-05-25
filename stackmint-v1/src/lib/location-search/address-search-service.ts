export type AddressSuggestion = {
  id: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  displayName?: string;
};

type AddressSearchResponse = {
  suggestions: AddressSuggestion[];
};

const MAX_RETRY_ATTEMPTS = 1;
const RETRY_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchAddressSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) return [];

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_RETRY_ATTEMPTS) {
    try {
      const response = await fetch(
        `/api/location-search?query=${encodeURIComponent(normalizedQuery)}`,
        { signal },
      );

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRY_ATTEMPTS) {
          attempt += 1;
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`Address lookup failed (${response.status})`);
      }

      const data = (await response.json()) as AddressSearchResponse;
      return Array.isArray(data?.suggestions) ? data.suggestions : [];
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError =
        error instanceof Error
          ? error
          : new Error("Address lookup failed unexpectedly");
      if (attempt < MAX_RETRY_ATTEMPTS) {
        attempt += 1;
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      break;
    }
  }

  throw lastError ?? new Error("Address lookup failed");
}
