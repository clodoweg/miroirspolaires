/**
 * Wikipedia REST summary client.
 * Tries FR first, falls back to EN.
 *
 * @see https://fr.wikipedia.org/api/rest_v1/
 */

import type { WikipediaSummary } from './types';
import { UPSTREAM_TIMEOUT_MS } from '@/lib/api/http';

interface WikiPayload {
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
    thumbnail?: { source?: string };
    originalimage?: { source?: string };
    type?: string;
}

async function fetchSummary(lang: 'fr' | 'en', title: string): Promise<WikipediaSummary | null> {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS.lookup),
        headers: {
            Accept: 'application/json',
            'User-Agent': 'miroirspolaires.fr objects-page (clodoweg@gmail.com)',
        },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as WikiPayload;
    if (!data.extract || data.type === 'disambiguation') return null;
    return {
        title: data.title ?? title,
        lang,
        extract: data.extract,
        url: data.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        imageUrl: data.originalimage?.source ?? data.thumbnail?.source,
    };
}

/**
 * Look up Wikipedia for the most plausible page title from a list of candidates.
 * Tries each candidate in FR, then in EN, returns the first hit.
 */
export async function fetchWikipedia(candidates: string[]): Promise<WikipediaSummary | null> {
    const seen = new Set<string>();
    const ordered = candidates.filter((c) => {
        const k = c.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return Boolean(c);
    });

    for (const lang of ['fr', 'en'] as const) {
        for (const candidate of ordered) {
            try {
                const hit = await fetchSummary(lang, candidate);
                if (hit) return hit;
            } catch {
                // ignore and continue
            }
        }
    }
    return null;
}
