import type { ReactNode } from 'react';

interface Crumb {
    label: string;
    href?: string;
}

interface Props {
    /** Last segment of the breadcrumb is highlighted as the active page. */
    breadcrumb?: Crumb[];
    title: string;
    /** Optional sub-title / description shown below the H1. */
    description?: ReactNode;
    /** Right-aligned status / metadata pills (e.g. dirty, sync state). */
    meta?: ReactNode;
    /** Primary action buttons, aligned far-right. */
    actions?: ReactNode;
    className?: string;
}

/**
 * Header shown at the top of an admin page content area.
 * Breadcrumb on top, large title + description + meta row, plus a right-aligned
 * actions slot. Mirrors the patterns from Sanity Studio and Ghost Admin.
 */
export default function PageHeader({ title, meta, actions, className = '' }: Props) {
    return (
        <header className={`flex flex-col gap-3 border-b border-mp-glass-border/60 pb-5 ${className}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <h1 className="font-serif text-2xl leading-tight font-light tracking-tight text-mp-text-heading md:text-3xl">
                        {title}
                    </h1>
                </div>
                {(actions || meta) && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {meta}
                        {actions}
                    </div>
                )}
            </div>
        </header>
    );
}
