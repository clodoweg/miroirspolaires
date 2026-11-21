import React from 'react';
import { theme, toggleButtonStyle } from '@/lib/theme';
import {
    BarChart3,
    CircleDot,
    LineChart as LineChartIcon,
    AreaChart as AreaChartIcon,
    PieChart as PieChartIcon,
    Grid3X3,
} from 'lucide-react';

export type ChartType = 'scatter' | 'bar' | 'line' | 'area' | 'donut' | 'heatmap';

interface ChartTypeOption {
    value: ChartType;
    label: string;
    icon: React.ElementType;
}

const CHART_TYPE_OPTIONS: ChartTypeOption[] = [
    { value: 'scatter', label: 'Point', icon: CircleDot },
    { value: 'bar', label: 'Barres', icon: BarChart3 },
    { value: 'line', label: 'Lignes', icon: LineChartIcon },
    { value: 'area', label: 'Aires', icon: AreaChartIcon },
    { value: 'donut', label: 'Donut', icon: PieChartIcon },
    { value: 'heatmap', label: 'Heatmap', icon: Grid3X3 },
];

interface Props {
    chartType: ChartType;
    onChartTypeChange: (type: ChartType) => void;
    /** Optional filter to show only certain chart types */
    allowedTypes?: ChartType[];
}

/**
 * Shared chart type selector toggle.
 */
export default function ChartTypeToggle({ chartType, onChartTypeChange, allowedTypes }: Props) {
    const options = allowedTypes
        ? CHART_TYPE_OPTIONS.filter((o) => allowedTypes.includes(o.value))
        : CHART_TYPE_OPTIONS;

    return (
        <div className="flex w-fit max-w-full flex-wrap rounded-lg p-1" style={{ backgroundColor: theme.bg.glass }}>
            {options.map((option) => {
                const Icon = option.icon;
                return (
                    <button
                        key={option.value}
                        onClick={() => onChartTypeChange(option.value)}
                        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all"
                        style={toggleButtonStyle(chartType === option.value)}
                    >
                        <Icon className="h-4 w-4" /> {option.label}
                    </button>
                );
            })}
        </div>
    );
}
