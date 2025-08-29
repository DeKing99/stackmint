"use client";

import { TrendingUp } from "lucide-react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export const description = "A radar chart with a grid and circle";

export interface RadarChartProps {
  title: string;
  description: string;
  data: Array<Record<string, number | string>>; // e.g., [{ category: 'Electricity', value: 100 }]
  dataKey: string; // the key to plot, e.g., "value"
  angleKey: string; // the axis key, e.g., "category"
  color?: string;
  footerText?: string;
}

export function ChartRadarGridCircle({
  title,
  description,
  data,
  dataKey,
  angleKey,
  color = "var(--color-desktop)",
  footerText,
}: RadarChartProps) {
    const chartConfig = {
      value: {
        label: "Value",
        color: color, // from props
      },
    } satisfies ChartConfig;
  return (
    <Card>
      <CardHeader className="items-center pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
              <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
          <RadarChart data={data}>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <PolarGrid gridType="circle" />
            <PolarAngleAxis dataKey={angleKey} />
            <Radar
              dataKey={dataKey}
              fill={color}
              fillOpacity={0.6}
              dot={{
                r: 4,
                fillOpacity: 1,
              }}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
      {footerText && (
        <CardFooter className="flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 leading-none font-medium">
            {footerText} <TrendingUp className="h-4 w-4" />
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
