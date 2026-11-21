import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { NO_AUTOFILL_PROPS } from '@/utils/constants';

interface Props<T> {
    label: string;
    placeholder: string;
    /** Synchronous search function — runs on every keystroke. */
    onSearch: (query: string) => T[];
    /** Render the right-hand spec column for a result row. */
    renderMeta: (item: T) => string;
    /** Called when the user clicks a result. */
    onPick: (item: T) => void;
    /** Pulled from the picked item to display in the input after selection. */
    getDisplayName: (item: T) => string;
    /** Pre-selected item — its display name fills the input on mount and on prop change. */
    selected?: T | null;
}

export default function EquipmentSearch<T extends { id: string; brand: string; name: string }>({
    label,
    placeholder,
    onSearch,
    renderMeta,
    onPick,
    getDisplayName,
    selected,
}: Props<T>) {
    const [query, setQuery] = useState(selected ? getDisplayName(selected) : '');
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<T[]>([]);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Sync the displayed text with the externally-controlled selection (e.g.
    // a "Défaut" reset, or a sibling input being edited and the id cleared).
    useEffect(() => {
        setQuery(selected ? getDisplayName(selected) : '');
        // We deliberately depend on the id only; getDisplayName is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    useEffect(() => {
        if (!open) {
            setResults([]);
            return;
        }
        setResults(onSearch(query));
    }, [query, open, onSearch]);

    const pick = (item: T) => {
        onPick(item);
        setQuery(getDisplayName(item));
        setOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <label className="space-y-1 block">
                <span className="block text-[11px] tracking-wide text-mp-text-muted uppercase">{label}</span>
                <div className="relative">
                    <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-mp-text-muted" />
                    <input
                        type="text"
                        {...NO_AUTOFILL_PROPS}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        placeholder={placeholder}
                        className="w-full rounded-md border border-mp-glass-border bg-mp-bg-secondary py-2 pr-3 pl-9 text-sm text-mp-text-primary placeholder:text-mp-text-muted focus:border-mp-accent focus:outline-hidden"
                    />
                </div>
            </label>

            {open && results.length > 0 && (
                <ul className="absolute right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-mp-glass-border bg-mp-bg-secondary shadow-lg">
                    {results.map((item) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                onClick={() => pick(item)}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-mp-text-body transition-colors hover:bg-mp-accent-light hover:text-mp-text-primary"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium text-mp-text-primary">
                                        {item.brand} {item.name}
                                    </span>
                                </span>
                                <span className="shrink-0 font-mono text-[11px] text-mp-text-muted">
                                    {renderMeta(item)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {open && query.trim() && results.length === 0 && (
                <div className="absolute right-0 left-0 z-20 mt-1 rounded-md border border-mp-glass-border bg-mp-bg-secondary p-3 text-xs text-mp-text-muted">
                    Aucun résultat. Saisis les valeurs manuellement.
                </div>
            )}
        </div>
    );
}
