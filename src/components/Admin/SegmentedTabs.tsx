import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
    /** Optional small badge / count rendered after the label. */
    count?: number;
    icon?: ReactNode;
}

interface Props<T extends string> {
    value: T;
    onChange: (next: T) => void;
    options: SegmentedOption<T>[];
    /** "sm" tightens vertical padding for inline use. */
    size?: 'sm' | 'md';
    className?: string;
}

/**
 * iOS-style segmented control. Replaces stacks of PillChip when used to switch
 * between sub-views of the same context (e.g. Métadonnées / Galerie / Texte).
 */
export default function SegmentedTabs<T extends string>({
    value,
    onChange,
    options,
    size = 'md',
    className = '',
}: Props<T>) {
    const padding = size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5';
    return (
        <div
            role="tablist"
            className={`inline-flex items-center gap-0.5 rounded-md border border-mp-glass-border bg-mp-ui-black/40 p-0.5 ${className}`}
        >
            {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(opt.value)}
                        className={`relative inline-flex items-center gap-1.5 rounded transition-colors ${padding} text-xs font-medium ${
                            isActive
                                ? 'bg-mp-accent/15 text-mp-accent'
                                : 'text-mp-text-secondary hover:text-mp-text-primary'
                        }`}
                    >
                        {opt.icon}
                        <span>{opt.label}</span>
                        {typeof opt.count === 'number' && (
                            <span
                                className={`rounded-full px-1.5 py-px text-[10px] ${
                                    isActive
                                        ? 'bg-mp-accent/25 text-mp-accent'
                                        : 'bg-mp-glass-border/40 text-mp-text-muted'
                                }`}
                            >
                                {opt.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
