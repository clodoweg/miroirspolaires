import type { ReactNode, MouseEvent } from 'react';

interface Props {
    active?: boolean;
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    title?: string;
    disabled?: boolean;
    /** Tighter chip used when many sit on a row. */
    size?: 'sm' | 'md';
    children: ReactNode;
    className?: string;
}

/**
 * Rounded-full pill button used for filters, tabs, presets.
 * Active state fills with the accent colour; inactive shows a thin border.
 */
export default function PillChip({
    active = false,
    onClick,
    title,
    disabled,
    size = 'md',
    children,
    className = '',
}: Props) {
    const sizeClasses = size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-xs px-3 py-1.5';
    const stateClasses = active
        ? 'border-mp-accent bg-mp-accent text-white font-medium shadow-xs'
        : 'border-mp-border text-mp-text-body hover:border-mp-accent hover:text-mp-accent bg-mp-surface';
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 rounded-full border transition-colors disabled:opacity-50 ${sizeClasses} ${stateClasses} ${className}`}
        >
            {children}
        </button>
    );
}
