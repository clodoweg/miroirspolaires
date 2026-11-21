import React from 'react';
import { theme, dividerStyle, dividerTopStyle } from '@/lib/theme';
import { stringToColor } from '../chartUtils';

interface LegendItem {
    name: string;
    color?: string;
}

interface Props {
    items: LegendItem[] | string[];
    maxItems?: number;
    position?: 'top' | 'bottom';
}

/**
 * Shared legend component for all charts.
 * Automatically generates colors from strings using stringToColor if no color provided.
 */
export default function ChartLegend({ items, maxItems, position = 'bottom' }: Props) {
    const normalizedItems: LegendItem[] = items.map((item) =>
        typeof item === 'string'
            ? { name: item, color: stringToColor(item) }
            : { ...item, color: item.color || stringToColor(item.name) },
    );

    const displayItems = maxItems ? normalizedItems.slice(0, maxItems) : normalizedItems;
    const hiddenCount = maxItems ? Math.max(0, normalizedItems.length - maxItems) : 0;

    const borderStyle = position === 'bottom' ? dividerTopStyle : dividerStyle;

    const marginClass = position === 'bottom' ? 'mt-6 pt-4' : 'mb-6 pb-4';

    return (
        <div className={`flex flex-wrap justify-center gap-x-4 gap-y-2 ${marginClass}`} style={borderStyle}>
            {displayItems.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium" style={{ color: theme.text.body }}>
                        {item.name}
                    </span>
                </div>
            ))}
            {hiddenCount > 0 && (
                <span className="text-xs" style={{ color: theme.text.muted }}>
                    +{hiddenCount} autres
                </span>
            )}
        </div>
    );
}
