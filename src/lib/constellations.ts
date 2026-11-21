/**
 * IAU Constellation Abbreviation to French Name Mapping
 *
 * Provides a lookup table from standard 3-letter IAU abbreviations
 * (e.g. "Ori", "Sgr") to their French names (e.g. "Orion", "Sagittaire").
 */

/** Map of IAU 3-letter abbreviations to French constellation names. */
export const constellations: Record<string, string> = {
    And: 'Andromède',
    Ant: 'Machine Pneumatique',
    Aps: 'Oiseau de Paradis',
    Aql: 'Aigle',
    Aqr: 'Verseau',
    Ara: 'Autel',
    Ari: 'Bélier',
    Aur: 'Cocher',
    // B
    Boo: 'Bouvier',
    Cae: 'Burin',
    Cam: 'Girafe',
    Cnc: 'Cancer',
    CVn: 'Chiens de Chasse',
    CMa: 'Grand Chien',
    CMi: 'Petit Chien',
    Cap: 'Capricorne',
    Car: 'Carène',
    Cas: 'Cassiopée',
    Cen: 'Centaure',
    Cep: 'Céphée',
    Cet: 'Baleine',
    Cha: 'Caméléon',
    Cir: 'Compas',
    Col: 'Colombe',
    Com: 'Chevelure de Bérénice',
    CrA: 'Couronne Australe',
    CrB: 'Couronne Boréale',
    Crv: 'Corbeau',
    Crt: 'Coupe',
    Cru: 'Croix du Sud',
    Cyg: 'Cygne',
    // D
    Del: 'Dauphin',
    Dor: 'Dorade',
    Dra: 'Dragon',
    // E
    Equ: 'Petit Cheval',
    Eri: 'Éridan',
    // F
    For: 'Fourneau',
    // G
    Gem: 'Gémeaux',
    Gru: 'Grue',
    // H
    Her: 'Hercule',
    Hor: 'Horloge',
    Hya: 'Hydre',
    Hyi: 'Hydre Mâle',
    // I
    Ind: 'Indien',
    // L
    Lac: 'Lézard',
    Leo: 'Lion',
    LMi: 'Petit Lion',
    Lep: 'Lièvre',
    Lib: 'Balance',
    Lup: 'Loup',
    Lyn: 'Lynx',
    Lyr: 'Lyre',
    // M
    Men: 'Table',
    Mic: 'Microscope',
    Mon: 'Licorne',
    Mus: 'Mouche',
    // N
    Nor: 'Règle',
    // O
    Oct: 'Octant',
    Oph: 'Ophiuchus',
    Ori: 'Orion',
    // P
    Pav: 'Paon',
    Peg: 'Pégase',
    Per: 'Persée',
    Phe: 'Phénix',
    Pic: 'Peintre',
    Psc: 'Poissons',
    PsA: 'Poisson Austral',
    Pup: 'Poupe',
    Pyx: 'Boussole',
    // R
    Ret: 'Réticule',
    // S
    Sge: 'Flèche',
    Sgr: 'Sagittaire',
    Sco: 'Scorpion',
    Scl: 'Sculpteur',
    Sct: 'Écu de Sobieski',
    Ser: 'Serpent',
    Sex: 'Sextant',
    // T
    Tau: 'Taureau',
    Tel: 'Télescope',
    Tri: 'Triangle',
    TrA: 'Triangle Austral',
    Tuc: 'Toucan',
    // U
    UMa: 'Grande Ourse',
    UMi: 'Petite Ourse',
    // V
    Vel: 'Voiles',
    Vir: 'Vierge',
    Vol: 'Poisson Volant',
    Vul: 'Petit Renard',
};

/**
 * Converts an IAU 3-letter abbreviation to its French constellation name.
 * @param abbr - IAU abbreviation (e.g. "Ori", "Sgr")
 * @returns French name or the original abbreviation if not found
 */
export function getConstellationName(abbr?: string | null): string {
    if (!abbr || abbr === 'Unknown') return abbr ?? '';
    const cleanAbbr = abbr.trim();
    return constellations[cleanAbbr] || cleanAbbr;
}
