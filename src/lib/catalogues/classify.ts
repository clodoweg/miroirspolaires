/**
 * @file src/lib/catalogues/classify.ts
 * @description Étiquetage précis des types d'objets célestes et classification en 5 grandes catégories.
 *
 * POURQUOI :
 * - typeLabel() fournit le type d'objet exact en français pour l'affichage dans le tableau ("Nébuleuse planétaire", "Amas globulaire", etc.).
 * - categorize() regroupe tous les types bruts dans les 5 catégories harmonisées ("Nébuleuse", "Galaxie", "Amas", "Étoile", "Autre") pour les filtres.
 */

/** NGC 2000.0 + SIMBAD + Anglais → Libellés précis en français pour l'affichage du tableau. */
const TYPE_NAMES: Record<string, string> = {
    // Galaxies
    Gx: 'Galaxie',
    G: 'Galaxie',
    AGN: 'Galaxie à noyau actif',
    'AG?': 'Galaxie à noyau actif (?)',
    Sy2: 'Galaxie de Seyfert 2',
    Sy1: 'Galaxie de Seyfert 1',
    SyG: 'Galaxie de Seyfert',
    LIN: 'Galaxie LINER',
    BLL: 'Blazar (BL Lac)',
    Bla: 'Blazar',
    rG: 'Radiogalaxie',
    Rad: 'Source radio',
    EmG: "Galaxie à raies d'émission",
    H2G: 'Galaxie HII',
    SBG: 'Galaxie à sursaut de formation',
    LSB: 'Galaxie à faible brillance',
    GiC: 'Galaxie dans amas',
    GiG: 'Galaxie dans groupe',
    GiP: 'Galaxie dans paire',
    galaxy: 'Galaxie',

    // Amas stellaires
    Gb: 'Amas globulaire',
    GlC: 'Amas globulaire',
    OC: 'Amas ouvert',
    OpC: 'Amas ouvert',
    'Cl*': 'Amas stellaire',
    open_cluster: 'Amas ouvert',
    globular_cluster: 'Amas globulaire',

    // Nébuleuses
    Nb: 'Nébuleuse',
    EmN: 'Nébuleuse en émission',
    RNe: 'Nébuleuse par réflexion',
    RfN: 'Nébuleuse par réflexion',
    DNe: 'Nébuleuse obscure',
    HII: 'Région HII',
    Pl: 'Nébuleuse planétaire',
    PN: 'Nébuleuse planétaire',
    'C+N': 'Amas + nébulosité',
    SNR: 'Rémanent de supernova',
    sh: 'Coquille / front de choc',
    ISM: 'Milieu interstellaire',
    nebula: 'Nébuleuse',
    planetary_nebula: 'Nébuleuse planétaire',
    dark_nebula: 'Nébuleuse obscure',
    reflection_nebula: 'Nébuleuse par réflexion',
    supernova_remnant: 'Rémanent de supernova',

    // Étoiles
    '*': 'Étoile',
    '**': 'Étoile double',
    '***': 'Étoile multiple',
    'D*': 'Étoile double',
    'D*?': 'Étoile double (?)',
    Mul: 'Étoile multiple',
    'WR*': 'Étoile Wolf-Rayet',
    'Ae*': 'Étoile Ae/Be de Herbig',
    'As*': 'Astérisme',
    Ast: 'Astérisme',
    star: 'Étoile',
    double_star: 'Étoile double',

    // Inconnu
    '-': 'Inconnu / non confirmé',
    '?': 'Type incertain',
    err: 'Identification erronée',
};

export type Category = 'Nébuleuse' | 'Galaxie' | 'Amas' | 'Étoile' | 'Autre';

/**
 * Classifie n'importe quel code ou libellé de type dans l'une des 5 catégories harmonisées pour le filtre.
 *
 * @param {string} [rawType] Le type brut issu du catalogue.
 * @returns {Category} La catégorie harmonisée ("Nébuleuse", "Galaxie", "Amas", "Étoile", "Autre").
 */
export function categorize(rawType?: string): Category {
    if (!rawType) return 'Autre';
    const t = rawType.trim();
    const label = (TYPE_NAMES[t] ?? t).toLowerCase();

    // Galaxies
    if (/galax|seyfert|blazar|liner|bl lac|galactique|amas de galaxies|groupe compact|galaxy/i.test(label)) {
        return 'Galaxie';
    }
    // Amas stellaires & astérismes
    if (/amas|astérisme|cluster/i.test(label)) {
        return 'Amas';
    }
    // Nébuleuses & rémanents
    if (/nébuleus|nebula|région hii|h ?ii|rémanent|coquille|milieu interstellaire|supernova/i.test(label)) {
        return 'Nébuleuse';
    }
    // Étoiles
    if (/étoile|etoile|wolf-rayet|herbig|star|\*/i.test(label)) {
        return 'Étoile';
    }
    return 'Autre';
}

/**
 * Renvoie le libellé précis en français du type d'objet pour l'affichage dans la colonne TYPE du tableau.
 *
 * @param {string} [code] Le code d'origine (ex: "Pl", "DNe", "Gb", "planetary_nebula").
 * @returns {string} Le nom français exact de l'objet (ex: "Nébuleuse planétaire", "Amas globulaire").
 */
export function typeLabel(code?: string): string {
    if (!code) return '—';
    const trimmed = code.trim();
    return TYPE_NAMES[trimmed] ?? trimmed;
}
