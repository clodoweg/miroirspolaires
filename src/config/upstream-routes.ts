/**
 * Registre des routes amont (CDS et miroirs), source unique pour le site, l'admin et les scripts.
 *
 * Responsabilité : lister pour chaque service les routes candidates, et appliquer l'ordre choisi
 * dans `/admin/upstream`, conservé dans `src/data/upstream-priority.json`.
 *
 * WARNING: l'admin n'existe qu'en `npm run dev`. La priorité vit donc dans un fichier versionné que la
 * production lit après déploiement : pas de base ni de variable d'environnement, sinon le choix
 * n'atteindrait jamais la production.
 *
 * WARNING: n'ajouter qu'une route testée avec succès. Une route lue par le navigateur (HiPS, hips2fits,
 * script Aladin) doit aussi figurer dans `CSP_DIRECTIVES` (`src/integrations/security-headers.mjs`).
 *
 * Ce module ne doit rien importer de Node : `hips2fits-url.ts` et `AladinViewer.tsx` l'utilisent côté client.
 */

// POURQUOI : chemin relatif, car le résolveur de `update-catalogue-snapshots.mjs` ne traduit l'alias `@/` que vers des `.ts`.
import priorityFile from '../data/upstream-priority.json' with { type: 'json' };

export type UpstreamServiceId = 'simbad' | 'vizier' | 'sesame' | 'hips2fits' | 'hipsSky' | 'aladinScript';

export type UpstreamProtocol =
    'tap-adql' | 'asu-tsv' | 'sesame-text' | 'hips2fits' | 'skyview' | 'hips-tiles' | 'esm-script' | 'umd-script';

export interface UpstreamRoute {
    id: string;
    label: string;
    /** URL de base, ou chemin servi par le site pour une route auto-hébergée. */
    baseUrl: string;
    protocol: UpstreamProtocol;
    /** État par défaut, tant que le fichier de priorité ne décrit pas ce service. */
    enabled: boolean;
    /** Ordre par défaut, du plus petit au plus grand. */
    priority: number;
    /** Vrai pour une route en HTTP simple : la réponse peut être altérée en chemin. */
    isInsecure?: boolean;
    /** Délai propre à cette route, en millisecondes, prioritaire sur ceux de l'appelant. */
    timeoutMs?: number;
    /** Vrai si une expiration ne prouve pas une panne, voir `tripsCircuit` dans `failover.ts`. */
    hasAmbiguousTimeout?: boolean;
    /** Précision affichée dans l'admin. */
    note?: string;
}

export interface UpstreamService {
    id: UpstreamServiceId;
    label: string;
    description: string;
    routes: UpstreamRoute[];
}

/** Choix enregistré pour un service : ordre des routes et routes désactivées. */
export interface ServicePriority {
    order: string[];
    disabled: string[];
}

export interface UpstreamPriorityFile {
    updatedAt: string | null;
    services: Partial<Record<UpstreamServiceId, ServicePriority>>;
}

// POURQUOI dans `public/libs/` : dossier déjà exclu du lint et du formatage, réservé au code tiers.
export const SELF_HOSTED_ALADIN_PATH = '/libs/aladin-lite/3.8.2/aladin.js';

export const UPSTREAM_SERVICES: Record<UpstreamServiceId, UpstreamService> = {
    simbad: {
        id: 'simbad',
        label: 'SIMBAD (TAP)',
        description: 'Fiches des objets et listes Messier et Caldwell.',
        routes: [
            {
                id: 'cds',
                label: 'CDS Strasbourg',
                baseUrl: 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
                protocol: 'tap-adql',
                enabled: true,
                priority: 10,
            },
            {
                id: 'harvard',
                label: 'Harvard (CfA)',
                baseUrl: 'https://simbad.harvard.edu/simbad/sim-tap/sync',
                protocol: 'tap-adql',
                enabled: true,
                priority: 20,
            },
            {
                id: 'idia',
                label: 'IDIA (Afrique du Sud)',
                baseUrl: 'https://simbad.idia.ac.za/simbad/sim-tap/sync',
                protocol: 'tap-adql',
                enabled: true,
                priority: 30,
            },
        ],
    },
    vizier: {
        id: 'vizier',
        label: 'VizieR',
        description: 'Tables des catalogues du ciel profond. Seul le CDS expose le TAP, les miroirs passent par ASU.',
        routes: [
            {
                id: 'cds-tap',
                label: 'CDS Strasbourg (TAP)',
                baseUrl: 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync',
                protocol: 'tap-adql',
                enabled: true,
                priority: 10,
            },
            {
                id: 'harvard-asu',
                label: 'Harvard (ASU)',
                baseUrl: 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv',
                protocol: 'asu-tsv',
                enabled: true,
                priority: 20,
                note: 'Rapide, mais observé bloqué pendant plusieurs minutes alors que Sesame répondait sur le même hôte.',
            },
            {
                // POURQUOI : ce miroir n'est joignable qu'en HTTP (HTTPS expire), à garder en dernier recours.
                id: 'nao-asu',
                label: 'NAO Japon (ASU)',
                baseUrl: 'http://vizier.nao.ac.jp/viz-bin/asu-tsv',
                protocol: 'asu-tsv',
                enabled: true,
                priority: 30,
                isInsecure: true,
            },
            {
                id: 'china-vo-asu',
                label: 'China-VO (ASU)',
                baseUrl: 'http://vizier.china-vo.org/viz-bin/asu-tsv',
                protocol: 'asu-tsv',
                enabled: true,
                priority: 40,
                isInsecure: true,
            },
        ],
    },
    sesame: {
        id: 'sesame',
        label: 'Sesame',
        description: 'Résolution des noms saisis dans /objets.',
        routes: [
            {
                id: 'cds',
                label: 'CDS Strasbourg',
                baseUrl: 'https://cds.unistra.fr/cgi-bin/nph-sesame/-op/A',
                protocol: 'sesame-text',
                enabled: true,
                priority: 10,
            },
            {
                // POURQUOI : `-op/A` et `~SNV` expirent sur ce miroir, seul `-oI/SNV` renvoie les alias.
                // Un nom inconnu y bloque jusqu'à l'expiration : le délai reste court et n'ouvre pas le coupe-circuit.
                id: 'harvard',
                label: 'Harvard (CfA)',
                baseUrl: 'https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oI/SNV',
                protocol: 'sesame-text',
                enabled: true,
                priority: 20,
                timeoutMs: 4_000,
                hasAmbiguousTimeout: true,
                note: 'Un nom inconnu expire au lieu de répondre « introuvable ».',
            },
        ],
    },
    hips2fits: {
        id: 'hips2fits',
        label: 'Images du ciel',
        description: "Vignettes des listes et image principale de /objets. Aucun miroir hips2fits n'existe.",
        routes: [
            {
                id: 'cds',
                label: 'hips2fits CDS',
                baseUrl: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
                protocol: 'hips2fits',
                enabled: true,
                priority: 10,
            },
            {
                id: 'skyview',
                label: 'SkyView NASA (DSS2 en gris)',
                baseUrl: 'https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl',
                protocol: 'skyview',
                enabled: true,
                priority: 20,
                note: 'Image principale de /objets seulement, et un visuel neutre dans les listes.',
            },
        ],
    },
    hipsSky: {
        id: 'hipsSky',
        label: 'Fond de ciel Aladin (HiPS)',
        description: 'Tuiles DSS couleur du visualiseur. Le navigateur prend la première route qui répond.',
        routes: [
            {
                id: 'cds',
                label: 'CDS alaskybis',
                baseUrl: 'https://alaskybis.cds.unistra.fr/DSS/DSSColor',
                protocol: 'hips-tiles',
                enabled: true,
                priority: 10,
            },
            {
                id: 'esa',
                label: 'ESA ESASky',
                baseUrl: 'https://skies.esac.esa.int/DSSColor',
                protocol: 'hips-tiles',
                enabled: true,
                priority: 20,
            },
            {
                id: 'china-vo',
                label: 'China-VO',
                baseUrl: 'https://hips.china-vo.org/m/CDS_P_DSS2_color',
                protocol: 'hips-tiles',
                enabled: true,
                priority: 30,
            },
        ],
    },
    aladinScript: {
        id: 'aladinScript',
        label: 'Script Aladin Lite',
        description: 'Moteur du visualiseur de /objets.',
        routes: [
            {
                id: 'cds',
                label: 'CDS (dernière version)',
                baseUrl: 'https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js',
                protocol: 'umd-script',
                enabled: true,
                priority: 10,
            },
            {
                id: 'self-hosted',
                label: 'Auto-hébergé (3.8.2)',
                baseUrl: SELF_HOSTED_ALADIN_PATH,
                protocol: 'esm-script',
                enabled: true,
                priority: 20,
            },
        ],
    },
};

export const UPSTREAM_SERVICE_IDS = Object.keys(UPSTREAM_SERVICES) as UpstreamServiceId[];

/** Préréglage « CDS indisponible » : miroirs d'abord, CDS en dernier pour retrouver seul le service à son retour. */
export const CDS_DOWN_PRESET: Record<UpstreamServiceId, ServicePriority> = {
    simbad: { order: ['harvard', 'idia', 'cds'], disabled: [] },
    vizier: { order: ['harvard-asu', 'nao-asu', 'china-vo-asu', 'cds-tap'], disabled: [] },
    sesame: { order: ['harvard', 'cds'], disabled: [] },
    hips2fits: { order: ['skyview', 'cds'], disabled: [] },
    hipsSky: { order: ['esa', 'china-vo', 'cds'], disabled: [] },
    aladinScript: { order: ['self-hosted', 'cds'], disabled: [] },
};

/**
 * Applique un choix enregistré aux routes d'un service.
 *
 * POURQUOI : un fichier de priorité plus ancien que le registre ne doit rien casser. Un id inconnu est
 * ignoré et une route absente du choix se place à la suite, dans l'ordre par défaut.
 *
 * @param serviceId - Service concerné.
 * @param servicePriority - Choix enregistré, undefined pour les valeurs par défaut.
 * @returns Toutes les routes triées, avec leur état `enabled` effectif.
 */
export function resolveServiceRoutes(serviceId: UpstreamServiceId, servicePriority?: ServicePriority): UpstreamRoute[] {
    const defaultOrder = [...UPSTREAM_SERVICES[serviceId].routes].sort((a, b) => a.priority - b.priority);
    if (!servicePriority) return defaultOrder;

    const rank = (route: UpstreamRoute) => {
        const index = servicePriority.order.indexOf(route.id);
        return index === -1 ? servicePriority.order.length + defaultOrder.indexOf(route) : index;
    };
    return [...defaultOrder]
        .sort((a, b) => rank(a) - rank(b))
        .map((route) => ({ ...route, enabled: !servicePriority.disabled.includes(route.id) }));
}

/**
 * Donne les routes utilisables d'un service, selon le fichier de priorité versionné.
 *
 * @param serviceId - Service concerné.
 * @returns Les routes actives, de la plus prioritaire à la moins prioritaire.
 */
export function getActiveRoutes(serviceId: UpstreamServiceId): UpstreamRoute[] {
    const services = (priorityFile as UpstreamPriorityFile).services;
    return resolveServiceRoutes(serviceId, services[serviceId]).filter((route) => route.enabled);
}
