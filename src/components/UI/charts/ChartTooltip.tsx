import React from 'react';
import { theme, dividerStyle } from '@/lib/theme';
import { formatAxisLabel, type AxisMode } from '../chartUtils';

interface TooltipEntry {
    name?: string;
    value: number | string | undefined;
    color?: string;
}

interface Props {
    label?: string | number;
    entries: TooltipEntry[];
    valueMode?: AxisMode;
    showColorDot?: boolean;
    sortByValue?: boolean;
}

/**
 * Shared tooltip component for all Recharts-based charts.
 * Provides consistent glass-morphism styling and formatting.
 */
export default function ChartTooltip({
    label,
    entries,
    valueMode = 'integrationSeconds',
    showColorDot = true,
    sortByValue = true,
}: Props) {
    const sortedEntries = sortByValue
        ? [...entries].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
        : entries;

    return (
        <div
            className="min-w-[140px] rounded-lg p-3 shadow-xl backdrop-blur-xl"
            style={{
                backgroundColor: theme.bg.glassSolid,
                border: `1px solid ${theme.border.light}`,
            }}
        >
            {label && (
                <div className="mb-2 pb-1 text-xs font-bold" style={{ color: theme.text.heading, ...dividerStyle }}>
                    {label}
                </div>
            )}
            <div className="space-y-1.5">
                {sortedEntries.map((entry, index) => {
                    if (entry.value === null || entry.value === undefined) return null;
                    const formattedValue =
                        typeof entry.value === 'number' ? formatAxisLabel(entry.value, valueMode) : entry.value;

                    return (
                        <div key={index} className="flex items-center justify-between gap-4 text-[11px]">
                            <div className="flex items-center gap-2">
                                {showColorDot && entry.color && (
                                    <div
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ backgroundColor: entry.color }}
                                    />
                                )}
                                {entry.name && <span style={{ color: theme.text.muted }}>{entry.name}:</span>}
                            </div>
                            <span className="font-bold" style={{ color: theme.text.heading }}>
                                {formattedValue}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
