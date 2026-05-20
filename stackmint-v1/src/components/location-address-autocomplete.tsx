"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: string, lat: number, lng: number) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function LocationAddressAutocomplete({
  value,
  onChange,
  onSelect,
  disabled = false,
  placeholder = "e.g., 123 Main Street, City, State 12345",
}: Props) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        format: "json",
        q: query,
        limit: "5",
        addressdetails: "1",
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          headers: {
            "Accept-Language": "en",
            // Nominatim requires a descriptive User-Agent
            "User-Agent": "Stackmint/1.0 (https://stackmint.app)",
          },
        },
      );

      if (!response.ok) {
        setSuggestions([]);
        return;
      }

      const data: NominatimResult[] = await response.json();
      setSuggestions(data);
      setIsOpen(data.length > 0);
    } catch (err) {
      console.error("Nominatim geocoding request failed:", err);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 400);
  };

  const handleSelect = (result: NominatimResult) => {
    onSelect(result.display_name, parseFloat(result.lat), parseFloat(result.lon));
    setIsOpen(false);
    setSuggestions([]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        disabled={disabled}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
        autoComplete="off"
      />
      {isLoading && (
        <p className="text-xs text-gray-400 mt-1">Searching addresses…</p>
      )}

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((result) => (
            <li key={result.place_id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // prevent input blur before click registers
                  e.preventDefault();
                  handleSelect(result);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
              >
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
