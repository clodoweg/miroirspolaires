import React, { useMemo } from 'react';
import type { Photo } from '@/lib/photos';

interface Props {
    photos: Photo[];
}

export default function GlobalStatsCards({ photos }: Props) {
    const stats = useMemo(() => {
        const totalIntegrationSeconds = photos.reduce((acc, p) => acc + (p.integrationSeconds || 0), 0);
        const totalHours = Math.floor(totalIntegrationSeconds / 3600);

        const totalFrames = photos.reduce((acc, p) => {
            const photoFrames = p.acquisitionDetails?.reduce((sum, d) => sum + (d.number || 0), 0) || 0;
            return acc + photoFrames;
        }, 0);

        return {
            count: photos.length,
            hours: totalHours,
            frames: totalFrames,
        };
    }, [photos]);

    return (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-mp-glass-border bg-mp-bg-secondary/40 p-6 text-center shadow-floating">
                <div className="mb-2 text-3xl font-bold text-mp-text-primary md:text-4xl">{stats.count}</div>
                <div className="meta-label text-sm text-mp-text-muted">Astrophotographies</div>
            </div>
            <div className="rounded-xl border border-mp-glass-border bg-mp-bg-secondary/40 p-6 text-center shadow-floating">
                <div className="mb-2 text-3xl font-bold text-mp-text-primary md:text-4xl">{stats.hours}h</div>
                <div className="meta-label text-sm text-mp-text-muted">Temps d'intégration total</div>
            </div>
            <div className="rounded-xl border border-mp-glass-border bg-mp-bg-secondary/40 p-6 text-center shadow-floating">
                <div className="mb-2 text-3xl font-bold text-mp-text-primary md:text-4xl">{stats.frames}</div>
                <div className="meta-label text-sm text-mp-text-muted">Nombre de poses unitaires</div>
            </div>
        </div>
    );
}
