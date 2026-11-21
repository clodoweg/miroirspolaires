# Composants tiers

Ce dépôt embarque des fichiers de tiers, servis tels quels au navigateur. Ils restent sous leur propre licence, indépendamment de la licence MIT du code ([`LICENSE`](LICENSE)) et des droits réservés sur le contenu ([`LICENSE-CONTENT.md`](LICENSE-CONTENT.md)). Les dépendances npm ne sont pas listées ici : leur licence est dans `node_modules/<paquet>/` et dans `package-lock.json`.

## Stellarium Web Engine

- Fichiers : `public/js/stellarium-web-engine.js`, `public/js/stellarium-web-engine.wasm`
- Licence : GNU Affero General Public License v3.0 (AGPL-3.0)
- Source : https://github.com/Stellarium/stellarium-web-engine
- Compilé sans modification du code source par `scripts/stellarium/build.sh` (conteneur Emscripten). Le moteur est un programme distinct, chargé par la carte du ciel : la licence MIT du reste du dépôt ne s'y applique pas.

## Données du ciel de Stellarium

- Fichiers : `public/data/**` (étoiles, objets du ciel profond, cultures célestes, paysages, textures, shaders)
- Source : données distribuées avec Stellarium Web Engine, chacune sous sa licence d'origine. Par exemple, la culture céleste occidentale est sous CC BY-SA (textes et données) et Licence Art Libre (illustrations), voir `public/data/skycultures/*/description.md`.
- Modification : noms français des constellations réappliqués par `scripts/stellarium/french-names.cjs`.
- `public/data/mpcorb.dat` provient du Minor Planet Center ; `public/data/tle_satellite.jsonl.gz` des éléments orbitaux publics de satellites.

## Aladin Lite

- Fichiers : `public/libs/aladin-lite/3.8.2/`
- Licence : GNU Lesser General Public License v3.0 (LGPL-3.0), texte dans `public/libs/aladin-lite/3.8.2/LICENSE`
- Source : https://github.com/cds-astro/aladin-lite (CDS, Strasbourg)

## Pannellum

- Fichiers : `public/libs/pannellum/` (version 2.5.6)
- Licence : MIT, Copyright (c) 2012-2019 Matthew Petroff
- Source : https://github.com/mpetroff/pannellum

## Polices

Toutes sous SIL Open Font License 1.1 (https://openfontlicense.org) :

- Inter, Copyright (c) 2016 The Inter Project Authors — `public/fonts/inter/`
- JetBrains Mono, Copyright (c) 2020 The JetBrains Mono Project Authors — `public/fonts/jetbrains-mono/`
- Playfair Display, Copyright (c) 2017 The Playfair Display Project Authors — `public/fonts/playfair-display/`

## Données astronomiques et encyclopédiques

- `src/data/catalogues/*.json` : instantanés de catalogues obtenus auprès du CDS (SIMBAD, VizieR). Les données restent la propriété de leurs auteurs ; citer le CDS et les catalogues d'origine en cas de réutilisation.
- `src/data/wikipedia.json` : descriptions tirées de Wikipédia en français, sous licence CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
- `src/data/astro_details.json` : caractéristiques des objets tirées de Wikipédia en français (CC BY-SA 4.0) et de SIMBAD ; la page d'origine de chaque entrée est dans son champ `source_url`.
