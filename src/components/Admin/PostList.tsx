import { useMemo, useState } from 'react';
import { NO_AUTOFILL_PROPS } from '@/utils/constants';

export interface PostListItem {
    year: string;
    slug: string;
    title: string;
    /** Optional ISO date for sorting / display. */
    date?: string;
    /** Optional small subtitle line under the title (e.g. country, categories). */
    subtitle?: string;
    /** Optional thumbnail URL. */
    thumb?: string;
}

interface Props {
    items: PostListItem[];
    /** Active entry to highlight. Compared via `${year}/${slug}`. */
    activeKey?: string | null;
    onSelect: (item: PostListItem) => void;
    onCreate?: () => void;
    /** Singular noun used in the "+ Nouveau" CTA. */
    createLabel?: string;
    /** Title of the sidebar header. */
    title?: string;
    /** Empty-state message. */
    emptyLabel?: string;
    /** Callback to collapse the sidebar list panel. */
    onCollapse?: () => void;
}

/**
 * Reusable item list for the left pane of Blog / Voyages editors.
 * Adds a search input on top and groups entries by year (descending),
 * with collapsible year sections.
 */
export default function PostList({
    items,
    activeKey,
    onSelect,
    onCreate,
    createLabel = 'Nouveau',
    title = 'Articles',
    emptyLabel = 'Aucune entrée.',
    onCollapse,
}: Props) {
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q
            ? items.filter(
                  (it) =>
                      it.title.toLowerCase().includes(q) ||
                      it.slug.toLowerCase().includes(q) ||
                      (it.subtitle ?? '').toLowerCase().includes(q),
              )
            : items;
        // Sort by year desc (most recent first), then by title for stability.
        return [...list].sort((a, b) => {
            if (a.year !== b.year) return b.year.localeCompare(a.year);
            return a.title.localeCompare(b.title);
        });
    }, [items, query]);

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {onCollapse && (
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="rounded-md p-1 text-mp-text-secondary transition-all hover:bg-mp-glass-border/40 hover:text-mp-accent"
                            title="Masquer la liste"
                        >
                            <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M9 3v18" />
                            </svg>
                        </button>
                    )}
                    <h2 className="text-xs font-semibold tracking-wider text-mp-text-secondary uppercase">
                        {title} <span className="font-normal text-mp-text-muted">· {items.length}</span>
                    </h2>
                </div>
                {onCreate && (
                    <button
                        type="button"
                        onClick={onCreate}
                        className="inline-flex items-center gap-1 rounded-md border border-mp-accent bg-mp-accent px-2.5 py-1 text-[11px] font-semibold text-mp-ui-black hover:opacity-90"
                    >
                        <span aria-hidden>+</span>
                        {createLabel}
                    </button>
                )}
            </div>

            <div className="relative">
                <svg
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-mp-text-muted"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    type="search"
                    {...NO_AUTOFILL_PROPS}
                    placeholder="Rechercher…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-md border border-mp-glass-border bg-mp-ui-black/40 py-1.5 pr-2.5 pl-7 text-xs text-mp-text-primary placeholder:text-mp-text-muted focus:border-mp-accent/50 focus:outline-hidden"
                />
            </div>

            <div className="-mx-1 scrollbar-thin flex-1 overflow-y-auto pr-1">
                {filtered.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-mp-text-muted">{emptyLabel}</p>
                ) : (
                    <ul className="space-y-0.5">
                        {filtered.map((it) => {
                            const key = `${it.year}/${it.slug}`;
                            const isActive = key === activeKey;
                            return (
                                <li key={key}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(it)}
                                        className={`group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors ${
                                            isActive
                                                ? 'bg-mp-accent/15 ring-1 ring-mp-accent/40'
                                                : 'hover:bg-mp-glass-border/30'
                                        }`}
                                    >
                                        {it.thumb ? (
                                            <img
                                                src={it.thumb}
                                                alt=""
                                                className="h-9 w-9 shrink-0 rounded-sm object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <span
                                                aria-hidden
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-mp-ui-black/40 font-mono text-[10px] text-mp-text-muted"
                                            >
                                                {it.slug.slice(0, 2).toUpperCase()}
                                            </span>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div
                                                className={`line-clamp-2 text-xs font-medium ${isActive ? 'text-mp-accent' : 'text-mp-text-primary'}`}
                                            >
                                                {it.title || it.slug}
                                            </div>
                                            {it.subtitle && (
                                                <div className="mt-0.5 truncate font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                                                    {it.subtitle}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
