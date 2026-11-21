import React, { useState, useCallback } from 'react';
import StatsFilterBar from './StatsFilterBar';
import type { FilterConfig } from '@/types/filters';
import InteractiveStatsChart from './InteractiveStatsChart';
import HorizontalBarChart from './charts/HorizontalBarChart';
import DataExplorer from './DataExplorer';
import type { Photo } from '@/lib/photos';

type PhotoWithImage = Photo & { resolvedImageUrl?: string };

interface Props {
    photos: PhotoWithImage[];
    filterConfig: FilterConfig[];
}

export default function StatsChartsContainer({ photos, filterConfig }: Props) {
    const [filteredPhotos, setFilteredPhotos] = useState<PhotoWithImage[]>(photos);

    const handleFilteredPhotosChange = useCallback(
        (newPhotos: Photo[]) => {
            // Preserve resolvedImageUrl when filtering
            const photosWithUrls = newPhotos.map((p) => {
                const original = photos.find((op) => op.slug === p.slug);
                return {
                    ...p,
                    resolvedImageUrl: original?.resolvedImageUrl,
                } as PhotoWithImage;
            });
            setFilteredPhotos(photosWithUrls);
        },
        [photos],
    );

    // Side-effect: Update static metadata in the header (outside React tree)
    React.useEffect(() => {
        // 1. Calculate Stats
        const totalPhotos = filteredPhotos.length;
        const totalHours = Math.round(filteredPhotos.reduce((acc, p) => acc + (p.integrationSeconds || 0), 0) / 3600);
        const totalFrames = filteredPhotos.reduce(
            (acc, p) => acc + p.acquisitionDetails.reduce((sum, d) => sum + (d.number || 0), 0),
            0,
        );

        // 2. Update DOM
        const updateEl = (id: string, value: number) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(value);
        };

        updateEl('stat-photos', totalPhotos);
        updateEl('stat-hours', totalHours);
        updateEl('stat-frames', totalFrames);
    }, [filteredPhotos]);

    return (
        <div>
            {/* Filter Bar - Static */}
            <div
                id="stats-filter-bar"
                className="relative z-filter-bar mb-4 w-full bg-transparent transition-all duration-300"
            >
                <div className="container-mp">
                    <StatsFilterBar
                        filters={filterConfig}
                        photos={photos}
                        onFilteredPhotosChange={handleFilteredPhotosChange}
                    />
                </div>
            </div>

            <div className="container-mp relative z-charts space-y-8">
                {/* Exposure Statistics */}
                <InteractiveStatsChart photos={filteredPhotos} />

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    <HorizontalBarChart photos={filteredPhotos} groupBy="year" title="Production par année" icon="📅" />
                    <HorizontalBarChart
                        photos={filteredPhotos}
                        groupBy="constellation"
                        title="Constellations favorites"
                        icon="✨"
                        limit={new Set(filteredPhotos.map((p) => p.year)).size}
                    />
                </div>

                {/* Data Explorer Section */}
                <DataExplorer photos={filteredPhotos} />
            </div>
        </div>
    );
}
