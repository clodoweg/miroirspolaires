import React from 'react';
import { glassStyle } from '@/lib/theme';

interface Props {
    children: React.ReactNode;
    className?: string;
    height?: string;
}

/**
 * Shared wrapper component for chart cards.
 * Provides consistent glass-morphism styling.
 */
export default function ChartCard({ children, className = '', height }: Props) {
    return (
        <div className={`flex w-full flex-col rounded-xl p-6 ${className}`} style={{ ...glassStyle, height }}>
            {children}
        </div>
    );
}
