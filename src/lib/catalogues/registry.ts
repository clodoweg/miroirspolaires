/**
 * Registry of deep-sky catalogues exposed via /catalogues.
 *
 * Each catalogue maps to either a curated identifier list (resolved via
 * SIMBAD TAP) or a VizieR table queried with ADQL, both stored as versioned
 * snapshots in `src/data/catalogues/`. The viewer page reads from
 * this registry to render the landing index and each catalogue listing.
 */

export type CatalogueSource =
    | 'simbad-list'
    | 'vizier-ngc2000'
    | 'vizier-sharpless'
    | 'vizier-lbn'
    | 'vizier-barnard'
    | 'vizier-arp'
    | 'vizier-ugc'
    | 'vizier-vdb'
    | 'vizier-rcw'
    | 'vizier-hcg'
    | 'vizier-ldn'
    | 'vizier-ced'
    | 'vizier-ocl'
    | 'vizier-pn'
    | 'vizier-aco'
    | 'vizier-gc';

export interface CatalogueDef {
    slug: string;
    name: string;
    shortName: string;
    description: string;
    /** Year of original publication (or major revision). */
    epoch: string;
    /** Total expected entry count. */
    count: number;
    /** Decorative tagline shown on the index card. */
    tagline: string;
    /** Optional long-form description shown on the detail page (≈2× description). */
    longDescription?: string;
    source: CatalogueSource;
    /** Optional curated id list used when source = 'simbad-list'. */
    ids?: string[];
    /** Wikipedia page candidates for the catalogue's intro extract. Tried FR then EN. */
    wikiCandidates?: string[];
}

/** Messier numbers 1..110 in canonical SIMBAD form. */
const MESSIER_IDS = Array.from({ length: 110 }, (_, i) => `M ${i + 1}`);

/** Caldwell catalogue (Patrick Moore, 1995): 109 objects, ordered by declination. */
const CALDWELL_NGC: Array<[number, string]> = [
    [1, 'NGC 188'],
    [2, 'NGC 40'],
    [3, 'NGC 4236'],
    [4, 'NGC 7023'],
    [5, 'IC 342'],
    [6, 'NGC 6543'],
    [7, 'NGC 2403'],
    [8, 'NGC 559'],
    [9, 'Sh2-155'],
    [10, 'NGC 663'],
    [11, 'NGC 7635'],
    [12, 'NGC 6946'],
    [13, 'NGC 457'],
    [14, 'NGC 869'],
    [15, 'NGC 6826'],
    [16, 'NGC 7243'],
    [17, 'NGC 147'],
    [18, 'NGC 185'],
    [19, 'IC 5146'],
    [20, 'NGC 7000'],
    [21, 'NGC 4449'],
    [22, 'NGC 7662'],
    [23, 'NGC 891'],
    [24, 'NGC 1275'],
    [25, 'NGC 2419'],
    [26, 'NGC 4244'],
    [27, 'NGC 6888'],
    [28, 'NGC 752'],
    [29, 'NGC 5005'],
    [30, 'NGC 7331'],
    [31, 'IC 405'],
    [32, 'NGC 4631'],
    [33, 'NGC 6992'],
    [34, 'NGC 6960'],
    [35, 'NGC 4889'],
    [36, 'NGC 4559'],
    [37, 'NGC 6885'],
    [38, 'NGC 4565'],
    [39, 'NGC 2392'],
    [40, 'NGC 3626'],
    [41, 'Cl Melotte 25'],
    [42, 'NGC 7006'],
    [43, 'NGC 7814'],
    [44, 'NGC 7479'],
    [45, 'NGC 5248'],
    [46, 'NGC 2261'],
    [47, 'NGC 6934'],
    [48, 'NGC 2775'],
    [49, 'NGC 2237'],
    [50, 'NGC 2244'],
    [51, 'IC 1613'],
    [52, 'NGC 4697'],
    [53, 'NGC 3115'],
    [54, 'NGC 2506'],
    [55, 'NGC 7009'],
    [56, 'NGC 246'],
    [57, 'NGC 6822'],
    [58, 'NGC 2360'],
    [59, 'NGC 3242'],
    [60, 'NGC 4038'],
    [61, 'NGC 4039'],
    [62, 'NGC 247'],
    [63, 'NGC 7293'],
    [64, 'NGC 2362'],
    [65, 'NGC 253'],
    [66, 'NGC 5694'],
    [67, 'NGC 1097'],
    [68, 'NGC 6729'],
    [69, 'NGC 6302'],
    [70, 'NGC 300'],
    [71, 'NGC 2477'],
    [72, 'NGC 55'],
    [73, 'NGC 1851'],
    [74, 'NGC 3132'],
    [75, 'NGC 6124'],
    [76, 'NGC 6231'],
    [77, 'NGC 5128'],
    [78, 'NGC 6541'],
    [79, 'NGC 3201'],
    [80, 'NGC 5139'],
    [81, 'NGC 6352'],
    [82, 'NGC 6193'],
    [83, 'NGC 4945'],
    [84, 'NGC 5286'],
    [85, 'IC 2391'],
    [86, 'NGC 6397'],
    [87, 'NGC 1261'],
    [88, 'NGC 5823'],
    [89, 'NGC 6087'],
    [90, 'NGC 2867'],
    [91, 'NGC 3532'],
    [92, 'NGC 3372'],
    [93, 'NGC 6752'],
    [94, 'NGC 4755'],
    [95, 'NGC 6025'],
    [96, 'NGC 2516'],
    [97, 'NGC 3766'],
    [98, 'NGC 4609'],
    [99, 'NAME Coalsack'],
    [100, 'IC 2944'],
    [101, 'NGC 6744'],
    [102, 'IC 2602'],
    [103, 'NGC 2070'],
    [104, 'NGC 362'],
    [105, 'NGC 4833'],
    [106, 'NGC 104'],
    [107, 'NGC 6101'],
    [108, 'NGC 4372'],
    [109, 'NGC 3195'],
];

const CALDWELL_IDS = CALDWELL_NGC.map(([, id]) => id);

export const CATALOGUES: CatalogueDef[] = [
    {
        slug: 'messier',
        name: 'Catalogue Messier',
        shortName: 'Messier',
        description:
            'Le catalogue de Messier a été compilé par le chasseur de comètes Charles Messier entre 1771 et 1781 pour distinguer les objets diffus des comètes',
        longDescription:
            "Le Catalogue des nébuleuses et des amas d'étoiles, plus connu comme le catalogue de Messier, est un catalogue astronomique d'objets d'aspect diffus créé en 1774 par Charles Messier afin d'aider les chercheurs de comètes à ne pas confondre celles-ci avec divers objets diffus dont la nature était alors inconnue (galaxies, divers types de nébuleuses et amas d'étoiles) mais fixes par rapport aux étoiles. Charles Messier avait en effet lui-même été victime d'une telle méprise, assimilant par erreur la nébuleuse du Crabe à la comète de Halley, dont il attendait le retour dans cette région du ciel (la constellation du Taureau). C'est d'ailleurs pour cette raison que la Nébuleuse du Crabe est le premier objet du catalogue Messier (M1).",
        epoch: '1781',
        count: 110,
        tagline: '110 trésors du ciel boréal',
        source: 'simbad-list',
        ids: MESSIER_IDS,
        wikiCandidates: ['Catalogue de Messier', 'Messier catalogue'],
    },
    {
        slug: 'caldwell',
        name: 'Catalogue Caldwell',
        shortName: 'Caldwell',
        description:
            'Le catalogue de Caldwell est un catalogue astronomique regroupant 109 amas stellaires, nébuleuses et galaxies, en complémenent du catalogue de Messier. ',
        longDescription:
            "Le catalogue de Caldwell est un catalogue astronomique regroupant 109 amas stellaires, nébuleuses et galaxies. Il est destiné à aider les astronomes amateurs dans leurs observations. La liste a été compilée par Patrick Moore Caldwell en 1995, pour compléter le catalogue de Messier, en y ajoutant notament des objets de l'hémisphère sud.",
        epoch: '1995',
        count: 109,
        tagline: '109 cibles au-delà de Messier',
        source: 'simbad-list',
        ids: CALDWELL_IDS,
        wikiCandidates: ['Catalogue de Caldwell', 'Caldwell catalogue'],
    },
    {
        slug: 'ngc',
        name: 'New General Catalogue',
        shortName: 'NGC',
        description:
            "Le NGC compilé par Dreyer en 1888, augmenté ici par la révision NGC 2000.0 contient plus de 7840 entrées et est la référence universelle de l'astronomie d'amateur.",
        longDescription:
            "Le New General Catalogue of Nebulae and Clusters of Stars ou NGC (en français « Nouveau catalogue général de nébuleuses et d'amas d'étoiles ») contient 7 840 objets du ciel profond (principalement des galaxies, mais aussi d'autres types) recensés par John Dreyer jusqu'en 1888, date de première parution du catalogue. Ce catalogue est une révision et un élargissement du General Catalogue de John Herschel, paru en 1864, auquel il apporte de nombreuses améliorations. Dreyer a classé les objets du NGC en fonction de leur ascension droite, ce qui permet de déduire le meilleur moment de l'année pour les observer. La ligne d'origine des numéros NGC est la ligne d'ascension droite 0 heure (passant près de la frontière entre les constellations de Pégase et d'Andromède). Ainsi, l'objet NGC 1 se situe à une ascension droite de 0 h et les numéros des objets NGC vont dans l'ordre croissant vers les ascensions droites croissantes, c'est-à-dire vers l'est.  Néanmoins, ce catalogue contenait encore de nombreux doublons et imprécisions et a donc été remplacé par le RNGC (Revised New General Catalogue), dressé par Sulentic et Tifft (1973).",
        epoch: '1888 / 2000',
        count: 7840,
        tagline: '7 840 objets, la référence',
        source: 'vizier-ngc2000',
        wikiCandidates: ['New General Catalogue'],
    },
    {
        slug: 'ic',
        name: 'Index Catalogue',
        shortName: 'IC',
        description:
            'Suppléments au NGC publiés par Dreyer en 1895 (IC I) et 1908 (IC II), réunis dans NGC 2000.0. 5386 objets supplémentaires, souvent plus faibles que les NGC mais riches en raretés.',
        longDescription:
            "L'Index Catalogue, dressé en deux volets par Dreyer (IC I, 1895 ; IC II, 1908), prolonge le NGC en intégrant les objets découverts grâce à la photographie astronomique naissante : Edward Pickering à Harvard, Max Wolf à Heidelberg, Isaac Roberts. Ces 5 386 entrées sont en moyenne plus faibles que les NGC mais regorgent de pièces rares : la Nébuleuse de Californie (IC 405), la Tête de Cheval (IC 434), le Cocon (IC 5146), les nébuleuses du Cœur (IC 1805) et de l'Âme (IC 1848), la Galaxie Cachée (IC 342). C'est le catalogue qui consacra le passage de l'astronomie visuelle à l'astronomie photographique : on n'y trouve plus seulement ce que l'œil distingue, mais ce que la plaque accumule en pose longue.",
        epoch: '1895–1908',
        count: 5386,
        tagline: '5 386 compléments du NGC',
        source: 'vizier-ngc2000',
        wikiCandidates: ['Index Catalogue', 'Index Catalogue of Nebulae and Clusters of Stars'],
    },
    {
        slug: 'sharpless',
        name: 'Catalogue Sharpless 2',
        shortName: 'Sh2',
        description:
            'Publié par Stewart Sharpless en 1959, ce catalogue recense 313 régions HII galactiques : nébuleuses à émission rougeoyantes, dont les plus iconiques traversent la Voie lactée nord et sud.',
        longDescription:
            "Stewart Sharpless, alors à l'observatoire naval de Flagstaff, publia en 1959 la seconde version (Sh2) de son recensement systématique des régions HII de la Voie lactée : vastes nuages d'hydrogène ionisé par les étoiles O et B, brillant en Hα à 656 nm. Établi à partir des plaques POSS-I exposées en émission rouge, le catalogue couvre les latitudes galactiques |b| < 12° et délivre 313 entrées, depuis le voile diffus de la Tête de Cheval (Sh2-277) jusqu'aux structures massives comme la Nébuleuse de la Grotte (Sh2-155), la Nébuleuse en Éventail (Sh2-106) ou la Tête de Méduse (IC 443 / Sh2-248). C'est la référence universelle pour identifier les complexes HII galactiques en imagerie à bande étroite, notamment sur les filtres Hα et SII.",
        epoch: '1959',
        count: 313,
        tagline: '313 régions H II',
        source: 'vizier-sharpless',
        wikiCandidates: ['Catalogue Sharpless', 'Sharpless catalog'],
    },
    {
        slug: 'lbn',
        name: 'Lynds Bright Nebulae',
        shortName: 'LBN',
        description:
            "Beverly Lynds a catalogué en 1965 1125 nébuleuses brillantes (émission et réflexion) à partir des plaques POSS-I. Beaucoup d'entrées sont sub-arcminute mais offrent des cibles peu photographiées.",
        longDescription:
            "Beverly Turner Lynds, astronome au Lick Observatory puis au NOAO, dressa en 1965 ce relevé exhaustif des nébuleuses brillantes du ciel boréal à partir des plaques rouges et bleues du Palomar Observatory Sky Survey (POSS-I). Les 1 125 entrées sont classées selon leur couleur dominante (rouge pour l'émission Hα, bleue pour la réflexion sur poussière), leur luminosité de surface (1 = la plus brillante, 6 = à peine perceptible) et leur taille apparente. Souvent sous-arcminute et noyées dans des champs stellaires denses, les LBN sont les pépites confidentielles du ciel profond : voiles HII oubliés des grands catalogues, nébulosités de réflexion en lisière de nuages moléculaires, fragments de complexes plus vastes. Complément essentiel du Sharpless 2 pour qui veut sortir des cibles classiques.",
        epoch: '1965',
        count: 1125,
        tagline: '1 125 nébuleuses brillantes',
        source: 'vizier-lbn',
        wikiCandidates: ["Lynds' Catalogue of Bright Nebulae", 'Lynds Catalogue of Bright Nebulae'],
    },
    {
        slug: 'barnard',
        name: 'Catalogue Barnard',
        shortName: 'Barnard',
        description:
            'Edward Emerson Barnard a recensé en 1927 les nébuleuses obscures les plus marquantes de la Voie lactée. 369 entrées de poussières absorbantes, silhouettes noires sur fond stellaire.',
        longDescription:
            "Edward Emerson Barnard, célèbre observateur du Yerkes Observatory et grand pionnier de l'astrophotographie grand-champ, photographia inlassablement la Voie lactée à partir de 1895 avec ses télescopes Bruce. À sa mort en 1923, il laissait des milliers de plaques montrant que ce qu'on prenait pour des « trous dans le ciel » étaient en réalité des nuages de poussière froide masquant les étoiles d'arrière-plan. Mary Calvert et Edwin Frost compilèrent ses notes en 1927 dans l'« Atlas of Selected Regions of the Milky Way ». Les 369 entrées numérotées du catalogue Barnard incluent des cibles iconiques de l'astrophoto : la Tête de Cheval (B 33) découpée sur IC 434, la Pipe (B 59-67-78), le Snake (B 72), ou encore B 142-143 (la « E » de Barnard dans Aquila). Première démonstration que la Voie lactée n'est pas vide entre les étoiles : elle est emplie de poussières.",
        epoch: '1927',
        count: 369,
        tagline: '369 silhouettes obscures',
        source: 'vizier-barnard',
        wikiCandidates: ['Catalogue de Barnard', 'Barnard catalogue', 'Barnard Catalogue of Dark Markings in the Sky'],
    },
    {
        slug: 'arp',
        name: 'Atlas of Peculiar Galaxies',
        shortName: 'Arp',
        description:
            "Halton Arp publia en 1966 un atlas de 338 galaxies aux morphologies bizarres : interactions, anneaux, jets, queues de marée. Cible classique de l'astrophoto deep-sky de pointe.",
        longDescription:
            "Halton « Chip » Arp, astronome au Mount Wilson et controversé pour ses positions critiques sur le décalage spectral cosmologique, publia en 1966 cet « Atlas of Peculiar Galaxies » à partir de plaques exposées au télescope Hale de 5 m du Palomar. Les 338 galaxies sont rangées par catégorie morphologique : spirales à compagnons, galaxies à jets, anneaux, queues de marée, doubles distordues, systèmes en collision. Plusieurs sont devenues des icônes : Arp 244 (les Antennes), Arp 188 (Galaxie Têtard), Arp 273 (la Rose de UGC 1810), Arp 87, Arp 220 (la galaxie ultralumineuse infrarouge la plus proche). À l'origine compilé pour étayer la thèse, depuis invalidée, d'objets liés physiquement malgré des décalages spectraux différents, l'atlas est aujourd'hui une mine pour l'observation des interactions galactiques et la cible favorite des astrophotographes équipés de télescopes >250 mm.",
        epoch: '1966',
        count: 338,
        tagline: '338 galaxies particulières',
        source: 'vizier-arp',
        wikiCandidates: ['Atlas des galaxies particulières', 'Atlas of Peculiar Galaxies'],
    },
    {
        slug: 'ugc',
        name: 'Uppsala General Catalogue',
        shortName: 'UGC',
        description:
            "Compilé par Peter Nilson en 1973 à partir des plaques POSS-I, l'UGC recense ~12 900 galaxies de l'hémisphère nord (δ ≥ -2°30') plus brillantes que m_pg = 14.5 et/ou plus grandes que 1′.",
        longDescription:
            "Peter Nilson, à l'observatoire d'Uppsala, examina visuellement chaque plaque POSS-I rouge (E) et bleue (O) couvrant le ciel boréal et catalogua ainsi 12 921 galaxies, celles plus brillantes que la magnitude photographique 14,5 ou plus grandes que une minute d'arc. Pour chacune il consigna position, taille apparente, classe morphologique de Hubble dans le système de Sandage et notes descriptives. L'UGC, publié comme volume 6 des Acta Universitatis Upsaliensis, devint l'inventaire de référence pour la galaxie boréale modérément brillante : c'est là que la plupart des spirales et elliptiques anonymes des champs Sloan, MILES ou Hyperleda ont été identifiées pour la première fois. Aujourd'hui chaque cross-match avec NED ou SIMBAD passe par les numéros UGC, et l'iconique Galaxie de l'Aiguille (UGC 7773 / NGC 4565) ou la spirale parfaite UGC 12158 doivent leur visibilité à ce travail patient au stéréo-comparateur.",
        epoch: '1973',
        count: 12921,
        tagline: '12 921 galaxies du nord',
        source: 'vizier-ugc',
        wikiCandidates: ['Uppsala General Catalogue'],
    },
    {
        slug: 'vdb',
        name: 'Catalogue van den Bergh',
        shortName: 'vdB',
        description:
            'Sidney van den Bergh a dressé en 1966 la liste des 158 nébuleuses à réflexion brillantes des plaques POSS : étoiles bleues éclairant des nuages de poussière interstellaire.',
        longDescription:
            "Sidney van den Bergh, astronome canadien d'origine néerlandaise, conduisit en 1966 le premier recensement systématique des nébuleuses à réflexion à partir des plaques POSS-I. Ces nuages de poussière interstellaire ne brillent pas par eux-mêmes : ils diffusent la lumière bleue d'une étoile chaude à proximité, ce qui leur donne leur teinte typique en image couleur. Les 158 entrées (Lhippie, vdB 1 à 158) incluent la Nébuleuse de l'Iris (vdB 139), la nébuleuse de l'Étoile Flamboyante (vdB 27), les voiles autour des Pléiades (vdB 20-23), ainsi qu'une foule d'objets très peu connus mais photogéniques. Pour chaque entrée, van den Bergh donne les coordonnées de l'étoile illuminatrice, son type spectral, sa magnitude V et la dimension du halo poussiéreux. Une mine d'or pour les astrophotographes en quête de cibles bleues sortant des sentiers battus.",
        epoch: '1966',
        count: 158,
        tagline: '158 nébuleuses à réflexion',
        source: 'vizier-vdb',
        wikiCandidates: ['Catalogue van den Bergh', 'Van den Bergh catalogue'],
    },
    {
        slug: 'rcw',
        name: 'Catalogue RCW',
        shortName: 'RCW',
        description:
            'Rodgers, Campbell & Whiteoak ont publié en 1960 ce relevé Hα des régions H II australes, équivalent sud du Sharpless 2 boréal. 182 nébuleuses en émission, dont la Carène et Eta Carinae.',
        longDescription:
            "Le catalogue RCW, dû à Alex Rodgers, Colin Campbell et John Whiteoak (Mt Stromlo, 1960), couvre la portion australe de la Voie lactée avec 182 régions HII détectées sur les plaques rouges du Mt Stromlo Schmidt-camera survey. C'est l'analogue méridional du Sharpless 2 boréal, indispensable pour quiconque pointe vers le sud, la Voie lactée australe étant infiniment plus riche en nébuleuses brillantes que la nordique. Le catalogue contient des cibles iconiques : la Grande Nébuleuse de la Carène (RCW 53) avec Eta Carinae, la nébuleuse de la Tarentule (RCW 88) dans le Grand Nuage de Magellan, la nébuleuse Crayon (Pencil Nebula, RCW 37), ou encore la nébuleuse Méduse (RCW 7). Classés par luminosité (1 = très brillante à 4 = à peine visible), les RCW sont les cibles incontournables des télescopes installés au Chili, en Namibie ou en Australie.",
        epoch: '1960',
        count: 182,
        tagline: '182 régions H II australes',
        source: 'vizier-rcw',
        wikiCandidates: ['Catalogue RCW', 'RCW Catalogue'],
    },
    {
        slug: 'hcg',
        name: 'Hickson Compact Groups',
        shortName: 'HCG',
        description:
            'Paul Hickson identifia en 1982 cent groupes compacts de 4 à 7 galaxies en interaction étroite, dont le Quintette de Stephan (HCG 92) et le Quartette de Copeland (HCG 57).',
        longDescription:
            "Paul Hickson, astronome à l'University of British Columbia, dressa en 1982 cette liste de 100 groupes compacts de galaxies à partir d'un examen visuel systématique des plaques POSS. Le critère de sélection est strict : un groupe doit contenir au moins 4 membres dans une bande de 3 magnitudes, isolés (aucune galaxie de luminosité comparable à proximité) et compacts (densité galactique très élevée). Ces conditions privilégient les systèmes en interaction gravitationnelle forte : laboratoires naturels pour étudier la dynamique des collisions de galaxies, le déclenchement des sursauts de formation stellaire, et la fusion ultime en galaxies elliptiques géantes. Le HCG 92, alias Quintette de Stephan, reste l'archétype et l'une des cibles les plus photographiées du ciel profond ; HCG 44 (Triplet du Lion partiel + NGC 3187) et HCG 57 (Chaîne de Copeland) sont d'autres cibles de choix pour les télescopes de 200 mm et plus.",
        epoch: '1982',
        count: 100,
        tagline: '100 groupes compacts de galaxies',
        source: 'vizier-hcg',
        wikiCandidates: ['Groupe compact de Hickson', 'Hickson Compact Group'],
    },
    {
        slug: 'ldn',
        name: 'Lynds Dark Nebulae',
        shortName: 'LDN',
        description:
            "Beverly Lynds publia en 1962 le premier recensement systématique des nébuleuses obscures à partir des plaques POSS-I. 1791 entrées, complément naturel du LBN brillant. Classes d'opacité de 1 (faible) à 6 (totale).",
        longDescription:
            "Beverly Lynds publia en 1962, à Lick, ce premier recensement vraiment exhaustif des nébuleuses obscures du ciel boréal, trois ans avant son catalogue de nébuleuses brillantes. À partir d'un examen méticuleux des plaques POSS-I rouge et bleue, elle releva 1 791 nuages de poussière absorbant la lumière des étoiles d'arrière-plan, en attribuant à chacun une classe d'opacité de 1 (à peine perceptible, transparence partielle) à 6 (totalement opaque, aucune étoile derrière). Ces nuages froids (10-20 K) sont les pouponnières d'étoiles de la galaxie : c'est dans le LDN 1622, le LDN 134 ou le complexe Taurus-Auriga (LDN 1495 et autres) que se forment aujourd'hui les futures générations stellaires. Pour l'astrophotographie deep-sky le catalogue est indispensable : impossible de cadrer une mosaïque dans Cygnus, Taurus, Ophiuchus ou Sagittarius sans tomber sur des LDN.",
        epoch: '1962',
        count: 1791,
        tagline: '1 791 nuages absorbants',
        source: 'vizier-ldn',
        wikiCandidates: ["Lynds' Catalogue of Dark Nebulae", 'Lynds Catalogue of Dark Nebulae'],
    },
    {
        slug: 'ced',
        name: 'Catalogue Cederblad',
        shortName: 'Ced',
        description:
            'Sven Cederblad recensa en 1946 les nébuleuses diffuses brillantes de la Voie lactée : 215 objets numérotés, parfois subdivisés en composantes (Ced 51a, b, c). Beaucoup recoupent NGC, Sharpless ou vdB.',
        longDescription:
            "Sven Cederblad, astronome de l'université d'Uppsala, dressa en 1946 ce « Catalogue of bright diffuse Galactic nebulae » à partir de toute la littérature pré-photographique et photographique disponible : Herschel, Curtis, Pickering, Hubble, Wolf, et les premiers relevés de Mt Wilson. Les 215 entrées numérotées (parfois subdivisées en composantes a, b, c quand l'objet est multiple) couvrent à la fois les nébuleuses à émission et à réflexion, à toutes latitudes galactiques. Beaucoup de Ced sont aussi classées NGC, IC, Sharpless ou vdB, ce qui en fait un excellent référentiel de cross-identification. Avant Sharpless 2 (1959) et van den Bergh (1966), c'était le catalogue de référence pour qui voulait connaître l'ensemble des nébuleuses diffuses du ciel. Il garde aujourd'hui un intérêt historique et bibliographique fort.",
        epoch: '1946',
        count: 330,
        tagline: '215 nébuleuses diffuses brillantes',
        source: 'vizier-ced',
        wikiCandidates: ['Catalogue Cederblad', 'Cederblad catalogue'],
    },
    {
        slug: 'ocl',
        name: 'Amas ouverts (WEBDA)',
        shortName: 'Open Clusters',
        description:
            'Compilation moderne de 2167 amas ouverts de la Voie lactée à partir de WEBDA et Dias et al. 2002. Inclut les désignations Collinder, Trumpler, Melotte, Stock, Berkeley, Ruprecht, etc. La référence pour les amas galactiques.',
        longDescription:
            "WEBDA, base de données collaborative initiée par Jean-Claude Mermilliod (Observatoire de Lausanne) puis maintenue par Ernst Paunzen à Vienne, agrège depuis les années 1980 toutes les mesures photométriques, spectroscopiques et astrométriques publiées sur les amas ouverts galactiques. Cette compilation « OCl » utilisée ici unifie WEBDA et le catalogue Dias et al. 2002, soit 2 167 amas physiques connus dans la Voie lactée. Elle réconcilie sous un identifiant unique les multiples désignations historiques : Collinder, Trumpler, Melotte, Stock, King, Berkeley, Ruprecht, Dolidze, ASCC… Pour chaque amas on dispose de coordonnées précises, taille apparente, distance, âge, métallicité et liste des membres confirmés par mouvement propre Gaia. C'est le catalogue de référence pour étudier la formation stellaire récente, la rotation différentielle galactique et la dynamique des bras spiraux.",
        epoch: '2002+',
        count: 2167,
        tagline: '2 167 amas ouverts galactiques',
        source: 'vizier-ocl',
        wikiCandidates: ['Amas ouvert', 'Open cluster'],
    },
    {
        slug: 'pn',
        name: 'Catalogue Strasbourg-ESO des nébuleuses planétaires',
        shortName: 'PN',
        description:
            'Compilé par Acker et al. en 1992, ce catalogue répertorie 1143 nébuleuses planétaires galactiques avec position, identifications croisées (PK, IRAS, Abell, Minkowski, Sh2, Henize…) et notes du découvreur.',
        longDescription:
            "Le « Strasbourg-ESO Catalogue of Galactic Planetary Nebulae », compilé par Agnès Acker, François Ochsenbein, Bénédicte Stenholm et leurs collègues à Strasbourg en 1992, fut publié comme l'inventaire de référence de toutes les nébuleuses planétaires connues de la Voie lactée. Les 1 143 entrées rassemblent les découvertes Perek-Kohoutek (PK 1967), Minkowski, Henize, Abell, IRAS et bien d'autres, avec position J2000 précise, dimensions, magnitude visuelle et toutes les identifications croisées (PNG, PK, NGC, IC, Sh2…). Une nébuleuse planétaire représente la fin de vie d'une étoile de masse intermédiaire (1-8 M☉) : la coquille de gaz éjectée pendant la phase post-AGB, ionisée par la naine blanche centrale, brille typiquement quelques milliers d'années avant de se diluer. Le catalogue couvre toutes les morphologies (sphériques, bipolaires, elliptiques, multipolaires) et inclut les pièces majeures : Hélix (NGC 7293), Anneau de la Lyre (M 57), Œil de Chat (NGC 6543), Esquimau (NGC 2392), Saturne (NGC 7009).",
        epoch: '1992',
        count: 1143,
        tagline: '1 143 nébuleuses planétaires',
        source: 'vizier-pn',
        wikiCandidates: [
            'Nébuleuse planétaire',
            'Planetary nebula',
            'Strasbourg-ESO Catalogue of Galactic Planetary Nebulae',
        ],
    },
    {
        slug: 'aco',
        name: 'Abell, Corwin & Olowin',
        shortName: 'Abell',
        description:
            'Catalogue ACO complet (1989) des amas riches de galaxies, extension hémisphère sud du Abell 1958. 2712 entrées, dont les amas de Coma (Abell 1656), Hercules (Abell 2151), Persée (Abell 426)…',
        longDescription:
            "George O. Abell publia en 1958 sa thèse de doctorat « The Distribution of Rich Clusters of Galaxies », recensement de 2 712 amas de galaxies repérés sur les plaques POSS-I, sélectionnés par richesse (au moins 50 membres dans une bande de 2 magnitudes autour de la troisième galaxie la plus brillante) et compacité (rayon angulaire défini). Sa version étendue ACO (Abell, Corwin & Olowin 1989) ajoute le ciel austral à partir des plaques UK Schmidt, pour un total de 4 073 amas, dont 2 712 strictement « rich ». Le catalogue est devenu la base universelle pour étudier la structure à grande échelle de l'Univers : amas de Coma (Abell 1656), du Lion (Abell 1367), d'Hercule (Abell 2151), de Persée (Abell 426), de Hydra (Abell 1060). Chaque entrée porte une distance estimée par le redshift moyen et une classe de richesse. Le superamas de la Vierge, le mur de Coma, le Grand Attracteur : tous se lisent à travers le catalogue Abell.",
        epoch: '1989',
        count: 2712,
        tagline: '2 712 amas riches de galaxies',
        source: 'vizier-aco',
        wikiCandidates: ['Catalogue Abell', 'Abell catalogue', 'Abell catalog of rich clusters of galaxies'],
    },
    {
        slug: 'gc',
        name: 'Amas globulaires (Webbink)',
        shortName: 'Globulars',
        description:
            'Catalogue Webbink 1985 des amas globulaires de la Voie lactée : 154 entrées de NGC à Pal et Terzan, avec magnitude intégrée. Référence pour les vieux systèmes stellaires sphéroïdaux du halo galactique.',
        longDescription:
            "Ronald Webbink, à l'University of Illinois, compila en 1985 cette liste exhaustive des 154 amas globulaires connus de la Voie lactée, version mise à jour des compilations antérieures de Shapley (1930) et Arp (1965). Chaque entrée donne la position J2000, la magnitude intégrée V₀, la distance héliocentrique et galactocentrique, la métallicité [Fe/H] et la classe de concentration. Les amas globulaires sont les plus vieux systèmes stellaires de notre galaxie (10-13 milliards d'années) : sphéroïdes denses de 10⁴ à 10⁶ étoiles, ils peuplent le halo de la Voie lactée et ses voisinages. Le catalogue inclut les amas brillants (Oméga Centauri, M 13, M 22, 47 Tucanae) mais aussi les obscurs Palomar (Pal 1-15) découverts sur les plaques POSS, ou les Terzan plongés dans les régions galactiques poussiéreuses du Sagittaire. L'arrivée de Gaia DR3 a depuis révélé que plusieurs amas Webbink sont en réalité des restes de galaxies naines accrétées par la Voie lactée.",
        epoch: '1985',
        count: 154,
        tagline: '154 amas globulaires galactiques',
        source: 'vizier-gc',
        wikiCandidates: ['Amas globulaire', 'Globular cluster'],
    },
];

export function getCatalogue(slug: string): CatalogueDef | undefined {
    return CATALOGUES.find((c) => c.slug === slug);
}
