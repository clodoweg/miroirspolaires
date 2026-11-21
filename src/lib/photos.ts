/**
 * Photo Data Layer
 *
 * Parses the Astrobin CSV export into typed Photo objects and provides
 * accessor functions for filtering, deduplication, and coordinate conversion.
 * Single source of truth for all astrophotography data in the application.
 */
// lib/photos.ts
import Papa from 'papaparse';
const { parse } = Papa;
import photosCSV from '../../data/astrobin_clodoweg_gallery_python.csv?raw';
import { getConstellationName } from './constellations';
import filterMapping from '../data/filter_mapping.json';
import draftsJson from '../data/drafts.json';
import { slugify } from '@/utils/normalize';
const drafts = draftsJson as Record<string, boolean>;

export interface Photo {
    // Identifiants
    id: number;
    slug: string;
    title: string;
    type: string;
    constellation: string;
    observatories: string[];
    locations: string;
    telescope: string;
    camera: string;
    mount: string;
    integrationTime: string;
    integrationSeconds: number;
    uploaded: string;
    year: number;
    ra: string;
    dec: string;
    raVal?: number | null;
    decVal?: number | null;
    pixelScale?: number;
    orientation?: number;
    radius?: number;
    fieldSize?: string;
    description: string;
    objectsInField: string[];
    astrobinUrl: string;
    acquisitionDetails: { filter: string; number: number; duration: number }[];

    // Filters
    filters: string[];
    filterString: string;

    // Local Assets
    imagePath: string; // Used to match with the glob result
    annotationPath?: string;
    findingChartPath?: string;
    version: string;

    /** Override for the marker / list thumbnail. Used when the photo is synthetic
     *  (e.g. catalogue mode, where the thumbnail comes from hips2fits). */
    thumbnailUrl?: string;
    /** Override for the link target. Defaults to `/astrophotographies/{slug}`. */
    href?: string;
    /** Apparent magnitude (from the source catalogue, when applicable). */
    mag?: number;
    /** Catalogue short names (e.g. ["Messier"], ["NGC", "Caldwell"]) when the
     *  photo is synthetic. A single sky object can belong to several catalogues
     *  (Caldwell aliases NGC ids, etc.); we keep all memberships so filtering
     *  by either catalogue surfaces the object exactly once. */
    catalogue?: string[];
}

export interface FilterState {
    type: string | null;
    constellation: string | null;
    collection: string | null;
    location: string | null;
    telescope: string | null;
    camera: string | null;
    year: string | null;
}

const parseList = (str: any): string[] => {
    if (!str) return [];
    return String(str)
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
};

const parseCommaList = (str: any): string[] => {
    if (!str) return [];
    return String(str)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};

const safeString = (val: any): string => (val ? String(val).trim() : 'Unknown');

export interface AcquisitionDetail {
    filter: string;
    number: number;
    duration: number;
}

const parseAcquisitionDetails = (row: any): AcquisitionDetail[] => {
    const details: AcquisitionDetail[] = [];
    Object.keys(row).forEach((key) => {
        if (key.endsWith(' - Number')) {
            const val = row[key];
            if (val && !isNaN(Number(val)) && Number(val) > 0) {
                const filter = key.replace(' - Number', '');
                const durationKey = `${filter} - Duration`;
                const duration = row[durationKey] ? Number(row[durationKey]) : 0;
                details.push({
                    filter: filter.replace(/"/g, ''), // Clean quotes if any
                    number: Number(val),
                    duration,
                });
            }
        }
    });
    return details.sort((a, b) => a.filter.localeCompare(b.filter));
};

const categorizeFilters = (details: AcquisitionDetail[]): string[] => {
    const found = new Set<string>();

    details.forEach((dept) => {
        const name = dept.filter;
        // Check each category in mapping
        Object.entries(filterMapping).forEach(([category, keywords]) => {
            if (keywords.some((k) => name.includes(k))) {
                found.add(category);
            }
        });
    });

    // Custom order preference: Ha, SII, OIII, L, R, G, B
    const order = ['Ha', 'SII', 'OIII', 'L', 'R', 'G', 'B'];
    return Array.from(found).sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        return a.localeCompare(b);
    });
};

const parseYear = (dateStr: any): number => {
    if (!dateStr) return 0;
    const match = String(dateStr).match(/(\d{4})/);
    return match ? parseInt(match[1], 10) : 0;
};

const formatIntegration = (val: any): string => {
    if (!val) return '0h 00m';
    const str = String(val);

    // Handle HH:MM:SS
    if (str.includes(':')) {
        const parts = str.split(':');
        if (parts.length >= 2) {
            const h = parts[0];
            const m = parts[1];
            const s = parts[2] || '00';
            return `${h}h ${m}m ${s}s`;
        }
    }

    return str.replace(/(\d+)m/g, '$1min');
};

/**
 * Converts a Right Ascension string ("HHh MMm SSs") to degrees.
 * @param raStr - RA string (e.g. "20h 30m 15s")
 * @returns RA in degrees (0–360), or null if parsing fails
 */
export const raToDegrees = (raStr: string): number | null => {
    if (!raStr || raStr === 'Unknown') return null;
    // Format usually: "20h 30m 15s" or similar
    // Remove letters and split
    const parts = raStr.replace(/[hms]/g, '').split(' ');
    if (parts.length < 2) return null;

    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;

    return (h + m / 60 + s / 3600) * 15;
};

/**
 * Converts a Declination string ("+DD° MM' SS\"") to degrees.
 * @param decStr - Dec string (e.g. "+45° 30' 15\"")
 * @returns Dec in degrees (-90 to +90), or null if parsing fails
 */
export const decToDegrees = (decStr: string): number | null => {
    if (!decStr || decStr === 'Unknown') return null;
    // Format usually: "+45° 30' 15""
    let sign = 1;
    if (decStr.startsWith('-')) sign = -1;
    if (decStr.startsWith('+')) sign = 1; // Explicit positive

    const cleanStr = decStr.replace(/[+°'"]/g, '').trim();
    const parts = cleanStr.split(' ');
    if (parts.length < 2) return null;

    const d = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;

    // Absolute value calculation then apply sign
    const absDeg = Math.abs(d) + m / 60 + s / 3600;
    return sign * absDeg;
};

/**
 * Crée un transformateur d'en-têtes pour PapaParse garantissant l'unicité et le trimming.
 * POURQUOI: Évite le warning console 'Duplicate headers found and renamed' si un CSV
 * comporte plusieurs colonnes de même nom (ex: Telescopes, Cameras, Mounts répétés).
 */
function createUniqueHeaderTransform(): (header: string, index: number) => string {
    const headerByIndex = new Map<number, string>();
    const seenCounts = new Map<string, number>();
    return (header: string, index: number): string => {
        if (headerByIndex.has(index)) {
            return headerByIndex.get(index)!;
        }
        const clean = header.trim();
        const count = seenCounts.get(clean) || 0;
        seenCounts.set(clean, count + 1);
        const uniqueName = count === 0 ? clean : `${clean}_${count}`;
        headerByIndex.set(index, uniqueName);
        return uniqueName;
    };
}

export const photos: Photo[] = parse(photosCSV, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: createUniqueHeaderTransform(),
})
    .data.filter((row: any) => row.ID && row.Title)
    .filter((row: any) => !drafts[String(row.ID)])
    .map((row: any) => {
        const year = parseYear(row.Uploaded);
        const acquisitionDetails = parseAcquisitionDetails(row);
        const filters = categorizeFilters(acquisitionDetails);

        return {
            id: row.ID,
            slug: `${slugify(row.Title)}-${row.ID}`,
            title: row.Title,
            type: safeString(row.Type || 'Unknown'),
            constellation: getConstellationName(safeString(row.Constellation)),
            observatories: parseList(row.Collections),
            locations: safeString(row.Locations),
            telescope: row.Telescopes || 'Unknown',
            camera: row.Cameras || 'Unknown',
            mount: row.Mounts || 'Unknown',
            integrationTime: formatIntegration(row['Integration (h:m:s)']),
            integrationSeconds: row['Integration (s)'] || 0,
            uploaded: row.Uploaded,
            year: year,
            ra: safeString(row.RA),
            dec: safeString(row.Dec),
            raVal: raToDegrees(safeString(row.RA)),
            decVal: decToDegrees(safeString(row.Dec)),
            pixelScale: row['Pixel Scale'] ? Number(row['Pixel Scale']) : undefined,
            orientation: row.Orientation ? Number(row.Orientation) : undefined,
            radius: row.Radius ? Number(row.Radius) : undefined,
            fieldSize: safeString(row['Field Size']),
            description: row.Description || '',
            objectsInField: parseCommaList(row['Objects in Field']),
            astrobinUrl: row.Url || '',
            acquisitionDetails: acquisitionDetails,

            // Filters
            filters: filters,
            filterString: filters.length > 0 ? filters.join(' + ') : 'Inconnu',

            // Local Paths (Logic to find the file in src/assets/astrophotographies)
            // We just store the ID-based filename here.
            // The component will resolve it against the glob import.
            imagePath: `${year}/${row.ID}_raw.jpg`,
            annotationPath: `annotations/${year}/${row.ID}_annotation.svg`,
            version: row.Uploaded ? String(row.Uploaded).replace(/[:.-]/g, '') : '0',
        };
    });

/** Returns all unique object types (excluding "Unknown"). */
export function getUniqueTypes() {
    return Array.from(new Set(photos.map((p) => p.type).filter((t) => t !== 'Unknown'))).sort();
}

/** Returns all unique constellation names (excluding "Unknown"). */
export function getUniqueConstellations() {
    return Array.from(new Set(photos.map((p) => p.constellation).filter((c) => c !== 'Unknown'))).sort();
}

/** Returns all unique observatory/collection names. */
export function getUniqueObservatories() {
    const observatories = new Set<string>();
    photos.forEach((p) => p.observatories.forEach((o) => observatories.add(o)));
    return Array.from(observatories).sort();
}

/** Returns all unique location names (excluding "Unknown"). */
export function getUniqueLocations() {
    return Array.from(new Set(photos.map((p) => p.locations).filter((l) => l !== 'Unknown'))).sort();
}

/** Returns all unique telescope names (excluding "Unknown"). */
export function getUniqueTelescopes() {
    return Array.from(new Set(photos.map((p) => p.telescope).filter((t) => t !== 'Unknown'))).sort();
}

/** Returns all unique camera names (excluding "Unknown"). */
export function getUniqueCameras() {
    return Array.from(new Set(photos.map((p) => p.camera).filter((c) => c !== 'Unknown'))).sort();
}

/** Returns all unique mount names (excluding "Unknown"). */
export function getUniqueMounts() {
    return Array.from(new Set(photos.map((p) => p.mount).filter((m) => m !== 'Unknown'))).sort();
}

/** Returns all years with photos, sorted descending. */
export function getUniqueYears() {
    return Array.from(new Set(photos.map((p) => p.year).filter((y) => y > 0))).sort((a, b) => b - a);
}

/**
 * Finds photos similar to the given one based on shared objects in field.
 * @param photo - Reference photo to find similar ones for
 * @param limit - Maximum number of results (default 3)
 * @returns Array of similar Photo objects
 */
export function getSimilarPhotos(photo: Photo, limit = 3): Photo[] {
    return photos
        .filter((p) => {
            if (p.id === photo.id) return false;
            // Case 1: Match shared objects
            if (photo.objectsInField.length > 0) {
                return p.objectsInField.some((obj) => photo.objectsInField.includes(obj));
            }
            // Case 2: If no objects, match others with no objects
            return p.objectsInField.length === 0;
        })
        .slice(0, limit);
}
