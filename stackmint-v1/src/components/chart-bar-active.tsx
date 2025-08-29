"use client";

import { TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Rectangle, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// Define props type
type ElectricityChartProps = {
  grid_kwh: number | null;
  renewable_kwh: number | null;
  on_site_generation_kwh: number | null;
};

export function ElectricityBarChart({
  grid_kwh,
  renewable_kwh,
  on_site_generation_kwh,
}: ElectricityChartProps) {
  // transform props into chartData
  const chartData = [
    { source: "grid_kwh", value: grid_kwh ?? 0, fill: "var(--chart-1)" },
    {
      source: "renewable_kwh",
      value: renewable_kwh ?? 0,
      fill: "var(--chart-2)",
    },
    {
      source: "on_site_generation_kwh",
      value: on_site_generation_kwh ?? 0,
      fill: "var(--chart-3)",
    },
  ];

  // config for labels
  const chartConfig = {
    value: {
      label: "kWh",
    },
    grid_kwh: {
      label: "Grid Electricity",
      color: "var(--chart-1)",
    },
    renewable_kwh: {
      label: "Renewable",
      color: "var(--chart-2)",
    },
    on_site_generation_kwh: {
      label: "On-site Generation",
      color: "var(--chart-3)",
    },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Electricity Consumption by Source</CardTitle>
        <CardDescription>Showing kWh distribution</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="source"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) =>
                chartConfig[value as keyof typeof chartConfig]?.label
              }
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar
              dataKey="value"
              strokeWidth={2}
              radius={8}
              activeIndex={1}
              activeBar={({ ...props }) => {
                return (
                  <Rectangle
                    {...props}
                    fillOpacity={0.8}
                    stroke={props.payload.fill}
                    strokeDasharray={4}
                    strokeDashoffset={4}
                  />
                );
              }}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">
          Electricity sources: Grid, Renewable, On-site
        </div>
      </CardFooter>
    </Card>
  );
}
