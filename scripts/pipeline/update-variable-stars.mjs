/**
 * Import des étoiles variables (AAVSO VSX) dans Turso, par tranches reprenables
 *
 * WARNING: destructif par défaut. Sans fichier de progression (ou avec --fresh), le script vide la
 * table variable_stars (DELETE FROM variable_stars) avant l'import. Les descriptions (`details`) des
 * étoiles hors des 16 cibles historiques sont alors perdues : elles sont relues dans Turso APRÈS ce
 * DELETE. Pour compléter la table sans l'effacer : --no-clean.
 *
 * Responsabilité principale :
 * - Interroger VizieR TAP (catalogue B/vsx/vsx) pour les étoiles à période connue, par bandes de
 *   magnitude au maximum d'éclat (v.max <= 12, puis bandes de 1 mag de 12 à --max-mag) et par
 *   24 tranches d'ascension droite de 15°.
 * - Fusionner avec les fiches codées en dur des 16 cibles historiques (HISTORICAL_STARS_METADATA) et
 *   avec les lignes Turso qui ont des `details`.
 * - Calculer la constellation (src/lib/constellation-from-coords.ts) et mapper les types VSX vers les
 *   5 catégories du site.
 * - Insérer par lots de 200 en upsert (ON CONFLICT(id)), en gardant une distance ou des details déjà
 *   présents.
 * - Le cross-match Gaia DR3 inclus dans le code est désactivé (doGaia vaut false pour toutes les
 *   bandes) : les distances viennent des cibles historiques ou de scripts/pipeline/crossmatch-variable-stars.mjs.
 * - Écrire dans database_metadata : variable_stars_last_sync, _count, _size_bytes (estimation) et
 *   _max_mag.
 *
 * Reprise : la position (bande, tranche) est enregistrée après chaque tranche dans
 * scripts/pipeline/import-progress.json. Au lancement suivant sans option, l'import reprend à cette
 * position sans rien effacer. Le fichier est supprimé à la fin d'un import complet.
 *
 * Effet distant : Turso (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, .env de la racine du dépôt) et requêtes
 * VizieR TAP. Effet local : scripts/pipeline/import-progress.json.
 *
 * Options disponibles (lues à la main, toute option inconnue est ignorée) :
 *   (aucune)      : reprend depuis import-progress.json s'il existe ; sinon DELETE de la table puis
 *                   import complet.
 *   --fresh       : supprime le fichier de progression, vide la table (DELETE) et importe tout.
 *                   Prioritaire sur --no-clean si les deux sont passés.
 *   --no-clean    : supprime le fichier de progression et repart de la première bande SANS vider la
 *                   table (upsert : comble les trous, met à jour les lignes existantes).
 *   --max-mag <n> : magnitude (v.max) de la dernière bande ; défaut 25. Valeur séparée par une espace,
 *                   pas de `--max-mag=n`. Une valeur non numérique ou <= 0 est ignorée (25 retenu).
 *                   La bande v.max <= 12 est toujours importée : une valeur < 12 n'importe que celle-ci.
 *                   En reprise, repasser la même valeur (la liste des bandes en dépend).
 *
 * Code de sortie : 1 si VizieR échoue 5 fois de suite sur une tranche ou si Turso échoue ; la
 * progression déjà enregistrée permet de relancer.
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/update-variable-stars.mjs                         # reprise, ou import complet après DELETE
 *   node scripts/pipeline/update-variable-stars.mjs --no-clean --max-mag 15 # complète jusqu'à mag 15 sans effacer
 *   node scripts/pipeline/update-variable-stars.mjs --fresh --max-mag 12    # repart de zéro, étoiles v.max <= 12
 *   npm run update-variable-stars -- --no-clean
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { createClient } from '@libsql/client';
import { loadEnv } from '../lib/env.mjs';
// POURQUOI : même table IAU que le site (Node exécute le .ts sans transpilation, types effacés).
import { constellationFromCoords } from '../../src/lib/constellation-from-coords.ts';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Charger le fichier .env depuis la racine du projet, quel que soit le répertoire d'exécution actuel (CWD)

/**
 * Normalise un nom pour comparaison de chaînes de caractères.
 *
 * @param {string} name - Nom d'étoile ou identifiant.
 * @returns {string} Version normalisée (alphanumérique uniquement, minuscules).
 */
function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Mappe le type de variabilité technique VSX vers une des 5 catégories du frontend.
 *
 * @param {string} rawType - Type brut de VSX.
 * @returns {string} Une catégorie parmi 'eclipsing', 'cepheid', 'mira', 'semiregular', 'cataclysmique'.
 */
function mapVariabilityType(rawType) {
    if (!rawType) return 'semiregular';
    const cleanType = rawType.toUpperCase().trim();

    // 1. Binaires à éclipses
    if (
        cleanType.startsWith('EA') ||
        cleanType.startsWith('EB') ||
        cleanType.startsWith('EW') ||
        cleanType === 'E' ||
        cleanType.startsWith('ELL')
    ) {
        return 'eclipsing';
    }

    // 2. Céphéides et RR Lyrae
    if (
        cleanType.startsWith('DCEP') ||
        cleanType.startsWith('CEP') ||
        cleanType.startsWith('CW') ||
        cleanType.startsWith('RR') ||
        cleanType === 'R'
    ) {
        return 'cepheid';
    }

    // 3. Mira
    if (cleanType === 'M' || cleanType.startsWith('M:')) {
        return 'mira';
    }

    // 4. Cataclysmiques et novae
    if (
        cleanType.startsWith('UG') ||
        cleanType.startsWith('N') ||
        cleanType.startsWith('GCAS') ||
        cleanType.startsWith('SDOR') ||
        cleanType.startsWith('ZAND') ||
        cleanType.includes('CV') ||
        cleanType.includes('NOVA') ||
        cleanType.startsWith('UV')
    ) {
        return 'cataclysmique';
    }

    // 5. Semi-régulières / autres pulsantes lentes
    return 'semiregular';
}

/**
 * Slugifie un texte pour en faire un identifiant valide.
 *
 * @param {string} text - Le texte brut.
 * @returns {string} Le slug.
 */
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
        .trim()
        .replace(/\s+/g, '-') // Remplace les espaces par des tirets
        .replace(/[^\w-]+/g, '') // Retire les caractères spéciaux
        .replace(/--+/g, '-'); // Supprime les tirets doublons
}

/**
 * Construit un nom d'étoile convivial à partir de la désignation VSX.
 *
 * @param {string} rawName - Le nom brut.
 * @returns {string} Le nom formaté.
 */
function formatStarName(rawName) {
    let name = rawName.trim();
    // Correction de l'abréviation standard VizieR alf -> Alpha, bet -> Beta, etc.
    const greekMap = {
        alf: 'Alpha',
        bet: 'Beta',
        gam: 'Gamma',
        del: 'Delta',
        eps: 'Epsilon',
        zet: 'Zeta',
        eta: 'Eta',
        the: 'Theta',
        iot: 'Iota',
        kap: 'Kappa',
        lam: 'Lambda',
        mu: 'Mu',
        nu: 'Nu',
        xi: 'Xi',
        omi: 'Omicron',
        pi: 'Pi',
        rho: 'Rho',
        sig: 'Sigma',
        tau: 'Tau',
        ups: 'Upsilon',
        phi: 'Phi',
        chi: 'Chi',
        psi: 'Psi',
        ome: 'Omega',
    };
    const parts = name.split(/\s+/);
    if (parts.length > 0 && greekMap[parts[0]]) {
        parts[0] = greekMap[parts[0]];
        name = parts.join(' ');
    }
    return name;
}

/**
 * Les métadonnées enrichies des 16 étoiles variables historiques de l'application.
 * POURQUOI: Ces étoiles de référence possèdent des descriptions et des traductions
 * françaises soignées qui doivent être préservées indépendamment des données VizieR.
 * De plus, certaines de ces étoiles (comme SS Cyg ou Z Cam) ont une magnitude maximale
 * supérieure à 7.0 et ne seraient pas incluses par la requête TAP VizieR seule.
 *
 * @type {Record<string, {
 *   id: string,
 *   name: string,
 *   starName: string,
 *   constellation: string,
 *   ra: number,
 *   dec: number,
 *   vMagMin: number,
 *   vMagMax: number,
 *   period: number,
 *   epoch: number,
 *   type: string,
 *   spectralType: string,
 *   distance: number,
 *   details: string,
 *   vsxNames: string[]
 * }>}
 */
const HISTORICAL_STARS_METADATA = {
    algol: {
        id: 'algol',
        name: 'Algol',
        starName: 'Beta Persei',
        constellation: 'Per',
        ra: 47.042,
        dec: 40.956,
        vMagMin: 2.12,
        vMagMax: 3.39,
        period: 2.8673,
        epoch: 2452500.281,
        type: 'eclipsing',
        spectralType: 'B8V + K0IV',
        distance: 93,
        details:
            "L'étoile de la Tête de la Méduse, prototype légendaire des binaires à éclipses. Sa luminosité chute régulièrement d'un facteur 3 tous les 2,87 jours lors du passage de l'étoile secondaire, plus froide et plus grande, devant la primaire.",
        vsxNames: ['bet Per', 'Beta Persei', 'Algol'],
    },
    mira: {
        id: 'mira',
        name: 'Mira',
        starName: 'Omicron Ceti',
        constellation: 'Cet',
        ra: 34.837,
        dec: -2.978,
        vMagMin: 2.0,
        vMagMax: 10.1,
        period: 331.96,
        epoch: 2459000.5,
        type: 'mira',
        spectralType: 'M7IIIe + DA',
        distance: 418,
        details:
            "L'étoile 'Merveilleuse'. Première étoile variable découverte à l'époque moderne (1596). C'est une géante rouge géante pulsant sur une période de 11 mois, passant d'un éclat bien visible à l'œil nu à l'invisibilité instrumentale totale.",
        vsxNames: ['omi Cet', 'Omicron Ceti', 'Mira'],
    },
    'delta-cephei': {
        id: 'delta-cephei',
        name: 'Delta Cephei',
        starName: 'Delta Cephei',
        constellation: 'Cep',
        ra: 337.293,
        dec: 58.415,
        vMagMin: 3.48,
        vMagMax: 4.37,
        period: 5.3663,
        epoch: 2450000.166,
        type: 'cepheid',
        spectralType: 'F5Ib-G1Ib',
        distance: 887,
        details:
            "Prototype des Céphéides classiques, de très grosses étoiles supergéantes jaunes pulsantes. La relation fondamentale entre leur période de pulsation et leur luminosité absolue en fait des jalons cruciaux de l'échelle des distances cosmiques.",
        vsxNames: ['del Cep', 'Delta Cephei'],
    },
    betelgeuse: {
        id: 'betelgeuse',
        name: 'Bételgeuse',
        starName: 'Alpha Orionis',
        constellation: 'Ori',
        ra: 88.793,
        dec: 7.407,
        vMagMin: 0.0,
        vMagMax: 1.3,
        period: 400.0,
        epoch: 2458000.0,
        type: 'semiregular',
        spectralType: 'M1-M2Ia-ab',
        distance: 640,
        details:
            "Supergéante rouge massive aux confins de sa vie (future supernova). Ses pulsations semi-régulières de grande échelle s'accompagnent de spectaculaires éjections de poussière circumstellaire provoquant de grands déclins d'éclat (comme en 2020).",
        vsxNames: ['alf Ori', 'Alpha Orionis', 'Betelgeuse'],
    },
    'rr-lyrae': {
        id: 'rr-lyrae',
        name: 'RR Lyrae',
        starName: 'RR Lyrae',
        constellation: 'Lyr',
        ra: 291.366,
        dec: 42.784,
        vMagMin: 7.06,
        vMagMax: 8.12,
        period: 0.5668,
        epoch: 2453000.15,
        type: 'cepheid',
        spectralType: 'A8-F7',
        distance: 860,
        details:
            'Prototype de sa classe de géantes blanches pulsantes de courte période, très communes dans les amas globulaires.',
        vsxNames: ['RR Lyr', 'RR Lyrae'],
    },
    'chi-cygni': {
        id: 'chi-cygni',
        name: 'Chi Cygni',
        starName: 'Chi Cygni',
        constellation: 'Cyg',
        ra: 297.641,
        dec: 32.914,
        vMagMin: 3.3,
        vMagMax: 14.2,
        period: 408.0,
        epoch: 2459100.0,
        type: 'mira',
        spectralType: 'S6-S10',
        distance: 550,
        details:
            "Étoile de type S riche en zirconium. C'est l'une des variables régulières dont l'amplitude est la plus impressionnante du ciel (plus de 10 magnitudes), passant du statut d'étoile brillante dans le cou du Cygne à une lueur extrêmement faible.",
        vsxNames: ['chi Cyg', 'Chi Cygni'],
    },
    'ss-cygni': {
        id: 'ss-cygni',
        name: 'SS Cygni',
        starName: 'SS Cygni',
        constellation: 'Cyg',
        ra: 325.678,
        dec: 43.586,
        vMagMin: 8.2,
        vMagMax: 12.4,
        period: 49.5,
        epoch: 2459200.25,
        type: 'cataclysmique',
        spectralType: 'K5V + WD',
        distance: 372,
        details:
            "Le prototype des novae naines de type U Geminorum. Une étoile naine rouge transfère sa matière à une naine blanche par un disque d'accrétion. L'effondrement thermique périodique du disque déclenche des explosions cycliques spectaculaires d'environ 4 magnitudes.",
        vsxNames: ['SS Cyg', 'SS Cygni'],
    },
    'beta-lyrae': {
        id: 'beta-lyrae',
        name: 'Sheliak',
        starName: 'Beta Lyrae',
        constellation: 'Lyr',
        ra: 282.52,
        dec: 33.362,
        vMagMin: 3.25,
        vMagMax: 4.36,
        period: 12.9406,
        epoch: 2452800.12,
        type: 'eclipsing',
        spectralType: 'B8II-IIIe',
        distance: 960,
        details:
            "Système binaire en interaction gravitationnelle extrême. Les deux étoiles sont si proches qu'elles se déforment mutuellement en forme d'œufs. Le transfert de masse continu alimente un immense tore de gaz entourant la composante secondaire.",
        vsxNames: ['bet Lyr', 'Beta Lyrae', 'Sheliak'],
    },
    'eta-aquilae': {
        id: 'eta-aquilae',
        name: 'Eta Aquilae',
        starName: 'Eta Aquilae',
        constellation: 'Aql',
        ra: 298.118,
        dec: 1.006,
        vMagMin: 3.48,
        vMagMax: 4.39,
        period: 7.1766,
        epoch: 2451000.5,
        type: 'cepheid',
        spectralType: 'F6Ib-G4Ib',
        distance: 1200,
        details:
            "L'une des Céphéides classiques les plus brillantes et faciles à repérer à l'œil nu dans l'hémisphère nord. Découverte variable en 1784 par Edward Pigott, elle est parfaite pour s'exercer à l'estimation visuelle sans matériel.",
        vsxNames: ['eta Aql', 'Eta Aquilae'],
    },
    'r-leonis': {
        id: 'r-leonis',
        name: 'R Leonis',
        starName: 'R Leonis',
        constellation: 'Leo',
        ra: 146.89,
        dec: 11.429,
        vMagMin: 4.4,
        vMagMax: 11.3,
        period: 312.0,
        epoch: 2459250.0,
        type: 'mira',
        spectralType: 'M8IIIe',
        distance: 370,
        details:
            'Géante rouge froide et très évoluée du Lion. Sa couleur rouge brique ou pourpre très prononcée est un enchantement visuel au télescope, contrastant magnifiquement avec les étoiles voisines plus chaudes.',
        vsxNames: ['R Leo', 'R Leonis'],
    },
    'p-cygni': {
        id: 'p-cygni',
        name: 'P Cygni',
        starName: 'P Cygni',
        constellation: 'Cyg',
        ra: 304.447,
        dec: 38.033,
        vMagMin: 4.6,
        vMagMax: 4.9,
        period: 100.0,
        epoch: 2450000.0,
        type: 'semiregular',
        spectralType: 'B1Ia+',
        distance: 6000,
        details:
            "Supergéante bleue hyperlumineuse et Variable Bleue Lumineuse (LBV). Ses éruptions historiques majeures au XVIIe siècle ont éjecté d'immenses coquilles de gaz. Elle fluctue aujourd'hui faiblement de manière semi-régulière avec un fort vent stellaire.",
        vsxNames: ['P Cyg', 'P Cygni'],
    },
    't-coronae-borealis': {
        id: 't-coronae-borealis',
        name: 'T Coronae Borealis',
        starName: 'T Coronae Borealis',
        constellation: 'CrB',
        ra: 239.876,
        dec: 25.92,
        vMagMin: 2.0,
        vMagMax: 10.8,
        period: 29000.0,
        epoch: 2459300.0,
        type: 'cataclysmique',
        spectralType: 'M3III + WD',
        distance: 3000,
        details:
            "La 'Nova Récurrente' la plus célèbre du ciel. Habituellement invisible à l'œil nu (magnitude ~10), elle subit une éruption thermonucléaire globale tous les 80 ans environ (1866, 1946) atteignant la magnitude 2 en quelques heures à peine.",
        vsxNames: ['T CrB', 'T Coronae Borealis'],
    },
    'mu-cephei': {
        id: 'mu-cephei',
        name: 'Mu Cephei',
        starName: 'Mu Cephei',
        constellation: 'Cep',
        ra: 325.877,
        dec: 58.78,
        vMagMin: 3.4,
        vMagMax: 5.1,
        period: 730.0,
        epoch: 2458500.0,
        type: 'semiregular',
        spectralType: 'M2Ia',
        distance: 2840,
        details:
            "Baptisée 'l'Étoile Grenat' par William Herschel en raison de son éclat rouge profond. C'est l'une des plus grandes supergéantes rouges connues (rayon d'environ 1000 fois celui du Soleil) présentant des variations pulsatiles et convectives complexes.",
        vsxNames: ['mu Cep', 'Mu Cephei'],
    },
    'r-scuti': {
        id: 'r-scuti',
        name: 'R Scuti',
        starName: 'R Scuti',
        constellation: 'Sct',
        ra: 281.884,
        dec: -5.701,
        vMagMin: 4.2,
        vMagMax: 8.6,
        period: 146.5,
        epoch: 2459150.0,
        type: 'semiregular',
        spectralType: 'G0Iae-K2p(M3)Ibe',
        distance: 1400,
        details:
            "Variable de type RV Tauri. Supergéante jaune-orange en fin de vie subissant des pulsations instables caractérisées par l'alternance d'un minimum d'éclat profond et d'un minimum d'éclat secondaire moins marqué.",
        vsxNames: ['R Sct', 'R Scuti'],
    },
    'u-vulpeculae': {
        id: 'u-vulpeculae',
        name: 'U Vulpeculae',
        starName: 'U Vulpeculae',
        constellation: 'Vul',
        ra: 294.157,
        dec: 20.333,
        vMagMin: 6.73,
        vMagMax: 7.54,
        period: 7.9907,
        epoch: 2450500.2,
        type: 'cepheid',
        spectralType: 'F5Ib-G2Ib',
        distance: 2000,
        details:
            "Céphéide classique de luminosité intermédiaire, idéale pour le suivi photométrique aux jumelles ou avec de petits instruments dotés d'APN grand champ.",
        vsxNames: ['U Vul', 'U Vulpeculae'],
    },
    'z-camelopardalis': {
        id: 'z-camelopardalis',
        name: 'Z Camelopardalis',
        starName: 'Z Camelopardalis',
        constellation: 'Cam',
        ra: 126.289,
        dec: 73.111,
        vMagMin: 10.0,
        vMagMax: 14.5,
        period: 26.9,
        epoch: 2459400.0,
        type: 'cataclysmique',
        spectralType: 'Pec',
        distance: 530,
        details:
            "Nova naine prototypique caractérisée par des phases de blocage ou 'standstills'. Après une éruption, la luminosité peut se stabiliser pendant des mois à un niveau intermédiaire avant de reprendre son cycle habituel d'explosions.",
        vsxNames: ['Z Cam', 'Z Camelopardalis'],
    },
};

// Table d'association rapide des noms VSX vers l'ID historique
const VSX_TO_HISTORICAL_ID = {};
for (const [id, s] of Object.entries(HISTORICAL_STARS_METADATA)) {
    for (const vsxName of s.vsxNames) {
        VSX_TO_HISTORICAL_ID[normalizeName(vsxName)] = id;
    }
    VSX_TO_HISTORICAL_ID[normalizeName(s.name)] = id;
    VSX_TO_HISTORICAL_ID[normalizeName(s.starName)] = id;
}

/**
 * Point d'entrée principal du pipeline de mise à jour des étoiles variables.
 * Supporte le mode incrémentiel (reprise après erreur) par tranche de magnitude et RA.
 *
 * @returns {Promise<void>}
 */
async function main() {
    console.log('🌌 Démarrage du pipeline de mise à jour des étoiles variables...');

    // Parsing des arguments
    const argsList = process.argv.slice(2);
    const isFresh = argsList.includes('--fresh');
    const noClean = argsList.includes('--no-clean');
    let maxMag = 25.0;
    const magIdx = argsList.indexOf('--max-mag');
    if (magIdx !== -1 && argsList[magIdx + 1]) {
        const val = parseFloat(argsList[magIdx + 1]);
        if (!isNaN(val) && val > 0) {
            maxMag = val;
        }
    }

    const PROGRESS_FILE = path.join(PROJECT_ROOT, 'scripts/pipeline/import-progress.json');
    let progress = {
        currentBandIdx: 0,
        currentSliceIdx: 0,
        totalInserted: 0,
    };

    // Charger la progression précédente si existante et si on ne force pas un nouveau départ (avec --fresh ou --no-clean)
    const forceStartOver = isFresh || noClean;

    if (!forceStartOver && fs.existsSync(PROGRESS_FILE)) {
        try {
            progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
            console.log(
                `♻️ Progression restaurée : Bande ${progress.currentBandIdx}, Tranche RA ${progress.currentSliceIdx}, Total déjà inséré: ${progress.totalInserted}`,
            );
        } catch (e) {
            console.warn('⚠️ Impossible de charger la progression précédente. Démarrage à zéro.', e.message);
        }
    } else {
        if (isFresh) {
            console.log('🧹 Nouveau départ. Nettoyage de la base de données locale...');
            const dbUrl = process.env.TURSO_DATABASE_URL;
            const dbToken = process.env.TURSO_AUTH_TOKEN;
            if (dbUrl) {
                const dbClient = createClient({ url: dbUrl, authToken: dbToken });
                try {
                    await dbClient.execute('DELETE FROM variable_stars;');
                    console.log('🧹 Base de données nettoyée avec succès !');
                } catch (err) {
                    console.warn('⚠️ Impossible de nettoyer la base Turso :', err.message);
                } finally {
                    dbClient.close();
                }
            }
        } else if (noClean) {
            console.log("🔄 Nouveau départ (remplissage des trous). La base de données n'est PAS effacée.");
        } else {
            console.log('🧹 Aucun fichier de progression trouvé. Nettoyage de la base par sécurité...');
            const dbUrl = process.env.TURSO_DATABASE_URL;
            const dbToken = process.env.TURSO_AUTH_TOKEN;
            if (dbUrl) {
                const dbClient = createClient({ url: dbUrl, authToken: dbToken });
                try {
                    await dbClient.execute('DELETE FROM variable_stars;');
                } catch (err) {
                    console.warn('⚠️ Impossible de nettoyer la base Turso :', err.message);
                } finally {
                    dbClient.close();
                }
            }
        }
        if (fs.existsSync(PROGRESS_FILE)) {
            fs.unlinkSync(PROGRESS_FILE);
        }
    }

    // Charger les étoiles de référence locales (pour conserver les descriptions riches)
    let localStarsMap = new Map();
    const dbUrl = process.env.TURSO_DATABASE_URL;
    const dbToken = process.env.TURSO_AUTH_TOKEN;
    if (dbUrl) {
        try {
            const dbClient = createClient({ url: dbUrl, authToken: dbToken });
            const res = await dbClient.execute('SELECT * FROM variable_stars WHERE details IS NOT NULL');
            for (const s of res.rows) {
                localStarsMap.set(normalizeName(s.name), s);
                localStarsMap.set(normalizeName(s.star_name || ''), s);
            }
            dbClient.close();
            console.log(`📖 ${localStarsMap.size} étoiles historiques chargées pour fusion des descriptions.`);
        } catch (e) {
            console.warn('⚠️ Impossible de charger les descriptions depuis Turso :', e.message);
        }
    }

    // Définir les bandes de magnitude
    const bands = [{ name: 'Mag <= 12', filter: `v.max <= 12.0`, doGaia: false }];
    // Créer des bandes de 1 magnitude de 12 à maxMag
    const minBandMag = 12.0;
    for (let m = minBandMag; m < maxMag; m++) {
        const nextM = Math.min(maxMag, m + 1.0);
        bands.push({
            name: `Mag ]${m.toFixed(1)}, ${nextM.toFixed(1)}]`,
            filter: `v.max > ${m.toFixed(1)} AND v.max <= ${nextM.toFixed(1)}`,
            doGaia: false,
        });
    }

    const dbClient = createClient({ url: dbUrl, authToken: dbToken });

    // Helper avec retry et timeout pour les batchs Turso
    const executeWithRetry = async (statements, retries = 5, delay = 1500) => {
        const timeoutMs = 30000; // 30 secondes de timeout par lot
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Course entre la requête Turso et un rejet après timeout
                await Promise.race([
                    dbClient.batch(statements),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("TIMEOUT: Turso n'a pas répondu dans les 30s")), timeoutMs),
                    ),
                ]);
                return;
            } catch (err) {
                if (attempt === retries) {
                    throw err;
                }
                console.warn(
                    `⚠️ [Tentative ${attempt}/${retries}] Échec d'insertion : ${err.message}. Retentative dans ${delay}ms...`,
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2; // Backoff exponentiel
            }
        }
    };

    const slices = 24;
    const sliceWidth = 360 / slices;

    try {
        for (let b = progress.currentBandIdx; b < bands.length; b++) {
            const band = bands[b];
            console.log(`🚀 [Bande ${b + 1}/${bands.length}] Traitement : ${band.name}`);

            for (let s = b === progress.currentBandIdx ? progress.currentSliceIdx : 0; s < slices; s++) {
                const raMin = s * sliceWidth;
                const raMax = (s + 1) * sliceWidth;
                console.log(
                    `⏳   [Tranche RA ${s + 1}/${slices}] Téléchargement RA [${raMin.toFixed(1)}°, ${raMax.toFixed(1)}°]...`,
                );

                const query = `
                    SELECT v.Name, v.RAJ2000, v.DEJ2000, v.Type, v.max, v.min, v.Epoch, v.Period, v.Sp
                    FROM "B/vsx/vsx" v
                    WHERE ${band.filter} AND v.Period IS NOT NULL AND v.RAJ2000 >= ${raMin} AND v.RAJ2000 < ${raMax}
                `;
                const url = `https://tapvizier.u-strasbg.fr/TAPVizieR/tap/sync?request=doQuery&lang=ADQL&query=${encodeURIComponent(query)}&format=json&MAXREC=1000000`;

                let rawData = [];
                const maxFetchAttempts = 5;
                let fetchDelay = 5000;

                for (let attempt = 1; attempt <= maxFetchAttempts; attempt++) {
                    try {
                        const res = await fetch(url);
                        if (!res.ok) {
                            throw new Error(`VizieR a retourné HTTP ${res.status}`);
                        }
                        const json = await res.json();

                        const cols = json.metadata.map((c) => c.name);
                        const nameIdx = cols.indexOf('Name');
                        const raIdx = cols.indexOf('RAJ2000');
                        const decIdx = cols.indexOf('DEJ2000');
                        const typeIdx = cols.indexOf('Type');
                        const maxIdx = cols.indexOf('max');
                        const minIdx = cols.indexOf('min');
                        const epochIdx = cols.indexOf('Epoch');
                        const periodIdx = cols.indexOf('Period');
                        const spIdx = cols.indexOf('Sp');

                        for (const row of json.data) {
                            const rawName = row[nameIdx];
                            if (!rawName) continue;
                            rawData.push({
                                name: rawName.trim(),
                                ra: Number(row[raIdx]),
                                dec: Number(row[decIdx]),
                                rawType: row[typeIdx] ? row[typeIdx].trim() : '',
                                maxVal: row[maxIdx] !== null && row[maxIdx] !== undefined ? Number(row[maxIdx]) : 0,
                                minVal: row[minIdx] !== null && row[minIdx] !== undefined ? Number(row[minIdx]) : 0,
                                epoch:
                                    row[epochIdx] !== null && row[epochIdx] !== undefined
                                        ? Number(row[epochIdx])
                                        : 2450000.0,
                                period: Number(row[periodIdx]),
                                spectralType: row[spIdx] ? row[spIdx].trim() : 'N/A',
                                plx: null,
                            });
                        }
                        break;
                    } catch (e) {
                        if (attempt === maxFetchAttempts) {
                            console.error(
                                `❌   Échec définitif de téléchargement VizieR après ${maxFetchAttempts} tentatives :`,
                                e.message,
                            );
                            process.exit(1);
                        }
                        console.warn(
                            `⚠️   [Tentative ${attempt}/${maxFetchAttempts}] Échec VizieR : ${e.message}. Retentative dans ${fetchDelay}ms...`,
                        );
                        await new Promise((resolve) => setTimeout(resolve, fetchDelay));
                        fetchDelay *= 2;
                    }
                }

                if (rawData.length === 0) {
                    console.log(`   -> Aucun résultat.`);
                    // Enregistrer la progression
                    progress.currentSliceIdx = s + 1;
                    if (progress.currentSliceIdx >= slices) {
                        progress.currentBandIdx = b + 1;
                        progress.currentSliceIdx = 0;
                    }
                    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
                    continue;
                }

                console.log(`   -> ${rawData.length} étoiles brutes chargées.`);

                // 2b. Gaia DR3 Cross-Match (uniquement si doGaia = true)
                const nameToPlx = new Map();
                if (band.doGaia) {
                    console.log(`   📡 Lancement du cross-match spatial Gaia DR3 pour ${rawData.length} étoiles...`);
                    const chunkSize = 15000;
                    for (let i = 0; i < rawData.length; i += chunkSize) {
                        const chunk = rawData.slice(i, i + chunkSize);
                        const csvRows = chunk.map((item) => ({ name: item.name, raj2000: item.ra, dej2000: item.dec }));
                        const csvContent = Papa.unparse(csvRows);

                        const formData = new FormData();
                        formData.append('request', 'xmatch');
                        formData.append('distMaxArcsec', '3');
                        formData.append('RESPONSEFORMAT', 'csv');

                        const blob = new Blob([csvContent], { type: 'text/csv' });
                        formData.append('cat1', blob, 'targets.csv');
                        formData.append('cat2', 'vizier:I/355/gaiadr3');
                        formData.append('colRA1', 'raj2000');
                        formData.append('colDec1', 'dej2000');

                        try {
                            const response = await fetch('http://cdsxmatch.u-strasbg.fr/xmatch/api/v1/sync', {
                                method: 'POST',
                                body: formData,
                            });
                            if (response.ok) {
                                const csvText = await response.text();
                                const parsed = Papa.parse(csvText, {
                                    header: true,
                                    skipEmptyLines: true,
                                    dynamicTyping: true,
                                });
                                for (const row of parsed.data) {
                                    if (row.Plx !== null && row.Plx !== undefined && row.Plx > 0) {
                                        nameToPlx.set(row.name, row.Plx);
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn(`   ⚠️ Échec partiel du cross-match Gaia :`, err.message);
                        }
                    }
                }

                // 3. Fusion et préparation
                const statements = [];
                for (const item of rawData) {
                    const plx = nameToPlx.get(item.name) || null;
                    const formattedName = formatStarName(item.name);
                    const normName = normalizeName(item.name);
                    const normFormattedName = normalizeName(formattedName);
                    const slugId = slugify(formattedName);
                    const historicalId = VSX_TO_HISTORICAL_ID[normName] || VSX_TO_HISTORICAL_ID[normFormattedName];
                    const id = historicalId || slugId;

                    const local = historicalId
                        ? HISTORICAL_STARS_METADATA[historicalId]
                        : localStarsMap.get(normName) || localStarsMap.get(normFormattedName) || {};

                    let distance = 0;
                    if (local.distance !== undefined && local.distance > 0) {
                        distance = local.distance;
                    } else if (plx !== null && plx > 0) {
                        distance = Math.round(3261.56 / plx);
                    }

                    const constellation = local.constellation || constellationFromCoords(item.ra, item.dec) || '';
                    const type = local.type || mapVariabilityType(item.rawType);
                    const spectralType =
                        local.spectralType && local.spectralType !== 'N/A' ? local.spectralType : item.spectralType;
                    const name = local.name || formattedName;
                    const starName = local.starName || formattedName;
                    const epoch = local.epoch || item.epoch;
                    const period = local.period || item.period;
                    const vMagMin = local.vMagMin || item.maxVal;

                    let vMagMax = local.vMagMax;
                    if (!vMagMax) {
                        if (item.minVal !== null && item.minVal !== undefined && item.minVal < item.maxVal) {
                            vMagMax = item.maxVal + item.minVal;
                        } else {
                            vMagMax = item.minVal !== null && item.minVal !== undefined ? item.minVal : item.maxVal;
                        }
                    }

                    statements.push({
                        sql: `INSERT INTO variable_stars (
                            id, name, star_name, constellation, ra, dec, v_mag_min, v_mag_max, period, epoch, type, spectral_type, distance, details
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            name = excluded.name,
                            star_name = excluded.star_name,
                            constellation = excluded.constellation,
                            ra = excluded.ra,
                            dec = excluded.dec,
                            v_mag_min = excluded.v_mag_min,
                            v_mag_max = excluded.v_mag_max,
                            period = excluded.period,
                            epoch = excluded.epoch,
                            type = excluded.type,
                            spectral_type = excluded.spectral_type,
                            distance = COALESCE(variable_stars.distance, excluded.distance),
                            details = COALESCE(excluded.details, variable_stars.details)`,
                        args: [
                            id,
                            name,
                            starName,
                            constellation,
                            item.ra,
                            item.dec,
                            vMagMin,
                            vMagMax,
                            period,
                            epoch,
                            type,
                            spectralType,
                            distance || null,
                            local.details || null,
                        ],
                    });
                }

                // 4. Insertion en base par lots de 200 de manière séquentielle pour éviter les verrous SQLite et les timeouts d'indexation sur Turso
                const dbBatchSize = 200;
                for (let i = 0; i < statements.length; i += dbBatchSize) {
                    const chunk = statements.slice(i, i + dbBatchSize);
                    await executeWithRetry(chunk);

                    if (statements.length > 2000) {
                        process.stdout.write(
                            `      -> [Progression insertion : ${Math.min(statements.length, i + dbBatchSize)}/${statements.length}...]\n`,
                        );
                    }
                }

                progress.totalInserted += statements.length;
                console.log(
                    `   ✅ Inséré ${statements.length} étoiles (Total cumulé inséré : ${progress.totalInserted})`,
                );

                // Sauvegarder la progression
                progress.currentSliceIdx = s + 1;
                if (progress.currentSliceIdx >= slices) {
                    progress.currentBandIdx = b + 1;
                    progress.currentSliceIdx = 0;
                }
                fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
            }
        }

        console.log(`✨ Toutes les magnitudes et RA slices ont été importées avec succès !`);

        console.log('💾 Enregistrement des métadonnées de synchronisation...');
        await dbClient.execute(
            'CREATE TABLE IF NOT EXISTS database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
        );
        await dbClient.execute({
            sql: `INSERT OR REPLACE INTO database_metadata (key, value) VALUES (?, ?), (?, ?), (?, ?), (?, ?)`,
            args: [
                'variable_stars_last_sync',
                new Date().toISOString(),
                'variable_stars_size_bytes',
                String(progress.totalInserted * 120),
                'variable_stars_max_mag',
                String(maxMag),
                'variable_stars_count',
                String(progress.totalInserted),
            ],
        });

        // Supprimer le fichier de progression à la fin
        if (fs.existsSync(PROGRESS_FILE)) {
            fs.unlinkSync(PROGRESS_FILE);
        }
    } catch (e) {
        console.error('❌ Erreur critique lors de la mise à jour des étoiles variables :', e.message);
        process.exit(1);
    } finally {
        dbClient.close();
    }
}

main().catch(console.error);
