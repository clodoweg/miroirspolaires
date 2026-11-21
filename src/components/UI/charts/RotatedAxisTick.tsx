import React from 'react';
import { theme } from '@/lib/theme';
import { formatAxisLabel, type AxisMode } from '../chartUtils';

interface Props {
    x: number;
    y: number;
    payload: { value: any };
    axisMode: AxisMode;
}

/**
 * Shared rotated axis tick for XAxis in Recharts.
 * Eliminates the repeated tick rendering code across multiple charts.
 */
export default function RotatedAxisTick({ x, y, payload, axisMode }: Props) {
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={0} dy={16} textAnchor="end" fill={theme.text.muted} transform="rotate(-45)" fontSize={11}>
                {formatAxisLabel(payload.value, axisMode)}
            </text>
        </g>
    );
}
