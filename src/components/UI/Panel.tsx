import type { ReactNode } from 'react';

interface Props {
    /** Tag is `section` by default, override for semantics. */
    as?: 'section' | 'div' | 'article' | 'aside';
    /** Internal padding scale. Defaults to 4 (p-4). */
    padding?: 0 | 3 | 4 | 5 | 6 | 8;
    /** Tonal variant for status panels. */
    tone?: 'default' | 'danger';
    children: ReactNode;
    className?: string;
}

const PADDING: Record<NonNullable<Props['padding']>, string> = {
    0: '',
    3: 'p-3',
    4: 'p-4',
    5: 'p-5',
    6: 'p-6',
    8: 'p-8',
};

const TONE: Record<NonNullable<Props['tone']>, string> = {
    default: 'border-mp-glass-border bg-mp-glass-solid',
    danger: 'border-mp-astro-red/40 bg-mp-astro-red/10',
};

/**
 * Standard "glass" panel: rounded box with a glass-solid tone and a 1px border.
 * Use this in place of inline `rounded-lg border border-mp-glass-border bg-mp-glass-solid`.
 */
export default function Panel({ as: Tag = 'section', padding = 4, tone = 'default', children, className = '' }: Props) {
    return <Tag className={`rounded-lg border ${TONE[tone]} ${PADDING[padding]} ${className}`}>{children}</Tag>;
}
