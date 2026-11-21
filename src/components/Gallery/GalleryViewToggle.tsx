import { useEffect, useState } from 'react';
import { LayoutGrid, LayoutList } from 'lucide-react';

interface Props {
    /** CSS selector for the wrapper whose `data-view` should be flipped. */
    targetSelector: string;
}

/**
 * Grid / list toggle for the photo gallery. Always defaults to "grid"
 * (the SSR markup also ships with data-view="grid"), so first paint
 * matches the hydrated state and the user must explicitly opt into the
 * list/table view.
 */
export default function GalleryViewToggle({ targetSelector }: Props) {
    const [view, setView] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        const el = document.querySelector(targetSelector);
        if (el) el.setAttribute('data-view', view);
    }, [view, targetSelector]);

    const handleSetView = (next: 'grid' | 'list') => {
        setView(next);
    };

    return (
        <div className="flex shrink-0 overflow-hidden rounded-full border border-mp-glass-border">
            <button
                type="button"
                onClick={() => handleSetView('grid')}
                className={`px-3 py-2 transition-colors ${view === 'grid' ? 'bg-mp-accent text-mp-ui-black' : 'bg-mp-glass-solid text-mp-text-muted hover:text-mp-text-primary'}`}
                title="Vue vignettes"
                aria-label="Vue vignettes"
            >
                <LayoutGrid className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={() => handleSetView('list')}
                className={`px-3 py-2 transition-colors ${view === 'list' ? 'bg-mp-accent text-mp-ui-black' : 'bg-mp-glass-solid text-mp-text-muted hover:text-mp-text-primary'}`}
                title="Vue liste"
                aria-label="Vue liste"
            >
                <LayoutList className="h-4 w-4" />
            </button>
        </div>
    );
}
