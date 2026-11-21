import React, { useState, useMemo } from 'react';
import type { Photo } from '@/lib/photos';
import { theme, glassStyle, dividerStyle } from '@/lib/theme';
import MetricToggle from './MetricToggle';

type Metric = 'exposure' | 'count';
type GroupBy = 'year' | 'constellation';

interface Props {
    photos: Photo[];
    groupBy: GroupBy;
    title: string;
    icon?: string;
    limit?: number;
    defaultMetric?: Metric;
}

/**
 * Unified horizontal bar chart component.
 * Replaces ProductionChart and ConstellationChart with a single configurable component.
 *
 * Usage:
 * - For production by year: <HorizontalBarChart photos={...} groupBy="year" title="📅 Production par année" />
 * - For constellations: <HorizontalBarChart photos={...} groupBy="constellation" title="✨ Constellations favorites" limit={10} />
 */
export default function HorizontalBarChart({ photos, groupBy, title, icon, limit, defaultMetric = 'exposure' }: Props) {
    const [metric, setMetric] = useState<Metric>(defaultMetric);

    const data = useMemo(() => {
        const groups: Record<string, number> = {};

        photos.forEach((p) => {
            let key: string;
            if (groupBy === 'year') {
                key = p.year.toString();
            } else {
                key = p.constellation || 'Inconnu';
            }

            const val = metric === 'exposure' ? p.integrationSeconds || 0 : 1;
            groups[key] = (groups[key] || 0) + val;
        });

        // Convert to array and sort
        let result = Object.entries(groups).map(([label, val]) => ({
            label,
            value: metric === 'exposure' ? Math.round(val / 3600) : val,
        }));

        // Sort: years DESC, others by value DESC
        if (groupBy === 'year') {
            result.sort((a, b) => parseInt(b.label) - parseInt(a.label));
        } else {
            result.sort((a, b) => b.value - a.value);
        }

        // Apply limit if specified
        if (limit) {
            result = result.slice(0, limit);
        }

        return result;
    }, [photos, groupBy, metric, limit]);

    const maxVal = Math.max(...data.map((d) => d.value), 1);

    return (
        <div className="flex h-full flex-col rounded-xl p-6" style={glassStyle}>
            {/* HEADER */}
            <div
                className="mb-6 flex flex-col justify-between gap-4 pb-4 sm:flex-row sm:items-center"
                style={dividerStyle}
            >
                <h3 style={{ color: theme.text.heading }}>
                    {icon && <span className="mr-1">{icon}</span>}
                    {title}
                </h3>

                {/* Metric Toggle */}
                <MetricToggle metric={metric} onMetricChange={setMetric} />
            </div>

            {/* BARS */}
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
                {data.map((item) => (
                    <div key={item.label} className="w-full">
                        <div className="mb-1 flex justify-between text-sm">
                            <span className="font-medium" style={{ color: theme.text.heading }}>
                                {item.label}
                            </span>
                            <span className="font-mono" style={{ color: theme.text.body }}>
                                {item.value}
                                {metric === 'exposure' ? 'h' : ''}
                            </span>
                        </div>
                        <div
                            className="h-2 w-full overflow-hidden rounded-full"
                            style={{ backgroundColor: theme.border.light }}
                        >
                            <div
                                className="h-full rounded-full transition-all duration-500 ease-out"
                                style={{
                                    width: `${(item.value / maxVal) * 100}%`,
                                    backgroundColor: theme.accent.primary,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
