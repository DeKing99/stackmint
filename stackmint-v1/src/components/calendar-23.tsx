"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Calendar23Props {
  range: DateRange | undefined;
  setRange: React.Dispatch<React.SetStateAction<DateRange | undefined>>;
}

export function Calendar23({ range, setRange }: Calendar23Props) {
  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="dates" className="px-1">
        Select your stay
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id="dates"
            className="w-56 justify-between font-normal"
          >
            {range?.from && range?.to
              ? `${range.from.toLocaleDateString()} - ${range.to.toLocaleDateString()}`
              : "Select date"}
            <ChevronDownIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden p-0"
          align="start"
          // Prevent popover from closing when interacting with dropdowns
          onInteractOutside={(event) => {
            // Prevent closing if the target is a select or its dropdown
            if (
              event.target instanceof HTMLElement &&
              (event.target.tagName === "SELECT" ||
                event.target.closest(".rdp-caption_dropdowns"))
            ) {
              event.preventDefault();
            }
          }}
        >
          <Calendar
            mode="range"
            selected={range}
            captionLayout="dropdown"
            onSelect={setRange}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
