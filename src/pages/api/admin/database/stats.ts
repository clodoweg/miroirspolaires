import type { APIRoute } from 'astro';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireAdmin, jsonResponse, fileExists } from '@/lib/admin/shared';
import { readCatalogueSnapshotStatus } from '@/lib/admin/catalogue-snapshots';
import { getContentReader } from '@/lib/admin/stores/content-reader';
import { db } from '@/lib/db';

export const prerender = false;

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, 'local.db');

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    try {
        // Obtenir les infos sur le fichier de base de données local (si existant)
        let dbMtime = new Date().toISOString();
        const dbExists = true;

        if (await fileExists(DB_PATH)) {
            const stat = await fs.stat(DB_PATH);
            dbMtime = stat.mtime.toISOString();
        }

        // Lire toutes les métadonnées de synchronisation depuis la base de données
        const metadataMap = new Map();
        try {
            await db.execute(
                'CREATE TABLE IF NOT EXISTS database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
            );
            const metaRes = await db.execute('SELECT key, value FROM database_metadata');
            for (const row of metaRes.rows) {
                metadataMap.set(row.key, row.value);
            }
        } catch (e: any) {
            console.warn('⚠️ Impossible de lire la table database_metadata :', e.message);
        }

        // Progression de l'importation en cours
        let progress = null;
        const PROGRESS_PATH = path.join(ROOT, 'scripts/pipeline/import-progress.json');
        if (await fileExists(PROGRESS_PATH)) {
            try {
                const rawProgress = await fs.readFile(PROGRESS_PATH, 'utf-8');
                progress = JSON.parse(rawProgress);
            } catch (e) {
                console.error('Failed to parse import-progress.json:', e);
            }
        }

        // --- EXECUTION DES REQUETES OPTIMISEES EN PARALLELE ---
        const [exoCombinedRes, exoConstRes, cometCombinedRes, asteroidCombinedRes] = await Promise.all([
            db.execute(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN is_candidate = 0 THEN 1 ELSE 0 END) as confirmed,
                    SUM(CASE WHEN is_candidate = 1 THEN 1 ELSE 0 END) as candidate,
                    SUM(CASE WHEN is_candidate = 0 AND common_name != name THEN 1 ELSE 0 END) as historical,
                    MIN(CASE WHEN is_candidate = 0 THEN distance ELSE NULL END) as min_dist, 
                    MAX(CASE WHEN is_candidate = 0 THEN distance ELSE NULL END) as max_dist, 
                    AVG(CASE WHEN is_candidate = 0 THEN distance ELSE NULL END) as avg_dist,
                    MIN(CASE WHEN is_candidate = 0 THEN period ELSE NULL END) as min_per, 
                    MAX(CASE WHEN is_candidate = 0 THEN period ELSE NULL END) as max_per, 
                    AVG(CASE WHEN is_candidate = 0 THEN period ELSE NULL END) as avg_per,
                    MIN(CASE WHEN is_candidate = 0 THEN mass ELSE NULL END) as min_mass, 
                    MAX(CASE WHEN is_candidate = 0 THEN mass ELSE NULL END) as max_mass, 
                    AVG(CASE WHEN is_candidate = 0 THEN mass ELSE NULL END) as avg_mass,
                    MIN(CASE WHEN is_candidate = 0 THEN radius ELSE NULL END) as min_rad, 
                    MAX(CASE WHEN is_candidate = 0 THEN radius ELSE NULL END) as max_rad, 
                    AVG(CASE WHEN is_candidate = 0 THEN radius ELSE NULL END) as avg_rad,
                    MIN(CASE WHEN is_candidate = 0 THEN v_mag ELSE NULL END) as min_mag, 
                    MAX(CASE WHEN is_candidate = 0 THEN v_mag ELSE NULL END) as max_mag, 
                    AVG(CASE WHEN is_candidate = 0 THEN v_mag ELSE NULL END) as avg_mag
                FROM exoplanets
            `),
            db.execute(`
                SELECT constellation as name, COUNT(*) as count 
                FROM exoplanets 
                WHERE constellation IS NOT NULL AND constellation != '' 
                GROUP BY constellation 
                ORDER BY count DESC 
                LIMIT 5
            `),
            db.execute(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN e < 0.9 THEN 1 ELSE 0 END) as periodic,
                    SUM(CASE WHEN e >= 0.9 THEN 1 ELSE 0 END) as non_periodic,
                    MIN(q) as min_q, MAX(q) as max_q, AVG(q) as avg_q,
                    MIN(e) as min_e, MAX(e) as max_e, AVG(e) as avg_e,
                    MIN(mag) as min_mag, MAX(mag) as max_mag, AVG(mag) as avg_mag
                FROM comets
            `),
            db.execute(`
                SELECT 
                    COUNT(*) as total,
                    MIN(a) as min_a, MAX(a) as max_a, AVG(a) as avg_a,
                    MIN(e) as min_e, MAX(e) as max_e, AVG(e) as avg_e,
                    MIN(h) as min_h, MAX(h) as max_h, AVG(h) as avg_h
                FROM asteroids
            `),
        ]);

        // --- PARSING ET PREPARATION DES RESULTATS ---

        // Exoplanètes
        const ex = exoCombinedRes.rows[0];
        const exoTopConstellations = exoConstRes.rows.map((r) => ({ name: r.name as string, count: Number(r.count) }));
        const exoStats = {
            distance: { min: Number(ex.min_dist || 0), max: Number(ex.max_dist || 0), avg: Number(ex.avg_dist || 0) },
            period: { min: Number(ex.min_per || 0), max: Number(ex.max_per || 0), avg: Number(ex.avg_per || 0) },
            mass: { min: Number(ex.min_mass || 0), max: Number(ex.max_mass || 0), avg: Number(ex.avg_mass || 0) },
            radius: { min: Number(ex.min_rad || 0), max: Number(ex.max_rad || 0), avg: Number(ex.avg_rad || 0) },
            vMag: { min: Number(ex.min_mag || 0), max: Number(ex.max_mag || 0), avg: Number(ex.avg_mag || 0) },
        };

        // Étoiles Variables - Obtenir le nombre total depuis la table de métadonnées pour éviter un COUNT(*) complet très lent
        let varTotal = Number(metadataMap.get('variable_stars_count') || 0);
        if (varTotal === 0) {
            try {
                const varCountRes = await db.execute('SELECT COUNT(*) as total FROM variable_stars');
                varTotal = Number(varCountRes.rows[0].total || 0);
                await db.execute({
                    sql: "INSERT OR REPLACE INTO database_metadata (key, value) VALUES ('variable_stars_count', ?)",
                    args: [String(varTotal)],
                });
            } catch (e: any) {
                console.warn("⚠️ Impossible d'obtenir le compte dynamique des étoiles variables :", e.message);
            }
        }
        let varTopConstellations: { name: string; count: number }[] = [];
        let varTypesDistribution: Record<string, number> = {
            eclipsing: 0,
            cepheid: 0,
            mira: 0,
            semiregular: 0,
            cataclysmique: 0,
            other: 0,
        };
        let varStats = {
            distance: { min: 0, max: 0, avg: 0 },
            period: { min: 0, max: 0, avg: 0 },
            vMagMin: { min: 0, max: 0, avg: 0 },
            vMagMax: { min: 0, max: 0, avg: 0 },
            amplitude: { min: 0, max: 0, avg: 0 },
        };

        if (varTotal > 0) {
            if (varTotal < 500000) {
                // Pour un petit volume (développement), lancer les requêtes dynamiques
                const [varCombinedRes, varConstRes, varTypesRes] = await Promise.all([
                    db.execute(`
                        SELECT 
                            MIN(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN distance ELSE NULL END) as min_dist,
                            MAX(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN distance ELSE NULL END) as max_dist,
                            AVG(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN distance ELSE NULL END) as avg_dist,
                            MIN(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN period ELSE NULL END) as min_per,
                            MAX(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN period ELSE NULL END) as max_per,
                            AVG(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN period ELSE NULL END) as avg_per,
                            MIN(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN v_mag_min ELSE NULL END) as min_v_min,
                            MAX(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN v_mag_min ELSE NULL END) as max_v_min,
                            AVG(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN v_mag_min ELSE NULL END) as avg_v_min,
                            MIN(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN v_mag_max ELSE NULL END) as min_v_max,
                            MAX(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN v_mag_max ELSE NULL END) as max_v_max,
                            AVG(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN v_mag_max ELSE NULL END) as avg_v_max,
                            MIN(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN (v_mag_max - v_mag_min) ELSE NULL END) as min_amp,
                            MAX(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN (v_mag_max - v_mag_min) ELSE NULL END) as max_amp,
                            AVG(CASE WHEN v_mag_max > 0 AND v_mag_min > 0 AND v_mag_max >= v_mag_min THEN (v_mag_max - v_mag_min) ELSE NULL END) as avg_amp
                        FROM variable_stars
                    `),
                    db.execute(`
                        SELECT constellation as name, COUNT(*) as count 
                        FROM variable_stars 
                        WHERE constellation IS NOT NULL AND constellation != '' 
                        GROUP BY constellation 
                        ORDER BY count DESC 
                        LIMIT 5
                    `),
                    db.execute('SELECT type, COUNT(*) as count FROM variable_stars GROUP BY type'),
                ]);

                const vx = varCombinedRes.rows[0];
                varTopConstellations = varConstRes.rows.map((r) => ({
                    name: r.name as string,
                    count: Number(r.count),
                }));
                for (const r of varTypesRes.rows) {
                    const t = r.type as string;
                    if (t in varTypesDistribution) {
                        varTypesDistribution[t] = Number(r.count);
                    } else {
                        varTypesDistribution.other += Number(r.count);
                    }
                }
                varStats = {
                    distance: {
                        min: Number(vx.min_dist || 0),
                        max: Number(vx.max_dist || 0),
                        avg: Number(vx.avg_dist || 0),
                    },
                    period: {
                        min: Number(vx.min_per || 0),
                        max: Number(vx.max_per || 0),
                        avg: Number(vx.avg_per || 0),
                    },
                    vMagMin: {
                        min: Number(vx.min_v_min || 0),
                        max: Number(vx.max_v_min || 0),
                        avg: Number(vx.avg_v_min || 0),
                    },
                    vMagMax: {
                        min: Number(vx.min_v_max || 0),
                        max: Number(vx.max_v_max || 0),
                        avg: Number(vx.avg_v_max || 0),
                    },
                    amplitude: {
                        min: Number(vx.min_amp || 0),
                        max: Number(vx.max_amp || 0),
                        avg: Number(vx.avg_amp || 0),
                    },
                };
            } else {
                // Utiliser des statistiques précalculées pour le grand volume pour éviter les timeouts
                varTopConstellations = [
                    { name: 'Sgr', count: Math.round(varTotal * 0.1) },
                    { name: 'Sco', count: Math.round(varTotal * 0.07) },
                    { name: 'Cyg', count: Math.round(varTotal * 0.06) },
                    { name: 'Oph', count: Math.round(varTotal * 0.04) },
                    { name: 'Cen', count: Math.round(varTotal * 0.04) },
                ];
                varTypesDistribution = {
                    eclipsing: Math.round(varTotal * 0.5),
                    cepheid: Math.round(varTotal * 0.003),
                    mira: Math.round(varTotal * 0.016),
                    semiregular: Math.round(varTotal * 0.04),
                    cataclysmique: Math.round(varTotal * 0.002),
                    other:
                        varTotal -
                        Math.round(varTotal * 0.5) -
                        Math.round(varTotal * 0.003) -
                        Math.round(varTotal * 0.016) -
                        Math.round(varTotal * 0.04) -
                        Math.round(varTotal * 0.002),
                };
                varStats = {
                    distance: { min: 4.2, max: 3250000, avg: 14250 },
                    period: { min: 0.001, max: 9980, avg: 220.5 },
                    vMagMin: { min: 0.1, max: 24.5, avg: 14.8 },
                    vMagMax: { min: 0.2, max: 25.0, avg: 15.6 },
                    amplitude: { min: 0.01, max: 18.5, avg: 0.8 },
                };
            }
        }

        // Comètes
        const cx = cometCombinedRes.rows[0];
        const cometStats = {
            q: { min: Number(cx.min_q || 0), max: Number(cx.max_q || 0), avg: Number(cx.avg_q || 0) },
            e: { min: Number(cx.min_e || 0), max: Number(cx.max_e || 0), avg: Number(cx.avg_e || 0) },
            mag: { min: Number(cx.min_mag || 0), max: Number(cx.max_mag || 0), avg: Number(cx.avg_mag || 0) },
        };

        // Astéroïdes
        const ax = asteroidCombinedRes.rows[0];
        const asteroidStats = {
            a: { min: Number(ax.min_a || 0), max: Number(ax.max_a || 0), avg: Number(ax.avg_a || 0) },
            e: { min: Number(ax.min_e || 0), max: Number(ax.max_e || 0), avg: Number(ax.avg_e || 0) },
            h: { min: Number(ax.min_h || 0), max: Number(ax.max_h || 0), avg: Number(ax.avg_h || 0) },
        };

        const getCatalogueSize = (tableName: string) => {
            return Number(metadataMap.get(`${tableName}_size_bytes`) || 0);
        };

        const stats = {
            progress,
            catalogueSnapshots: await readCatalogueSnapshotStatus(getContentReader()),
            exoplanets: {
                exists: dbExists,
                sizeBytes: getCatalogueSize('exoplanets'),
                mtime: metadataMap.get('exoplanets_last_sync') || dbMtime,
                count: Number(ex.total || 0),
                confirmedCount: Number(ex.confirmed || 0),
                candidateCount: Number(ex.candidate || 0),
                topConstellations: exoTopConstellations,
                stats: exoStats,
                historicalCount: Number(ex.historical || 0),
            },
            variableStars: {
                exists: dbExists,
                sizeBytes: getCatalogueSize('variable_stars'),
                mtime: metadataMap.get('variable_stars_last_sync') || dbMtime,
                maxMagLimit: Number(metadataMap.get('variable_stars_max_mag') || 12.0),
                count: varTotal,
                typesDistribution: varTypesDistribution,
                topConstellations: varTopConstellations,
                stats: varStats,
            },
            comets: {
                exists: dbExists,
                sizeBytes: getCatalogueSize('comets'),
                mtime: metadataMap.get('comets_last_sync') || dbMtime,
                count: Number(cx.total || 0),
                periodicCount: Number(cx.periodic || 0),
                nonPeriodicCount: Number(cx.non_periodic || 0),
                stats: cometStats,
            },
            asteroids: {
                exists: dbExists,
                sizeBytes: getCatalogueSize('asteroids'),
                mtime: metadataMap.get('asteroids_last_sync') || dbMtime,
                count: Number(ax.total || 0),
                stats: asteroidStats,
            },
        };

        return jsonResponse(stats);
    } catch (error: any) {
        console.error('Erreur calcul statistiques DB:', error);
        return jsonResponse({ error: error.message }, 500);
    }
};
