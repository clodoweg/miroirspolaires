/**
 * Import des exoplanètes à transit dans Turso (NASA Exoplanet Archive + VarAstro)
 *
 * WARNING: destructif. Vide la table exoplanets (DELETE FROM exoplanets) puis la réimporte, sans
 * transaction : un échec pendant l'insertion laisse la table vide ou partielle.
 *
 * Responsabilité principale :
 * - Charger les métadonnées de référence à préserver (nom commun…) : depuis src/data/exoplanets.json
 *   s'il existe (ce fichier n'est plus dans le dépôt), sinon depuis la table Turso exoplanets avant
 *   son vidage.
 * - Récupérer un jeton JWT anonyme (cookie `Token` de https://var.astro.cz/en), puis toutes les
 *   exoplanètes de l'API VarAstro par pages de 1000.
 * - Récupérer via TAP du NASA Exoplanet Archive les planètes confirmées à transit (table pscomppars,
 *   source primaire) et les candidates TESS actives (table toi, dispositions PC, APC ou vide).
 * - Fusionner : priorité VarAstro pour la magnitude et les éphémérides, NASA pour les paramètres
 *   physiques ; garder les planètes VarAstro absentes de la NASA ; calculer la constellation.
 * - Trier par nom et attribuer des id séquentiels (« 1 », « 2 »…) : les id changent d'un import à
 *   l'autre dès qu'une planète est ajoutée.
 * - Insérer par lots de 100 et écrire dans database_metadata : exoplanets_last_sync, exoplanets_count,
 *   exoplanets_size_bytes (estimation à 200 octets par ligne).
 * - Aucun fichier local n'est écrit : seule la table Turso est mise à jour.
 *
 * Effet distant : Turso (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, .env de la racine du dépôt), API
 * VarAstro et TAP NASA (lecture).
 *
 * Options disponibles :
 *   Aucune. Tout argument est ignoré.
 *
 * Code de sortie : 1 si une source (VarAstro, NASA pscomppars, NASA toi) ou Turso échoue ; la table
 * n'est vidée qu'une fois les trois sources téléchargées.
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/update-exoplanets.mjs
 *   npm run update-exoplanets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';
import { loadEnv } from '../lib/env.mjs';
// POURQUOI : même table IAU que le site (Node exécute le .ts sans transpilation, types effacés).
import { constellationFromCoords } from '../../src/lib/constellation-from-coords.ts';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Charger le fichier .env depuis la racine du projet, quel que soit le répertoire d'exécution actuel (CWD)
const TARGET_FILE = path.join(PROJECT_ROOT, 'src/data/exoplanets.json');

/**
 * Normalise un nom de planète pour le rapprochement de chaînes.
 * Convertit en minuscules et conserve uniquement les caractères alphanumériques.
 *
 * @param {string} name - Nom brut.
 * @returns {string} Nom normalisé.
 */
function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Point d'entrée principal pour l'exécution du script de pipeline.
 */
async function main() {
    console.log('🌌 Démarrage du pipeline de mise à jour des exoplanètes...');

    // 1. Charger les exoplanètes locales actuelles (pour préserver les métadonnées manuelles)
    let localPlanetsMap = new Map();
    if (fs.existsSync(TARGET_FILE)) {
        try {
            const currentData = JSON.parse(fs.readFileSync(TARGET_FILE, 'utf8'));
            for (const p of currentData) {
                localPlanetsMap.set(normalizeName(p.name), p);
            }
            console.log(`📖 ${localPlanetsMap.size} planètes de référence locales chargées depuis le fichier.`);
        } catch (e) {
            console.warn(
                "⚠️ Impossible de lire le fichier exoplanets.json actuel, initialisation d'une nouvelle base.",
                e.message,
            );
        }
    } else {
        // Charger depuis la base de données Turso
        const dbUrl = process.env.TURSO_DATABASE_URL;
        const dbToken = process.env.TURSO_AUTH_TOKEN;
        if (dbUrl) {
            try {
                const dbClient = createClient({ url: dbUrl, authToken: dbToken });
                const res = await dbClient.execute('SELECT * FROM exoplanets');
                for (const p of res.rows) {
                    const mappedPlanet = {
                        id: p.id,
                        name: p.name,
                        commonName: p.common_name,
                        starName: p.star_name,
                        vMag: p.v_mag,
                        ra: p.ra,
                        dec: p.dec,
                        period: p.period,
                        epoch: p.epoch,
                        duration: p.duration,
                        depth: p.depth,
                        mass: p.mass,
                        radius: p.radius,
                        distance: p.distance,
                        spectralType: p.spectral_type,
                        starRadius: p.star_radius,
                        constellation: p.constellation,
                        isCandidate: p.is_candidate === 1,
                    };
                    localPlanetsMap.set(normalizeName(p.name), mappedPlanet);
                }
                dbClient.close();
                console.log(
                    `📖 ${localPlanetsMap.size} planètes de référence chargées depuis la base de données Turso.`,
                );
            } catch (e) {
                console.warn('⚠️ Impossible de charger les exoplanètes depuis Turso :', e.message);
            }
        }
    }

    // 2. Récupérer le jeton JWT (cookie Token) de VarAstro
    console.log('🔑 Récupération du jeton JWT de VarAstro...');
    let token = '';
    try {
        const homeRes = await fetch('https://var.astro.cz/en');
        if (!homeRes.ok) {
            throw new Error(`Réponse HTTP de la page d'accueil incorrecte (${homeRes.status})`);
        }
        const cookies = homeRes.headers.getSetCookie();
        const tokenCookie = cookies.find((c) => c.startsWith('Token=eyJ'));
        if (!tokenCookie) {
            throw new Error('Aucun cookie de Token JWT trouvé dans les en-têtes Set-Cookie.');
        }
        token = tokenCookie.split(';')[0].substring(6);
        console.log('✅ Jeton JWT de VarAstro récupéré avec succès.');
    } catch (e) {
        console.error("❌ Impossible de s'authentifier sur VarAstro :", e.message);
        process.exit(1);
    }

    // 3. Télécharger toutes les exoplanètes de VarAstro
    console.log('📥 Téléchargement de la base de données VarAstro...');
    const allVarastroPlanets = [];
    let pageId = 1;
    const pageSize = 1000;
    let hasMore = true;

    try {
        while (hasMore) {
            console.log(`   Page ${pageId}...`);
            const url = `https://var.astro.cz/api/Search/Exoplanets?pageId=${pageId}&pageSize=${pageSize}`;
            const apiRes = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!apiRes.ok) {
                throw new Error(`API VarAstro a retourné une erreur ${apiRes.status}`);
            }
            const json = await apiRes.json();
            if (!json.data || json.data.length === 0) {
                hasMore = false;
            } else {
                allVarastroPlanets.push(...json.data);
                if (allVarastroPlanets.length >= json.totalCount) {
                    hasMore = false;
                } else {
                    pageId++;
                }
            }
        }
        console.log(`✅ ${allVarastroPlanets.length} planètes téléchargées depuis VarAstro.`);
    } catch (e) {
        console.error('❌ Erreur lors du téléchargement VarAstro :', e.message);
        process.exit(1);
    }

    // 4. Télécharger les paramètres physiques et orbitaux du NASA Exoplanet Archive
    console.log('📥 Téléchargement des métadonnées du NASA Exoplanet Archive (via TAP)...');
    const nasaPlanets = [];
    try {
        // POURQUOI: Nous requêtons tous les transits confirmés de pscomppars pour en faire notre source primaire.
        // pscomppars regroupe et consolide les meilleures données de publications pour chaque planète.
        const query =
            'select pl_name, hostname, ra, dec, sy_vmag, pl_orbper, pl_tranmid, pl_trandur, pl_trandep, pl_massj, pl_masse, pl_radj, sy_dist, st_spectype, st_rad from pscomppars where pl_trandep is not null and pl_orbper is not null and pl_tranmid is not null';
        const url = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(query)}&format=json`;
        const nasaRes = await fetch(url);
        if (!nasaRes.ok) {
            throw new Error(`TAP NASA a retourné une erreur ${nasaRes.status}`);
        }
        const nasaData = await nasaRes.json();
        nasaPlanets.push(...nasaData);
        console.log(`✅ ${nasaPlanets.length} planètes chargées depuis le NASA Exoplanet Archive.`);
    } catch (e) {
        console.error('❌ Impossible de charger les données du NASA Exoplanet Archive :', e.message);
        process.exit(1);
    }

    // 4b. Télécharger les candidates TESS (TOI) depuis le NASA Exoplanet Archive
    console.log('📥 Téléchargement des candidates TESS (TOI) via TAP...');
    const tessCandidates = [];
    try {
        // POURQUOI: Nous récupérons les candidates TESS actives (PC et APC ou non classées) qui ont des paramètres de transit.
        const query =
            "select tid, toi, toidisplay, ra, dec, st_tmag, pl_orbper, pl_tranmid, pl_trandurh, pl_trandep, pl_rade, st_dist, st_rad, tfopwg_disp from toi where pl_orbper is not null and pl_tranmid is not null and pl_trandep is not null and (tfopwg_disp in ('PC', 'APC') or tfopwg_disp is null)";
        const url = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(query)}&format=json`;
        const toiRes = await fetch(url);
        if (!toiRes.ok) {
            throw new Error(`TAP NASA TOI a retourné une erreur ${toiRes.status}`);
        }
        const toiData = await toiRes.json();
        tessCandidates.push(...toiData);
        console.log(`✅ ${tessCandidates.length} candidates TESS chargées depuis le NASA Exoplanet Archive.`);
    } catch (e) {
        console.error('❌ Impossible de charger les candidates TESS (TOI) :', e.message);
        process.exit(1);
    }

    // Créer une map pour le catalogue VarAstro
    const varastroPlanetsMap = new Map();
    for (const vp of allVarastroPlanets) {
        if (vp.name) {
            varastroPlanetsMap.set(normalizeName(vp.name), vp);
        }
    }

    // 5. Fusionner et formater les données
    console.log('🔀 Fusion et conversion des données...');
    const mergedPlanets = [];
    const matchedVarastroNames = new Set();

    // Traitement des données NASA (source primaire)
    for (const np of nasaPlanets) {
        const normName = normalizeName(np.pl_name);
        const vp = varastroPlanetsMap.get(normName) || {};
        const local = localPlanetsMap.get(normName) || {};

        if (varastroPlanetsMap.has(normName)) {
            matchedVarastroNames.add(normName);
        }

        // Établir la magnitude (priorité VarAstro si présente pour correspondre aux observations réelles)
        const vMag = vp.magMax !== undefined && vp.magMax !== null && vp.magMax > 0 ? vp.magMax : np.sy_vmag || 0;

        // Paramètres de transit (priorité VarAstro pour les éphémérides de précision issues du terrain)
        const period = vp.period !== undefined && vp.period !== null && vp.period > 0 ? vp.period : np.pl_orbper || 0;
        const epoch = vp.epoch !== undefined && vp.epoch !== null && vp.epoch > 0 ? vp.epoch : np.pl_tranmid || 0;

        // VarAstro fournit la durée en minutes, NASA en heures
        const duration =
            vp.duration !== undefined && vp.duration !== null && vp.duration > 0
                ? vp.duration / 60
                : np.pl_trandur || 0;
        const depth = vp.depth !== undefined && vp.depth !== null && vp.depth > 0 ? vp.depth : np.pl_trandep || 0;

        // Paramètres physiques
        let mass = 0;
        if (local.mass !== undefined && local.mass > 0) {
            mass = local.mass;
        } else if (np.pl_massj !== undefined && np.pl_massj !== null && np.pl_massj > 0) {
            mass = np.pl_massj;
        } else if (np.pl_masse !== undefined && np.pl_masse !== null && np.pl_masse > 0) {
            // Convertir de la masse terrestre à la masse jovienne
            mass = np.pl_masse / 317.8;
        }

        // Rayon de la planète (Priorité VarAstro si existant, sinon NASA pl_radj)
        let radius = 1.0;
        if (vp.planetRadius !== undefined && vp.planetRadius !== null && vp.planetRadius > 0) {
            radius = vp.planetRadius;
        } else if (np.pl_radj !== undefined && np.pl_radj !== null && np.pl_radj > 0) {
            radius = np.pl_radj;
        }

        // Distance (convertir de Parsecs en Années-Lumière)
        let distance = 0;
        if (local.distance !== undefined && local.distance > 0) {
            distance = local.distance;
        } else if (np.sy_dist !== undefined && np.sy_dist !== null && np.sy_dist > 0) {
            distance = np.sy_dist * 3.26156;
        }

        const spectralType = local.spectralType || np.st_spectype || 'N/A';

        // Rayon de l'étoile
        let starRadius = 1.0;
        if (vp.starRadius !== undefined && vp.starRadius !== null && vp.starRadius > 0) {
            starRadius = vp.starRadius;
        } else if (np.st_rad !== undefined && np.st_rad !== null && np.st_rad > 0) {
            starRadius = np.st_rad;
        }

        // Constellation
        let constellation = '';
        if (local.constellation) {
            constellation = local.constellation;
        } else {
            const resolvedConst = constellationFromCoords(np.ra, np.dec);
            if (resolvedConst) {
                constellation = resolvedConst;
            }
        }

        const commonName = local.commonName || np.pl_name;
        const starName = np.hostname;

        mergedPlanets.push({
            id: '', // Sera réattribué après le tri final
            name: np.pl_name,
            commonName,
            starName,
            vMag,
            ra: np.ra,
            dec: np.dec,
            period,
            epoch,
            duration,
            depth,
            mass,
            radius,
            distance,
            spectralType,
            starRadius,
            constellation,
            isCandidate: false,
        });
    }

    // Traitement des planètes orphelines VarAstro (non trouvées dans NASA)
    let orphanCount = 0;
    for (const vp of allVarastroPlanets) {
        const normName = normalizeName(vp.name);
        if (!matchedVarastroNames.has(normName)) {
            orphanCount++;
            const local = localPlanetsMap.get(normName) || {};

            // Établir les valeurs physiques
            let mass = 0;
            if (local.mass !== undefined && local.mass > 0) {
                mass = local.mass;
            }
            let distance = 0;
            if (local.distance !== undefined && local.distance > 0) {
                distance = local.distance;
            }
            const spectralType = local.spectralType || 'N/A';
            const constellation = local.constellation || constellationFromCoords(vp.raDec, vp.deDec) || '';

            const commonName = local.commonName || vp.name;
            const starName = vp.name.replace(/\s+[b-z]$/i, '');

            const starRadius =
                vp.starRadius !== undefined && vp.starRadius !== null && vp.starRadius > 0 ? vp.starRadius : 1.0;
            const radius =
                vp.planetRadius !== undefined && vp.planetRadius !== null && vp.planetRadius > 0
                    ? vp.planetRadius
                    : 1.0;
            const duration = vp.duration !== undefined && vp.duration !== null ? vp.duration / 60 : 0;

            mergedPlanets.push({
                id: '', // Sera réattribué après le tri final
                name: vp.name,
                commonName,
                starName,
                vMag: vp.magMax,
                ra: vp.raDec,
                dec: vp.deDec,
                period: vp.period,
                epoch: vp.epoch,
                duration,
                depth: vp.depth,
                mass,
                radius,
                distance,
                spectralType,
                starRadius,
                constellation,
                isCandidate: false,
            });
        }
    }

    // Traitement des candidates TESS
    let candidateCount = 0;
    for (const tc of tessCandidates) {
        const name = tc.toidisplay;
        const normName = normalizeName(name);
        const local = localPlanetsMap.get(normName) || {};

        // La magnitude TESS (st_tmag) sert de proxy pour la magnitude V de l'étoile hôte
        const vMag = tc.st_tmag || 0;

        // Paramètres de transit (pl_trandep est en ppm dans la table TOI, converti en %)
        const period = tc.pl_orbper || 0;
        const epoch = tc.pl_tranmid || 0;
        const duration = tc.pl_trandurh || 0;
        const depth = tc.pl_trandep !== undefined && tc.pl_trandep !== null ? tc.pl_trandep / 10000 : 0;

        // Paramètres physiques
        let mass = 0;
        if (local.mass !== undefined && local.mass > 0) {
            mass = local.mass;
        }

        // Rayon de la planète (pl_rade est en rayon terrestre, converti en rayon jovien : 1 R_J = 11.2 R_E)
        let radius = 1.0;
        if (tc.pl_rade !== undefined && tc.pl_rade !== null && tc.pl_rade > 0) {
            radius = tc.pl_rade / 11.2;
        }

        // Distance (convertir de Parsecs en Années-Lumière)
        let distance = 0;
        if (local.distance !== undefined && local.distance > 0) {
            distance = local.distance;
        } else if (tc.st_dist !== undefined && tc.st_dist !== null && tc.st_dist > 0) {
            distance = tc.st_dist * 3.26156;
        }

        const spectralType = local.spectralType || 'N/A';

        // Rayon de l'étoile
        let starRadius = tc.st_rad !== undefined && tc.st_rad !== null && tc.st_rad > 0 ? tc.st_rad : 1.0;

        // Constellation
        let constellation = '';
        if (local.constellation) {
            constellation = local.constellation;
        } else {
            const resolvedConst = constellationFromCoords(tc.ra, tc.dec);
            if (resolvedConst) {
                constellation = resolvedConst;
            }
        }

        const commonName = local.commonName || name;
        const starName = 'TIC ' + tc.tid;

        mergedPlanets.push({
            id: '', // Sera réattribué après le tri final
            name,
            commonName,
            starName,
            vMag,
            ra: tc.ra,
            dec: tc.dec,
            period,
            epoch,
            duration,
            depth,
            mass,
            radius,
            distance,
            spectralType,
            starRadius,
            constellation,
            isCandidate: true,
        });
        candidateCount++;
    }

    console.log(`📊 Rapport de fusion :`);
    console.log(`   - Cibles NASA : ${nasaPlanets.length}`);
    console.log(`   - Candidates TESS : ${candidateCount}`);
    console.log(`   - Cibles VarAstro : ${allVarastroPlanets.length}`);
    console.log(
        `   - Rapprochements réussis : ${matchedVarastroNames.size} (${((matchedVarastroNames.size / allVarastroPlanets.length) * 100).toFixed(1)}% de VarAstro)`,
    );
    console.log(`   - Orphelins VarAstro préservés : ${orphanCount}`);
    console.log(`   - Total final : ${mergedPlanets.length} planètes`);

    // Trier les planètes par ordre alphabétique de nom pour avoir des IDs stables
    mergedPlanets.sort((a, b) => a.name.localeCompare(b.name));

    // Attribuer des IDs séquentiels stables
    for (let i = 0; i < mergedPlanets.length; i++) {
        mergedPlanets[i].id = String(i + 1);
    }

    // 6. Écrire dans la base de données Turso
    console.log(`💾 Insertion de ${mergedPlanets.length} exoplanètes dans Turso...`);
    const dbUrl = process.env.TURSO_DATABASE_URL;
    const dbToken = process.env.TURSO_AUTH_TOKEN;
    if (!dbUrl) {
        console.error("❌ TURSO_DATABASE_URL n'est pas défini dans l'environnement.");
        process.exit(1);
    }
    const dbClient = createClient({ url: dbUrl, authToken: dbToken });

    try {
        console.log('🧹 Nettoyage de la table exoplanets...');
        await dbClient.execute('DELETE FROM exoplanets;');

        // Insérer par lots de 100
        const batchSize = 100;
        for (let i = 0; i < mergedPlanets.length; i += batchSize) {
            const chunk = mergedPlanets.slice(i, i + batchSize);
            const statements = chunk.map((p) => ({
                sql: `INSERT OR REPLACE INTO exoplanets (
                    id, name, common_name, star_name, v_mag, ra, dec, period, epoch, duration, depth, mass, radius, distance, spectral_type, star_radius, constellation, is_candidate
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    p.id,
                    p.name,
                    p.commonName || null,
                    p.starName,
                    p.vMag !== undefined && p.vMag !== null ? p.vMag : null,
                    p.ra,
                    p.dec,
                    p.period,
                    p.epoch,
                    p.duration !== undefined && p.duration !== null ? p.duration : null,
                    p.depth !== undefined && p.depth !== null ? p.depth : null,
                    p.mass !== undefined && p.mass !== null ? p.mass : null,
                    p.radius !== undefined && p.radius !== null ? p.radius : null,
                    p.distance !== undefined && p.distance !== null ? p.distance : null,
                    p.spectralType || null,
                    p.starRadius !== undefined && p.starRadius !== null ? p.starRadius : null,
                    p.constellation || null,
                    p.isCandidate ? 1 : 0,
                ],
            }));
            await dbClient.batch(statements);
            console.log(`⏳ [${i + chunk.length}/${mergedPlanets.length}] Exoplanètes insérées...`);
        }
        console.log(`✨ Insertion terminée avec succès dans Turso !`);

        console.log('💾 Enregistrement des métadonnées de synchronisation...');
        await dbClient.execute(
            'CREATE TABLE IF NOT EXISTS database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
        );
        await dbClient.execute({
            sql: `INSERT OR REPLACE INTO database_metadata (key, value) VALUES (?, ?), (?, ?), (?, ?)`,
            args: [
                'exoplanets_last_sync',
                new Date().toISOString(),
                'exoplanets_size_bytes',
                String(mergedPlanets.length * 200),
                'exoplanets_count',
                String(mergedPlanets.length),
            ],
        });
    } catch (e) {
        console.error("❌ Erreur lors de l'insertion dans Turso :", e.message);
        process.exit(1);
    } finally {
        dbClient.close();
    }
}

main().catch(console.error);
