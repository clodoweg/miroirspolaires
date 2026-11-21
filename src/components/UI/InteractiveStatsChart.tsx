import React, { useState, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { theme, glassStyle, dividerStyle } from '@/lib/theme';
import { ChartLegend, MetricToggle } from './charts';
import { stringToColor } from './chartUtils';
import type { Photo } from '@/lib/photos';

interface InteractiveStatsChartProps {
    photos: Photo[];
}

type Metric = 'exposure' | 'count';
type DimensionX = 'year' | 'location' | 'observatory';

const InteractiveStatsChart: React.FC<InteractiveStatsChartProps> = ({ photos }) => {
    const [metric, setMetric] = useState<Metric>('exposure');
    const [dimensionX] = useState<DimensionX>('year');
    const [segmentBy] = useState<'location' | 'observatory'>('observatory');

    // Memos
    const processedData = useMemo(() => {
        const groups: Record<string, { total: number; segments: Record<string, number> }> = {};

        photos.forEach((photo) => {
            if (!photo) return;

            let xKey = 'Inconnu';
            if (dimensionX === 'year') xKey = photo.year.toString();
            else if (dimensionX === 'location') xKey = photo.locations || 'Inconnu';
            else if (dimensionX === 'observatory') xKey = photo.observatories[0] || 'Inconnu';

            let segKey = 'Inconnu';
            if (segmentBy === 'location') segKey = photo.locations || 'Inconnu';
            else if (segmentBy === 'observatory') segKey = photo.observatories[0] || 'Inconnu';

            const value = metric === 'exposure' ? photo.integrationSeconds || 0 : 1;

            if (!groups[xKey]) {
                groups[xKey] = { total: 0, segments: {} };
            }
            groups[xKey].total += value;
            groups[xKey].segments[segKey] = (groups[xKey].segments[segKey] || 0) + value;
        });

        const result = Object.entries(groups).map(([x, data]) => {
            const finalSegments = Object.entries(data.segments)
                .map(([seg, val]) => ({
                    label: seg,
                    value: metric === 'exposure' ? Math.round(val / 3600) : val,
                    color:
                        (segmentBy === 'location'
                            ? theme.chartData.locations[seg]
                            : theme.chartData.observatories[seg]) || stringToColor(seg),
                }))
                .sort((a, b) => b.value - a.value);

            return {
                x,
                total: metric === 'exposure' ? Math.round(data.total / 3600) : data.total,
                segments: finalSegments,
            };
        });

        if (dimensionX === 'year') {
            result.sort((a, b) => parseInt(a.x) - parseInt(b.x));
        } else {
            result.sort((a, b) => b.total - a.total);
        }

        return result;
    }, [photos, metric, dimensionX, segmentBy]);

    const maxVal = Math.max(...processedData.map((d) => d.total), 1);
    const yMax = Math.ceil(maxVal * 1.1);

    const legendItems = useMemo(() => {
        const uniqueSegments = new Set<string>();
        processedData.forEach((d) => d.segments.forEach((s) => uniqueSegments.add(s.label)));

        return Array.from(uniqueSegments)
            .sort()
            .map((label) => ({
                name: label,
                color:
                    (segmentBy === 'location'
                        ? theme.chartData.locations[label]
                        : theme.chartData.observatories[label]) || stringToColor(label),
            }));
    }, [processedData, segmentBy]);

    return (
        <div className="w-full rounded-xl p-4 md:p-6" style={glassStyle}>
            <div className="mb-8 flex flex-col gap-6">
                <div
                    className="flex flex-col justify-between gap-4 pb-4 md:flex-row md:items-center"
                    style={dividerStyle}
                >
                    <h3 style={{ color: theme.text.heading }}>
                        <BarChart3 className="mr-2 inline h-5 w-5" style={{ color: theme.accent.primary }} />
                        Statistiques d'exposition
                    </h3>
                    <MetricToggle metric={metric} onMetricChange={setMetric} />
                </div>
            </div>

            {/* Chart Area */}
            <div className="relative mt-14 h-64 w-full md:h-80">
                {/* Grid Lines */}
                <div
                    className="pointer-events-none absolute inset-0 flex flex-col justify-between text-xs"
                    style={{ color: theme.text.muted }}
                >
                    {[0, 0.25, 0.5, 0.75, 1].reverse().map((pct, i) => (
                        <div
                            key={i}
                            className="flex h-0 w-full items-center"
                            style={{ borderBottom: `1px dashed ${theme.border.light}` }}
                        >
                            <span className="w-12 -translate-y-1/2 pr-3 text-right">
                                {Math.round(yMax * pct)}
                                {metric === 'exposure' ? 'h' : ''}
                            </span>
                            <div className="flex-1"></div>
                        </div>
                    ))}
                </div>

                {/* Bars Container */}
                <div className="absolute top-0 right-0 bottom-0 left-12 flex items-end justify-between pr-2 pl-4">
                    {processedData.map((data) => (
                        <div
                            key={data.x}
                            className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end px-0.5 md:px-1"
                        >
                            {/* Tooltip */}
                            <div
                                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 min-w-chart-tooltip -translate-x-1/2 translate-y-2 transform rounded-lg px-3 py-2 whitespace-normal opacity-0 shadow-xl transition-opacity group-hover:translate-y-0 group-hover:opacity-100 md:left-auto md:min-w-0 md:translate-x-0 md:whitespace-nowrap"
                                style={{
                                    backgroundColor: theme.bg.glassSolid,
                                    border: `1px solid ${theme.border.light}`,
                                    color: theme.text.heading,
                                }}
                            >
                                <div className="mb-1 pb-1 font-bold" style={dividerStyle}>
                                    {data.x} :{' '}
                                    <span style={{ color: theme.accent.primary }}>
                                        {data.total}
                                        {metric === 'exposure' ? 'h' : ''}
                                    </span>
                                </div>
                                {data.segments.map((seg) => (
                                    <div key={seg.label} className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="h-2 w-2 rounded-full"
                                                style={{ backgroundColor: seg.color }}
                                            ></span>
                                            <span style={{ color: theme.text.muted }}>{seg.label}</span>
                                        </div>
                                        <span className="font-mono">
                                            {seg.value}
                                            {metric === 'exposure' ? 'h' : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Stacked Bar */}
                            <div
                                className="relative flex w-full max-w-[32px] cursor-pointer flex-col-reverse overflow-hidden rounded-t-sm shadow-xs transition-all duration-300 hover:shadow-md hover:brightness-110 md:max-w-[48px]"
                                style={{ height: `${(data.total / yMax) * 100}%` }}
                            >
                                {data.segments.map((seg, i) => (
                                    <div
                                        key={i}
                                        className="w-full transition-all duration-500 ease-out"
                                        style={{
                                            backgroundColor: seg.color,
                                            height: `${(seg.value / data.total) * 100}%`,
                                        }}
                                    ></div>
                                ))}
                            </div>

                            {/* X Axis Label */}
                            <div
                                className="absolute top-full left-1/2 max-w-full -translate-x-1/2 truncate pt-2 text-center text-[10px] font-medium [writing-mode:vertical-rl] md:text-xs md:[writing-mode:horizontal-tb]"
                                style={{ color: theme.text.body }}
                            >
                                {dimensionX === 'year' ? data.x : data.x.substring(0, 12)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <ChartLegend items={legendItems} />
        </div>
    );
};

export default InteractiveStatsChart;
