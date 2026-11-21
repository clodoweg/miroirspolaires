import React, { type ReactNode } from 'react';

interface ControlButtonProps {
    onClick: () => void;
    icon: ReactNode;
    label?: string;
    title: string;
    style?: React.CSSProperties;
    className?: string;
    active?: boolean;
}

/**
 * Shared control button for SkyMap controls.
 * Used by StellariumNavigationControls and StellariumControls.
 */
export function ControlButton({ onClick, icon, label, title, style, className, active }: ControlButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center rounded-lg p-2 transition-all duration-200 ${
                active
                    ? 'shadow-glow-gold border border-mp-accent bg-mp-accent text-black'
                    : 'border border-mp-border-light bg-mp-glass-bg text-mp-text-muted hover:bg-mp-bg-secondary hover:text-white'
            } ${className || ''}`}
            title={title}
            aria-label={title}
            style={style || { minWidth: '42px', minHeight: '52px' }}
        >
            <div className="mb-1">{icon}</div>
            {label && <span className="text-[10px] font-bold tracking-wider uppercase">{label}</span>}
        </button>
    );
}

interface ControlPanelProps {
    children: ReactNode;
    className?: string;
}

/**
 * Shared control panel container with consistent glass-morphism styling.
 */
export function ControlPanel({ children, className = '' }: ControlPanelProps) {
    return (
        <div
            className={`flex items-center gap-2 rounded-xl border border-white/10 bg-black/80 p-2 shadow-2xl backdrop-blur-md ${className}`}
        >
            {children}
        </div>
    );
}

/**
 * Vertical divider for control panels.
 */
export function ControlDivider() {
    return <div className="mx-1 h-8 w-px bg-white/10" />;
}
