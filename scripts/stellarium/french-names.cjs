/**
 * Force-localization utility for Stellarium skyculture.
 *
 * Responsibility:
 * - Overwrites both French and Native common names in the constellation index.
 * - Removes accents from French names to ensure compatibility with simpler rendering engines.
 * - Used as a fallback when standard localization configuration fails.
 */

const fs = require('fs');
const path = require('path');

const targetFile = path.join(process.cwd(), 'public/data/skycultures/western/index.json');

const frenchNames = {
    And: 'Andromède',
    Ant: 'Machine Pneumatique',
    Aps: 'Oiseau de Paradis', // Fixed from Apus
    Aqr: 'Verseau',
    Aql: 'Aigle',
    Ara: 'Autel',
    Ari: 'Bélier',
    Aur: 'Cocher',
    Boo: 'Bouvier',
    Cae: 'Burin',
    Cam: 'Girafe',
    Cnc: 'Cancer',
    CVn: 'Chiens de Chasse',
    Cvn: 'Chiens de Chasse', // Handle both cases
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
    Del: 'Dauphin',
    Dor: 'Dorade',
    Dra: 'Dragon',
    Equ: 'Petit Cheval',
    Eri: 'Eridan',
    For: 'Fourneau',
    Gem: 'Gémeaux',
    Gru: 'Grue',
    Her: 'Hercule',
    Hor: 'Horloge',
    Hya: 'Hydre Femelle',
    Hyi: 'Hydre Mâle',
    Ind: 'Indien',
    Lac: 'Lézard',
    Leo: 'Lion',
    LMi: 'Petit Lion',
    Lep: 'Lièvre',
    Lib: 'Balance',
    Lup: 'Loup',
    Lyn: 'Lynx',
    Lyr: 'Lyre',
    Men: 'Table',
    Mic: 'Microscope',
    Mon: 'Licorne',
    Mus: 'Mouche',
    Nor: 'Règle',
    Oct: 'Octant',
    Oph: 'Ophiuchus',
    Ori: 'Orion',
    Pav: 'Paon',
    Peg: 'Pégase',
    Per: 'Persée',
    Phe: 'Phénix',
    Pic: 'Peintre',
    Psc: 'Poissons',
    PsA: 'Poisson Austral',
    Pup: 'Poupe',
    Pyx: 'Boussole',
    Ret: 'Réticule',
    Sge: 'Flèche',
    Sgr: 'Sagittaire',
    Sco: 'Scorpion',
    Scl: 'Sculpteur',
    Sct: 'Ecu de Sobieski',
    Ser: 'Serpent',
    Sex: 'Sextant',
    Tau: 'Taureau',
    Tel: 'Télescope',
    Tri: 'Triangle',
    TrA: 'Triangle Austral', // Handle both cases
    Tra: 'Triangle Austral',
    Tuc: 'Toucan',
    UMa: 'Grande Ourse',
    UMi: 'Petite Ourse',
    Vel: 'Voiles',
    Vir: 'Vierge',
    Vol: 'Poisson Volant',
    Vul: 'Petit Renard',
};

/**
 * Removes diacritics (accents) from a string.
 *
 * @param {string} str - The input string.
 * @returns {string} The normalized string without accents.
 */
function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Main execution flow for forcing the constellation index to use French names.
 */
function forceFrenchTranslations() {
    try {
        const data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
        let updatedCount = 0;

        data.constellations.forEach((constellation) => {
            const iau = constellation.iau;

            let frName = frenchNames[iau] || frenchNames[iau.charAt(0).toUpperCase() + iau.slice(1)];

            if (frName) {
                frName = removeAccents(frName);
                constellation.common_name.french = frName;
                constellation.common_name.native = frName;
                updatedCount++;
            } else {
                console.warn(`Warning: No French name found for ${iau}`);
            }
        });

        fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf8');
        console.log(`Force-updated ${updatedCount} constellations with French names (overwriting native).`);
    } catch (err) {
        console.error('Error updating JSON:', err);
    }
}

forceFrenchTranslations();
