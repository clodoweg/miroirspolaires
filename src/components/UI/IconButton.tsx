import type { ReactNode, MouseEvent } from 'react';

interface Props {
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    title: string;
    disabled?: boolean;
    /** "icon" stays compact (square), "text" expands for label use. */
    variant?: 'icon' | 'text';
    children: ReactNode;
    className?: string;
}

/**
 * Small bordered button for icon-only or label+icon controls
 * (date stepper, location search, secondary actions).
 */
export default function IconButton({ onClick, title, disabled, variant = 'icon', children, className = '' }: Props) {
    const padding = variant === 'icon' ? 'p-1.5' : 'px-3 py-2';
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-1 rounded-md border border-mp-glass-border text-mp-text-secondary transition-colors hover:border-mp-accent hover:text-mp-accent disabled:opacity-40 disabled:hover:border-mp-glass-border disabled:hover:text-mp-text-secondary ${padding} ${className}`}
        >
            {children}
        </button>
    );
}
