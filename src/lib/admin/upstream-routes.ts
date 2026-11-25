/**
 * Lecture, écriture et test des routes amont pour `/admin/donnees/routes-cds`.
 *
 * Responsabilité : valider et enregistrer la priorité dans `src/data/upstream-priority.json`, et mesurer
 * une route par un appel réel et léger.
 *
 * WARNING: `probeUpstreamRoute` n'appelle que les URL du registre, jamais une URL reçue du client, pour que
 * cette route d'admin ne puisse pas servir à sonder un autre hôte.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    resolveServiceRoutes,
    UPSTREAM_SERVICE_IDS,
    UPSTREAM_SERVICES,
    type ServicePriority,
    type UpstreamPriorityFile,
    type UpstreamRoute,
    type UpstreamServiceId,
} from '@/config/upstream-routes';
import { buildAsuUrl, parseAsuTsv } from '@/lib/upstream/asu';
import type { ContentReader } from './stores/content-reader';
import type { ContentWriter } from './stores/content-writer';

const PRIORITY_FILE_PATH = 'src/data/upstream-priority.json';
const PROBE_TIMEOUT_MS = 15_000;

export type ProbeStatus = 'ok' | 'timeout' | 'http-error' | 'invalid-response' | 'network-error';

export interface ProbeResult {
    status: ProbeStatus;
    latencyMs: number;
    httpStatus?: number;
    detail?: string;
}

export interface UpstreamServiceState {
    id: UpstreamServiceId;
    label: string;
    description: string;
    routes: UpstreamRoute[];
}

/**
 * Lit le fichier de priorité.
 *
 * @param reader - Source des fichiers du dépôt (disque en dev, branche de contenu sur l'admin distant).
 * @returns Le contenu du fichier.
 * @throws Si le fichier est absent.
 */
export async function readPriorityFile(reader: ContentReader): Promise<UpstreamPriorityFile> {
    const raw = await reader.readText(PRIORITY_FILE_PATH);
    if (raw === null) throw new Error(`${PRIORITY_FILE_PATH} introuvable`);
    return JSON.parse(raw);
}

/**
 * Donne l'état de chaque service pour l'affichage.
 *
 * @param priorityFile - Fichier de priorité.
 * @returns Les services, avec leurs routes dans l'ordre effectif.
 */
export function buildServiceStates(priorityFile: UpstreamPriorityFile): UpstreamServiceState[] {
    return UPSTREAM_SERVICE_IDS.map((serviceId) => {
        const { id, label, description } = UPSTREAM_SERVICES[serviceId];
        return { id, label, description, routes: resolveServiceRoutes(serviceId, priorityFile.services[serviceId]) };
    });
}

function parseIdList(value: unknown, knownIds: Set<string>): string[] | null {
    if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !knownIds.has(id))) return null;
    return [...new Set(value as string[])];
}

/**
 * Valide une priorité reçue du client.
 *
 * @param input - Corps de la requête.
 * @returns Les priorités nettoyées, null si un service ou une route est inconnu.
 */
export function parsePriorityInput(input: unknown): UpstreamPriorityFile['services'] | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

    const services: UpstreamPriorityFile['services'] = {};
    for (const [serviceId, value] of Object.entries(input)) {
        if (!UPSTREAM_SERVICE_IDS.includes(serviceId as UpstreamServiceId)) return null;
        const knownIds = new Set(UPSTREAM_SERVICES[serviceId as UpstreamServiceId].routes.map((route) => route.id));
        const { order, disabled } = (value ?? {}) as Partial<ServicePriority>;
        const parsedOrder = parseIdList(order, knownIds);
        const parsedDisabled = parseIdList(disabled, knownIds);
        if (!parsedOrder || !parsedDisabled) return null;
        services[serviceId as UpstreamServiceId] = { order: parsedOrder, disabled: parsedDisabled };
    }
    return services;
}

/**
 * Écrit le fichier de priorité (disque en local, commit sur la branche de contenu à distance).
 *
 * @param writer - Destination des fichiers du dépôt (`getContentWriter()`).
 * @param services - Priorités validées.
 * @returns Le contenu écrit.
 */
export async function writePriorityFile(
    writer: ContentWriter,
    services: UpstreamPriorityFile['services'],
): Promise<UpstreamPriorityFile> {
    const priorityFile: UpstreamPriorityFile = { updatedAt: new Date().toISOString(), services };
    await writer.commit(
        [{ path: PRIORITY_FILE_PATH, content: `${JSON.stringify(priorityFile, null, 2)}\n` }],
        'chore: update upstream route priority from admin',
    );
    return priorityFile;
}

interface ProbeRequest {
    url: string;
    isValid: (response: Response) => Promise<boolean>;
}

const isImage = async (response: Response) => (response.headers.get('content-type') ?? '').startsWith('image/');
const bodyIncludes = (marker: string) => async (response: Response) => (await response.text()).includes(marker);

async function hasTapRow(response: Response): Promise<boolean> {
    const json: { data?: unknown[] } = await response.json();
    return (json.data?.length ?? 0) > 0;
}

function buildProbeRequest(serviceId: UpstreamServiceId, route: UpstreamRoute): ProbeRequest {
    const { baseUrl } = route;
    switch (route.protocol) {
        case 'tap-adql': {
            const query =
                serviceId === 'simbad' ? 'SELECT TOP 1 main_id FROM basic' : 'SELECT TOP 1 "Sh2" FROM "VII/20/catalog"';
            const params = new URLSearchParams({ request: 'doQuery', lang: 'adql', format: 'json', query });
            return { url: `${baseUrl}?${params.toString()}`, isValid: hasTapRow };
        }
        case 'asu-tsv':
            return {
                url: buildAsuUrl(baseUrl, { table: 'VII/20/catalog', columns: ['Sh2'], constraints: { Sh2: '155' } }),
                isValid: async (response) => parseAsuTsv(await response.text(), ['Sh2']).rows.length === 1,
            };
        case 'sesame-text':
            return { url: `${baseUrl}?M31`, isValid: bodyIncludes('%J ') };
        case 'hips2fits': {
            const params = new URLSearchParams({
                hips: 'CDS/P/DSS2/color',
                ra: '10.68',
                dec: '41.27',
                fov: '1',
                width: '16',
                height: '16',
                projection: 'TAN',
                format: 'jpg',
            });
            return { url: `${baseUrl}?${params.toString()}`, isValid: isImage };
        }
        case 'skyview': {
            const params = new URLSearchParams({
                Position: '10.68,41.27',
                survey: 'DSS2 Red',
                pixels: '16',
                size: '1',
                return: 'jpeg',
            });
            return { url: `${baseUrl}?${params.toString()}`, isValid: isImage };
        }
        case 'hips-tiles':
            return { url: `${baseUrl}/properties`, isValid: bodyIncludes('hips_') };
        case 'umd-script':
        case 'esm-script':
            return { url: baseUrl, isValid: bodyIncludes('aladin') };
    }
}

function isTimeout(error: unknown): boolean {
    return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

async function probeSelfHostedRoute(rootDirectory: string, route: UpstreamRoute): Promise<ProbeResult> {
    const startedAt = Date.now();
    try {
        await fs.access(path.join(rootDirectory, 'public', route.baseUrl));
        return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch {
        return { status: 'invalid-response', latencyMs: Date.now() - startedAt, detail: 'Fichier absent de public/' };
    }
}

/**
 * Teste une route du registre par un appel réel et léger.
 *
 * @param rootDirectory - Racine du projet, pour une route auto-hébergée.
 * @param serviceId - Service de la route.
 * @param route - Route du registre.
 * @returns L'état et la latence mesurés.
 */
export async function probeUpstreamRoute(
    rootDirectory: string,
    serviceId: UpstreamServiceId,
    route: UpstreamRoute,
): Promise<ProbeResult> {
    if (route.baseUrl.startsWith('/')) return probeSelfHostedRoute(rootDirectory, route);

    const { url, isValid } = buildProbeRequest(serviceId, route);
    const startedAt = Date.now();
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        const latencyMs = Date.now() - startedAt;
        if (!response.ok) return { status: 'http-error', latencyMs, httpStatus: response.status };
        if (!(await isValid(response))) {
            return { status: 'invalid-response', latencyMs, detail: 'Réponse reçue, mais sans les données attendues' };
        }
        return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
        const latencyMs = Date.now() - startedAt;
        if (isTimeout(error)) return { status: 'timeout', latencyMs };
        const detail = error instanceof Error ? error.message : String(error);
        return { status: error instanceof TypeError ? 'network-error' : 'invalid-response', latencyMs, detail };
    }
}
