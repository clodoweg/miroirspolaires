/**
 * Helpers to build hips2fits cutout URLs.
 *
 * The CDS hips2fits service returns rendered JPG/PNG cutouts of any HiPS
 * survey for given coordinates and field of view, with no auth required.
 *
 * @see https://alasky.cds.unistra.fr/hips-image-services/hips2fits
 */

import { getActiveRoutes } from '@/config/upstream-routes';
import type { SkyImage } from './types';
import { skyViewUrl } from './hips2fits-url';

interface SurveyPreset {
    id: string;
    label: string;
    description: string;
    hipsId: string;
}

/**
 * Default surveys shown side-by-side. DSS2 color is the lead thumbnail.
 * IDs are HiPS canonical identifiers exposed by CDS.
 */
const SKY_SURVEYS: SurveyPreset[] = [
    {
        id: 'dss2-color',
        label: 'DSS2 (couleur)',
        description: 'Survey optique panoramique POSS-II / SERC, composite couleur.',
        hipsId: 'CDS/P/DSS2/color',
    },
    {
        id: '2mass-color',
        label: '2MASS (J/H/K)',
        description: 'Atlas infrarouge proche du 2MASS, composite J/H/K.',
        hipsId: 'CDS/P/2MASS/color',
    },
    {
        id: 'sdss9-color',
        label: 'SDSS9 (couleur)',
        description: 'Sloan Digital Sky Survey 9, composite optique couleur.',
        hipsId: 'CDS/P/SDSS9/color',
    },
    {
        id: 'allwise-color',
        label: 'AllWISE (IR moyen)',
        description: 'AllWISE infrarouge moyen (3.4/4.6/12 µm).',
        hipsId: 'CDS/P/allWISE/color',
    },
    {
        id: 'finkbeiner-halpha',
        label: 'H-alpha (Finkbeiner)',
        description: 'Carte composite Halpha (Finkbeiner 2003).',
        hipsId: 'CDS/P/Finkbeiner',
    },
    {
        id: 'mellinger-color',
        label: 'Mellinger (visible)',
        description: 'Mosaïque grand champ Mellinger en lumière visible.',
        hipsId: 'CDS/P/Mellinger/color',
    },
];

interface CutoutParams {
    ra: number;
    dec: number;
    fovDeg: number;
    width?: number;
    height?: number;
    projection?: 'TAN' | 'SIN' | 'MOL';
}

function buildCutoutUrl(baseUrl: string, hipsId: string, p: CutoutParams): string {
    const params = new URLSearchParams({
        hips: hipsId,
        ra: p.ra.toFixed(6),
        dec: p.dec.toFixed(6),
        fov: p.fovDeg.toFixed(4),
        width: String(p.width ?? 800),
        height: String(p.height ?? 800),
        projection: p.projection ?? 'TAN',
        format: 'jpg',
    });
    return `${baseUrl}?${params.toString()}`;
}

/**
 * Construit l'image de repli SkyView.
 *
 * POURQUOI un seul relevé en gris : SkyView n'est pas un miroir de hips2fits. Ses composites couleur n'existent
 * pas sous cette forme, et il met jusqu'à 10 s sur 2MASS ou WISE contre environ 2 s sur DSS2.
 */
function buildSkyViewImage(baseUrl: string, ra: number, dec: number, fovDeg: number): SkyImage {
    const buildUrl = (pixels: number) => skyViewUrl(baseUrl, ra, dec, fovDeg, pixels);
    return {
        id: 'dss2-red',
        label: 'DSS2 (rouge)',
        description: 'Relevé DSS2 en niveaux de gris, servi par SkyView (NASA) pendant une panne du CDS.',
        hipsId: 'DSS2 Red',
        fovDeg,
        url: buildUrl(800),
        thumbUrl: buildUrl(220),
    };
}

/**
 * Build the default set of preview thumbnails for a target.
 *
 * Two URLs per survey: the full 800-px cutout used when the survey is
 * the active selection, and a 220-px thumbnail used in the small picker
 * grid. Pulling 6 × 800-px cutouts at first paint dominated the page
 * load — this brings the thumbnail payload down by ~10×.
 */
export function buildSkyImages(ra: number, dec: number, fovDeg: number): SkyImage[] {
    const activeRoute = getActiveRoutes('hips2fits')[0];
    if (!activeRoute) return [];
    if (activeRoute.protocol === 'skyview') return [buildSkyViewImage(activeRoute.baseUrl, ra, dec, fovDeg)];

    return SKY_SURVEYS.map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        hipsId: s.hipsId,
        fovDeg,
        url: buildCutoutUrl(activeRoute.baseUrl, s.hipsId, { ra, dec, fovDeg }),
        thumbUrl: buildCutoutUrl(activeRoute.baseUrl, s.hipsId, {
            ra,
            dec,
            fovDeg,
            width: 220,
            height: 220,
        }),
    }));
}

/**
 * Pick a sensible default field of view from SIMBAD's major axis (arcmin).
 * Falls back to 0.5° when unknown. Always padded ~3x for context.
 */
export function pickFovDeg(majArcmin?: number): number {
    if (!majArcmin || !Number.isFinite(majArcmin) || majArcmin <= 0) return 0.5;
    const padded = (majArcmin * 3) / 60; // convert arcmin to deg with 3x padding
    return Math.min(Math.max(padded, 0.1), 4);
}
