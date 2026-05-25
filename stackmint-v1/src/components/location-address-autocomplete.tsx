"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchAddressSuggestions,
  type AddressSuggestion,
} from "@/lib/location-search/address-search-service";

type LocationAddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (formattedAddress: string, latitude: number, longitude: number) => void;
  disabled?: boolean;
};

const DEBOUNCE_DELAY_MS = 300;
const BLUR_CLOSE_DELAY_MS = 150;
const MIN_QUERY_LENGTH = 3;
const MAX_CACHE_ENTRIES = 50;

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex < 0) return text;

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + query.length);
  const after = text.slice(matchIndex + query.length);

  return (
    <>
      {before}
      <mark className="bg-primary/20 text-foreground rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

export function LocationAddressAutocomplete({
  value,
  onChange,
  onSelect,
  disabled = false,
}: LocationAddressAutocompleteProps) {
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const cacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const inputId = "location-address-autocomplete-input";
  const listboxId = "location-address-autocomplete-listbox";
  const trimmedDebouncedQuery = debouncedQuery.trim();

  const touchCacheEntry = useCallback((key: string, value: AddressSuggestion[]) => {
    cacheRef.current.delete(key);
    cacheRef.current.set(key, value);
  }, []);

  const setCacheEntry = useCallback(
    (key: string, value: AddressSuggestion[]) => {
      if (cacheRef.current.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = cacheRef.current.keys().next().value;
        if (oldestKey) cacheRef.current.delete(oldestKey);
      }
      touchCacheEntry(key, value);
    },
    [touchCacheEntry],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(value);
    }, DEBOUNCE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [value]);

  useEffect(() => {
    const normalizedQuery = trimmedDebouncedQuery;
    if (disabled || normalizedQuery.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setErrorMessage(null);
      setIsLoading(false);
      setHighlightedIndex(-1);
      return;
    }

    const normalizedQueryKey = normalizedQuery.toLowerCase();
    const cached = cacheRef.current.get(normalizedQueryKey);
    if (cached) {
      touchCacheEntry(normalizedQueryKey, cached);
      setSuggestions(cached);
      setErrorMessage(null);
      setIsOpen(true);
      setHighlightedIndex(cached.length > 0 ? 0 : -1);
      return;
    }

    requestAbortControllerRef.current?.abort();
    const controller = new AbortController();
    requestAbortControllerRef.current = controller;
    setIsLoading(true);
    setErrorMessage(null);
    setIsOpen(true);

    fetchAddressSuggestions(normalizedQuery, controller.signal)
      .then((result) => {
        setCacheEntry(normalizedQueryKey, result);
        setSuggestions(result);
        setHighlightedIndex(result.length > 0 ? 0 : -1);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
        setHighlightedIndex(-1);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to fetch address suggestions",
        );
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [disabled, setCacheEntry, touchCacheEntry, trimmedDebouncedQuery]);

  const hasSearchResults = suggestions.length > 0;
  const hasMeaningfulQuery = trimmedDebouncedQuery.length >= MIN_QUERY_LENGTH;
  const hasDropdownContent =
    isLoading || Boolean(errorMessage) || hasSearchResults || hasMeaningfulQuery;

  const statusMessage = useMemo(() => {
    if (isLoading) return "Searching addresses...";
    if (errorMessage) return errorMessage;
    if (
      trimmedDebouncedQuery.length >= MIN_QUERY_LENGTH &&
      suggestions.length === 0
    ) {
      return "No addresses found. Try a different search term.";
    }
    if (trimmedDebouncedQuery.length > 0 && !hasMeaningfulQuery) {
      return "Type at least 3 characters to search.";
    }
    return null;
  }, [
    errorMessage,
    hasMeaningfulQuery,
    isLoading,
    suggestions.length,
    trimmedDebouncedQuery.length,
  ]);

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    onChange(suggestion.formattedAddress);
    onSelect(suggestion.formattedAddress, suggestion.latitude, suggestion.longitude);
    setIsOpen(false);
    setSuggestions([]);
    setErrorMessage(null);
    setHighlightedIndex(-1);
  };

  return (
    <div className="relative mt-1">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          placeholder="Start typing an address..."
          value={value}
          disabled={disabled}
          onFocus={() => {
            if (hasDropdownContent || value.trim().length >= MIN_QUERY_LENGTH) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            setTimeout(() => setIsOpen(false), BLUR_CLOSE_DELAY_MS);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (!isOpen) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightedIndex((prev) =>
                suggestions.length === 0 ? -1 : (prev + 1) % suggestions.length,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightedIndex((prev) =>
                suggestions.length === 0
                  ? -1
                  : prev <= 0
                    ? suggestions.length - 1
                    : prev - 1,
              );
            } else if (event.key === "Enter" && highlightedIndex >= 0) {
              event.preventDefault();
              const selected = suggestions[highlightedIndex];
              if (selected) selectSuggestion(selected);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0
              ? `${listboxId}-option-${suggestions[highlightedIndex]?.id}`
              : undefined
          }
          className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm shadow-xs transition-all duration-150 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div
        className={cn(
          "absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg transition-all duration-150",
          isOpen && hasDropdownContent
            ? "max-h-72 opacity-100 translate-y-0"
            : "max-h-0 opacity-0 -translate-y-1 pointer-events-none",
        )}
      >
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={inputId}
          className="max-h-72 overflow-y-auto py-1"
        >
          {isLoading && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching addresses...
            </li>
          )}

          {!isLoading && errorMessage && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorMessage}
            </li>
          )}

          {!isLoading &&
            !errorMessage &&
            suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`${listboxId}-option-${suggestion.id}`}
                role="option"
                aria-selected={highlightedIndex === index}
                className={cn(
                  "cursor-pointer px-3 py-2 transition-colors duration-100",
                  highlightedIndex === index
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/70",
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(suggestion);
                }}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {highlightMatch(
                        suggestion.displayName || suggestion.formattedAddress,
                        trimmedDebouncedQuery,
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {highlightMatch(
                        suggestion.formattedAddress,
                        trimmedDebouncedQuery,
                      )}
                    </p>
                  </div>
                </div>
              </li>
            ))}

          {!isLoading &&
            !errorMessage &&
            suggestions.length === 0 &&
            statusMessage && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {statusMessage}
              </li>
            )}
        </ul>
      </div>
    </div>
  );
}
