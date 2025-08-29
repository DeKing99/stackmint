"use client";

import { Pie, PieChart } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

export interface ChartPieLegendProps {
  title?: string;
  description?: string;
  data: {[key: string]: string | number }[]; // your chart data
  dataKey: string; // which property to use for value
  nameKey: string; // which property to use for labels
  chartConfig?: ChartConfig; // optional custom chart config
}

export function ChartPieLegend({
  title = "Pie Chart",
  description = "",
  data,
  dataKey,
  nameKey,
  chartConfig,
}: ChartPieLegendProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig ?? {}}
          className="mx-auto aspect-square max-h-[300px]"
        >
          <PieChart>
            <Pie data={data} dataKey={dataKey} nameKey={nameKey} />
            <ChartLegend
              content={<ChartLegendContent nameKey={nameKey} payload={undefined} />}
              className="-translate-y-2 flex-wrap gap-2 *:basis-1/4 *:justify-center"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
