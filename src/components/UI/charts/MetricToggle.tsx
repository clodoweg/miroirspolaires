import React from 'react';
import { theme, toggleButtonStyle } from '@/lib/theme';
import { Clock, Hash } from 'lucide-react';

type Metric = 'exposure' | 'count';

interface Props {
    metric: Metric;
    onMetricChange: (metric: Metric) => void;
}

/**
 * Shared metric toggle (Temps/Photos) used by multiple chart components.
 */
export default function MetricToggle({ metric, onMetricChange }: Props) {
    return (
        <div className="flex self-start rounded-lg p-1 sm:self-auto" style={{ backgroundColor: theme.bg.glass }}>
            <button
                onClick={() => onMetricChange('exposure')}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all"
                style={toggleButtonStyle(metric === 'exposure')}
            >
                <Clock className="h-4 w-4" /> Temps
            </button>
            <button
                onClick={() => onMetricChange('count')}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all"
                style={toggleButtonStyle(metric === 'count')}
            >
                <Hash className="h-4 w-4" /> Photos
            </button>
        </div>
    );
}
