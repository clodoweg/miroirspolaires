import type { ReactNode } from 'react';

interface Props {
    icon?: ReactNode;
    title: string;
    description?: ReactNode;
    /** Primary action — usually the CTA that resolves the empty state. */
    action?: ReactNode;
    /** Optional secondary action below the primary one. */
    secondary?: ReactNode;
    className?: string;
}

/**
 * Stylised empty state. Used in place of inline "rien à afficher" panels —
 * pattern borrowed from Linear / Notion: large centered icon + headline +
 * actionable CTA so the user always knows what to do next.
 */
export default function EmptyState({ icon, title, description, action, secondary, className = '' }: Props) {
    return (
        <div
            className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-mp-glass-border/80 bg-mp-glass-solid/40 px-6 py-12 text-center ${className}`}
        >
            {icon && (
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-mp-glass-border bg-mp-bg-secondary text-mp-accent">
                    {icon}
                </div>
            )}
            <h2 className="font-serif text-xl leading-tight font-light tracking-tight text-mp-text-heading md:text-2xl">
                {title}
            </h2>
            {description && <p className="mt-2 max-w-md text-sm text-mp-text-secondary">{description}</p>}
            {(action || secondary) && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {action}
                    {secondary}
                </div>
            )}
        </div>
    );
}
