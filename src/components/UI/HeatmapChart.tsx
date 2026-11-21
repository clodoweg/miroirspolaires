import React, { useMemo } from 'react';
import { theme, hexToRgba } from '@/lib/theme';
import { type PhotoWithImage, type AxisMode, aggregateHeatmap, formatAxisLabel } from './chartUtils';

interface Props {
    photos: PhotoWithImage[];
    xAxis: AxisMode;
    yAxis: AxisMode;
    valueMode: AxisMode;
}

export default function HeatmapChart({ photos, xAxis, yAxis, valueMode }: Props) {
    const { data, xValues, yValues, maxValue } = useMemo(() => {
        return aggregateHeatmap(photos, xAxis, yAxis, valueMode);
    }, [photos, xAxis, yAxis, valueMode]);

    // Create a lookup map for quick access
    const cellMap = useMemo(() => {
        const map: Record<string, number> = {};
        data.forEach((d) => {
            map[`${d.x}::${d.y}`] = d.value;
        });
        return map;
    }, [data]);

    const getColor = (value: number) => {
        if (value === 0) return 'transparent';
        const intensity = Math.min(value / maxValue, 1);
        // Gold gradient: Use RGB of Champagne Gold (212, 180, 131)
        // Opacity from 0.1 to 1
        const opacity = 0.1 + intensity * 0.9;
        return hexToRgba(theme.accent.primary, opacity);
    };

    const cellWidth = Math.max(40, Math.min(80, 800 / xValues.length));
    const cellHeight = 24;

    // Calculate dynamic top padding based on max label length roughly
    const maxLabelLength = Math.max(...xValues.map((x) => String(x).length));
    // text-[10px] ~ 6px per char width? rotated 45deg => width * sin(45) ~ width * 0.707
    // + minimal padding
    const dynamicPadding = Math.max(20, Math.ceil(maxLabelLength * 3));

    return (
        <div className="flex h-chart-lg w-full flex-col items-center overflow-auto">
            <div className="mx-auto w-fit max-w-full overflow-x-auto pr-4">
                <div
                    className="mx-auto min-w-max transition-all duration-300 ease-in-out"
                    style={{ paddingTop: `${dynamicPadding}px` }}
                >
                    {/* Header row with X labels */}
                    <div className="flex" style={{ marginLeft: 120 }}>
                        {xValues.map((x) => (
                            <div
                                key={x}
                                className="text-center text-[10px] text-mp-text-muted"
                                style={{ width: cellWidth }}
                                title={x}
                            >
                                <span className="inline-block origin-bottom-left -rotate-45 transform whitespace-nowrap">
                                    {x}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Grid rows */}
                    <div className="mt-4">
                        {yValues.map((y) => (
                            <div key={y} className="flex items-center">
                                <div
                                    className="w-[120px] truncate pr-2 text-right text-xs text-mp-text-muted"
                                    title={y}
                                >
                                    {y}
                                </div>
                                {xValues.map((x) => {
                                    const value = cellMap[`${x}::${y}`] || 0;
                                    return (
                                        <div
                                            key={`${x}-${y}`}
                                            className="group relative cursor-pointer border transition-all hover:z-10 hover:ring-2 hover:ring-mp-accent"
                                            style={{
                                                width: cellWidth,
                                                height: cellHeight,
                                                backgroundColor: getColor(value),
                                                borderColor: theme.border.subtle,
                                            }}
                                            title={`${x} × ${y}: ${formatAxisLabel(value, valueMode)}`}
                                        >
                                            {/* Tooltip on hover */}
                                            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                                                <div
                                                    className="rounded-sm px-2 py-1 text-xs font-bold whitespace-nowrap shadow-lg"
                                                    style={{
                                                        backgroundColor: theme.bg.glassSolid,
                                                        color: theme.text.heading,
                                                        border: `1px solid ${theme.border.light}`,
                                                    }}
                                                >
                                                    {formatAxisLabel(value, valueMode)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="mt-6 flex w-full items-center justify-center gap-2 border-t border-mp-glass-border pt-4">
                <span className="text-xs text-mp-text-muted">0</span>
                <div
                    className="flex h-3 overflow-hidden rounded-sm"
                    style={{ border: `1px solid ${theme.border.subtle}` }}
                >
                    {[0, 0.2, 0.4, 0.6, 0.8, 1].map((intensity, i) => (
                        <div
                            key={i}
                            className="w-8"
                            style={{ backgroundColor: hexToRgba(theme.accent.primary, 0.1 + intensity * 0.9) }}
                        />
                    ))}
                </div>
                <span className="text-xs text-mp-text-muted">{formatAxisLabel(maxValue, valueMode)}</span>
            </div>
        </div>
    );
}
