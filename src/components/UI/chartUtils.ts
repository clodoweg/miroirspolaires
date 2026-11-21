/**
 * Chart Utilities
 *
 * Shared data aggregation and formatting functions for all chart components.
 * Handles axis modes, color palette generation, and multi-dimensional
 * grouping (time series, heatmaps, bar charts).
 */
import type { Photo } from '@/lib/photos';
import filterMapping from '@/data/filter_mapping.json';

// Extended Photo type with pre-resolved image URL
export type PhotoWithImage = Photo & { resolvedImageUrl?: string };

// Axis modes available for chart configuration
export type AxisMode =
    | 'year'
    | 'constellation'
    | 'rawFilters'
    | 'filterType'
    | 'filterString'
    | 'locations'
    | 'type'
    | 'telescope'
    | 'camera'
    | 'mount'
    | 'integrationSeconds'
    | 'photoCount'
    | 'radius'
    | 'observatory'
    | 'frames';

// Option definition for CustomSelect
export interface AxisOption {
    value: string;
    label: string;
}

// Standard axis options for X axis (categorical)
export const AXIS_X_OPTIONS: AxisOption[] = [
    { value: 'year', label: 'Année' },
    { value: 'constellation', label: 'Constellation' },
    { value: 'rawFilters', label: 'Filtre' },
    { value: 'filterType', label: 'Filtre (par type)' },
    { value: 'filterString', label: 'Filtres (par combinaison)' },
    { value: 'locations', label: 'Lieu' },
    { value: 'type', label: "Type d'objet" },
    { value: 'telescope', label: 'Instrument' },
    { value: 'camera', label: 'Caméra' },
    { value: 'mount', label: 'Monture' },
    { value: 'observatory', label: 'Observatoire' },
];

// Standard axis options for Y axis (numerical)
export const AXIS_Y_OPTIONS: AxisOption[] = [
    { value: 'integrationSeconds', label: "Temps d'intégration" },
    { value: 'photoCount', label: 'Nombre de photos' },
    { value: 'radius', label: 'Taille du champ' },
    { value: 'frames', label: 'Nombre de poses' },
];

// Color/grouping options
export const COLOR_OPTIONS: AxisOption[] = [...AXIS_X_OPTIONS];

/**
 * Generates a deterministic HSL color from a string (hash-based).
 * @param str - Input string to convert
 * @returns HSL color string
 */
export const stringToColor = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 60%)`;
};

/**
 * Resolves a filter name to its filter type (Luminance, Ha, OIII, etc.) via mapping.
 * @param filterName - Raw filter name from acquisition data
 * @returns Matched filter type or 'Autre'
 */
export const getFilterType = (filterName: string): string => {
    for (const [type, variants] of Object.entries(filterMapping)) {
        if ((variants as string[]).some((v) => filterName.toLowerCase().includes(v.toLowerCase()))) {
            return type;
        }
    }
    return 'Autre';
};

/**
 * Extracts a value from a photo for a given axis mode.
 * @param p - Photo object
 * @param mode - Axis mode to read
 * @returns The corresponding value (number, string, or array)
 */
export const getPhotoValue = (p: Photo, mode: AxisMode): any => {
    if (mode === 'photoCount') return 1;
    if (mode === 'frames') return p.acquisitionDetails.reduce((acc, d) => acc + (d.number || 0), 0);
    if (mode === 'rawFilters') return p.acquisitionDetails.map((d) => d.filter).join(' + ') || 'Aucun';
    if (mode === 'filterType') {
        const types = new Set(p.acquisitionDetails.map((d) => getFilterType(d.filter)));
        return Array.from(types).sort().join(' + ') || 'Aucun';
    }
    if (mode === 'locations') return p.locations;
    if (mode === 'observatory') return p.observatories?.join(' + ') || 'Unknown';
    if (mode === 'integrationSeconds') return (p.integrationSeconds || 0) / 3600;
    return p[mode as keyof Photo];
};

/**
 * Formats a value for axis display with appropriate units.
 * @param val - Raw value
 * @param mode - Axis mode for unit selection
 * @param categoricalMaps - Optional label mappings
 * @returns Formatted label string
 */
export const formatAxisLabel = (val: any, mode: AxisMode, categoricalMaps?: Record<string, string[]>): string => {
    if (mode === 'integrationSeconds') return `${Math.round(val)}h`;
    if (mode === 'radius') return `${val}°`;
    if (typeof val === 'number' && categoricalMaps && categoricalMaps[mode]) {
        return categoricalMaps[mode][val] || val.toString();
    }
    return val?.toString() || '';
};

/**
 * Aggregates photos by a grouping dimension for pie/bar charts.
 * @param photos - Array of photos to aggregate
 * @param groupBy - Dimension to group by
 * @param valueMode - Metric to sum (default: integrationSeconds)
 * @returns Sorted array of {name, value, color} entries
 */
export const aggregateByGroup = (
    photos: Photo[],
    groupBy: AxisMode,
    valueMode: AxisMode = 'integrationSeconds',
): { name: string; value: number; color: string }[] => {
    const groups: Record<string, number> = {};

    // A single photo can have multiple acquisition sessions with different filters.
    // Grouping by filter therefore requires iterating over acquisitionDetails rather
    // than over photos — otherwise each photo would only count once regardless of
    // how many distinct filters were used.
    const needsFilterExplosion = groupBy === 'filterType' || groupBy === 'rawFilters';

    if (needsFilterExplosion) {
        photos.forEach((p) => {
            p.acquisitionDetails.forEach((acq) => {
                const key = groupBy === 'filterType' ? getFilterType(acq.filter) : acq.filter || 'Aucun';
                let value: number;
                if (valueMode === 'frames') value = acq.number;
                else value = acq.duration * acq.number;
                groups[key] = (groups[key] || 0) + value;
            });
        });
    } else {
        photos.forEach((p) => {
            const key = String(getPhotoValue(p, groupBy));
            const value =
                valueMode === 'photoCount'
                    ? 1
                    : typeof getPhotoValue(p, valueMode) === 'number'
                      ? getPhotoValue(p, valueMode)
                      : 1;
            groups[key] = (groups[key] || 0) + value;
        });
    }

    return Object.entries(groups)
        .map(([name, value]) => ({ name, value, color: stringToColor(name) }))
        .sort((a, b) => b.value - a.value);
};

/**
 * Aggregates photos for stacked time series charts (X = time, stacked by color dimension).
 * @param photos - Array of photos
 * @param xAxis - Time dimension for X axis
 * @param colorBy - Dimension for stacking/coloring
 * @param valueMode - Metric to sum (default: integrationSeconds)
 * @returns Object with data array and sorted series names
 */
export const aggregateTimeSeries = (
    photos: Photo[],
    xAxis: AxisMode,
    colorBy: AxisMode,
    valueMode: AxisMode = 'integrationSeconds',
): { data: Record<string, any>[]; series: string[] } => {
    const groups: Record<string, Record<string, number>> = {};
    const allSeries = new Set<string>();

    const needsFilterExplosion = colorBy === 'filterType' || colorBy === 'rawFilters';

    if (needsFilterExplosion) {
        photos.forEach((p) => {
            const xKey = String(getPhotoValue(p, xAxis));
            p.acquisitionDetails.forEach((acq) => {
                const seriesKey = colorBy === 'filterType' ? getFilterType(acq.filter) : acq.filter || 'Aucun';

                let value: number;
                if (valueMode === 'frames') value = acq.number;
                else value = acq.duration * acq.number;

                if (!groups[xKey]) groups[xKey] = {};
                groups[xKey][seriesKey] = (groups[xKey][seriesKey] || 0) + value;
                allSeries.add(seriesKey);
            });
        });
    } else {
        photos.forEach((p) => {
            const xKey = String(getPhotoValue(p, xAxis));
            const seriesKey = String(getPhotoValue(p, colorBy));
            const value =
                valueMode === 'photoCount'
                    ? 1
                    : typeof getPhotoValue(p, valueMode) === 'number'
                      ? getPhotoValue(p, valueMode)
                      : 1;

            if (!groups[xKey]) groups[xKey] = {};
            groups[xKey][seriesKey] = (groups[xKey][seriesKey] || 0) + value;
            allSeries.add(seriesKey);
        });
    }

    const data = Object.entries(groups)
        .map(([x, values]) => ({ x, ...values }))
        .sort((a, b) => {
            if (!isNaN(Number(a.x)) && !isNaN(Number(b.x))) return Number(a.x) - Number(b.x);
            return String(a.x).localeCompare(String(b.x));
        });

    return { data, series: Array.from(allSeries).sort() };
};

/**
 * Aggregates photos for heatmap visualization (X and Y are categorical).
 * @param photos - Array of photos
 * @param xAxis - Categorical dimension for X axis
 * @param yAxis - Categorical dimension for Y axis
 * @param valueMode - Metric to sum (default: integrationSeconds)
 * @returns Object with data, xValues, yValues, and maxValue
 */
export const aggregateHeatmap = (
    photos: Photo[],
    xAxis: AxisMode,
    yAxis: AxisMode,
    valueMode: AxisMode = 'integrationSeconds',
): { data: { x: string; y: string; value: number }[]; xValues: string[]; yValues: string[]; maxValue: number } => {
    const cells: Record<string, number> = {};
    const xSet = new Set<string>();
    const ySet = new Set<string>();

    const needsFilterExplosion =
        xAxis === 'filterType' || xAxis === 'rawFilters' || yAxis === 'filterType' || yAxis === 'rawFilters';

    if (needsFilterExplosion) {
        photos.forEach((p) => {
            p.acquisitionDetails.forEach((acq) => {
                let xKey: string;
                if (xAxis === 'filterType') xKey = getFilterType(acq.filter);
                else if (xAxis === 'rawFilters') xKey = acq.filter || 'Aucun';
                else xKey = String(getPhotoValue(p, xAxis));

                let yKey: string;
                if (yAxis === 'filterType') yKey = getFilterType(acq.filter);
                else if (yAxis === 'rawFilters') yKey = acq.filter || 'Aucun';
                else yKey = String(getPhotoValue(p, yAxis));

                let value: number;
                if (valueMode === 'photoCount') {
                    // For count, we usually want to count the photo once per category occurrence.
                    // But here we might be counting "occurrences of usage of filter X".
                    // Let's stick to 1 per acquisition entry ~ roughly 1 per filter usage.
                    value = 1;
                } else if (valueMode === 'integrationSeconds') {
                    value = acq.duration * acq.number; // Total seconds for this filter
                } else if (valueMode === 'frames') {
                    value = acq.number;
                } else {
                    // Fallback for other numerical values (radius, etc) - just take photo value?
                    // It's ambiguous for filter split, but usually users want integration or count.
                    const rawVal = getPhotoValue(p, valueMode);
                    value = typeof rawVal === 'number' ? rawVal : 1;
                }

                const key = `${xKey}::${yKey}`;
                cells[key] = (cells[key] || 0) + value;
                xSet.add(xKey);
                ySet.add(yKey);
            });
        });
    } else {
        photos.forEach((p) => {
            const xKey = String(getPhotoValue(p, xAxis));
            const yKey = String(getPhotoValue(p, yAxis));
            const value =
                valueMode === 'photoCount'
                    ? 1
                    : typeof getPhotoValue(p, valueMode) === 'number'
                      ? getPhotoValue(p, valueMode)
                      : 1;

            const key = `${xKey}::${yKey}`;
            cells[key] = (cells[key] || 0) + value;
            xSet.add(xKey);
            ySet.add(yKey);
        });
    }

    const xValues = Array.from(xSet).sort((a, b) => {
        // Try numerical sort if possible
        if (!isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) - Number(b);
        return a.localeCompare(b);
    });

    const yValues = Array.from(ySet).sort((a, b) => {
        if (!isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) - Number(b);
        return a.localeCompare(b);
    });

    const data = Object.entries(cells).map(([key, value]) => {
        const [x, y] = key.split('::');
        return { x, y, value };
    });

    const maxValue = Math.max(...data.map((d) => d.value), 1);

    return { data, xValues, yValues, maxValue };
};
