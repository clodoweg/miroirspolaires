/**
 * Module d'initialisation des photosphères interactives 360° (effet immersif Facebook 360).
 *
 * POURQUOI : Transforme automatiquement toutes les images 360° insérées dans les articles
 * en un visualiseur sphérique WebGL interactif et fluide, avec rotation à la souris / au doigt,
 * boussole, plein écran et rotation douce continue.
 *
 * OPTIONS & EXEMPLES :
 * - Détecte les balises Markdown : `![360:Légende](url)` ou images contenant l'ancre `#360`.
 * - Résout automatiquement les URLs en local et en production pour éviter tout blocage CORS WebGL.
 */

let pannellumLoadingPromise: Promise<any> | null = null;

/**
 * Charge dynamiquement le script et la feuille de style Pannellum si ce n'est pas déjà fait.
 */
function loadPannellumLibrary(): Promise<any> {
    if (pannellumLoadingPromise) return pannellumLoadingPromise;

    pannellumLoadingPromise = new Promise((resolve, reject) => {
        if ((window as any).pannellum) {
            resolve((window as any).pannellum);
            return;
        }

        // 1. Feuille de style CSS
        if (!document.querySelector('link[href*="pannellum.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/libs/pannellum/pannellum.css';
            document.head.appendChild(link);
        }

        // 2. Script JavaScript
        const script = document.createElement('script');
        script.src = '/libs/pannellum/pannellum.js';
        script.async = true;
        script.onload = () => resolve((window as any).pannellum);
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });

    return pannellumLoadingPromise;
}

/**
 * Résout l'URL de l'image équirectangulaire pour garantir un accès WebGL sans restriction CORS.
 *
 * Utilise l'endpoint same-origin `/api/r2-image/...` :
 * - Aucune restriction cross-origin (CORS) quel que soit le navigateur mobile ou desktop.
 * - En local : sert instantanément depuis le disque dur.
 * - En production : relaie le flux de Cloudflare R2 avec un cache long (même origine, donc sans CORS).
 * - Seuls les fichiers `blog|voyages/<année>/<slug>/<nom>` aux noms simples (lettres, chiffres, `_`, `.`, `-`)
 *   sont servis : un nom avec espace ou accent renverrait 404.
 */
function resolveEquirectangularUrl(rawSrc: string): string {
    const clean = rawSrc.replace(/#360$/, '');

    // Extraction du chemin blog ou voyages : (assets/)?(blog|voyages)/YYYY/slug/file.jpg
    const match = clean.match(/(?:assets\/)?(blog|voyages)\/(\d{4})\/([^/]+)\/([^/?#]+)/);
    if (match) {
        const [, section, year, slug, file] = match;
        return `/api/r2-image/${section}/${year}/${slug}/${file}`;
    }

    return clean;
}

/**
 * Initialise un lecteur sphérique interactif Facebook-style dans un conteneur donné.
 */
async function mountSphereViewer(targetElement: HTMLElement, imageSrc: string, captionText?: string) {
    try {
        const pannellum = await loadPannellumLibrary();

        // Structure HTML soignée avec contrôles glassmorphism
        const wrapper = document.createElement('div');
        wrapper.className = 'photo-sphere-wrapper not-prose relative my-10 w-full max-w-5xl mx-auto select-none';

        const card = document.createElement('div');
        card.className =
            'photo-sphere-card relative h-[420px] sm:h-[500px] md:h-[580px] w-full overflow-hidden rounded-2xl border border-mp-glass-border bg-[#0d0f14] shadow-2xl cursor-grab active:cursor-grabbing';

        const viewport = document.createElement('div');
        viewport.className = 'photo-sphere-viewport absolute inset-0 h-full w-full';

        // Barre supérieure avec badge 360° et boutons de contrôle
        const topBar = document.createElement('div');
        topBar.className = 'pointer-events-none absolute top-4 left-4 right-4 z-20 flex items-center justify-between';
        topBar.innerHTML = `
            <div class="flex items-center gap-2 rounded-full border border-mp-accent/40 bg-black/75 px-3.5 py-1.5 backdrop-blur-md shadow-lg">
                <span class="relative flex h-2 w-2">
                    <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-mp-accent opacity-75"></span>
                    <span class="relative inline-flex h-2 w-2 rounded-full bg-mp-accent"></span>
                </span>
                <span class="font-sans text-xs font-semibold tracking-wide text-mp-accent flex items-center gap-1.5">
                    <span>🌐</span> Photo 360° interactive
                </span>
            </div>
            <div class="pointer-events-auto flex items-center gap-2">
                <button type="button" class="sphere-rotate-toggle flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 text-xs font-medium text-white backdrop-blur-md transition hover:border-mp-accent hover:text-mp-accent cursor-pointer shadow-lg" title="Activer / Suspendre la rotation automatique">
                    <span class="text-sm">🔄</span>
                    <span class="hidden sm:inline">Rotation auto</span>
                </button>
                <button type="button" class="sphere-fullscreen-btn flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/70 text-sm text-white backdrop-blur-md transition hover:border-mp-accent hover:text-mp-accent cursor-pointer shadow-lg" title="Plein écran">
                    ⛶
                </button>
            </div>
        `;

        card.appendChild(viewport);
        card.appendChild(topBar);
        wrapper.appendChild(card);

        // POURQUOI : Affiche le titre/légende de la photo avec le même style que toutes les autres photos du site
        if (captionText) {
            const figCaption = document.createElement('figcaption');
            figCaption.className = 'mt-2 text-center text-sm italic text-mp-text-muted';
            figCaption.textContent = captionText;
            wrapper.appendChild(figCaption);
        }

        // Remplacement du nœud d'origine dans le DOM
        targetElement.replaceWith(wrapper);

        // Initialisation de Pannellum
        let isAutoRotating = true;
        const viewer = pannellum.viewer(viewport, {
            type: 'equirectangular',
            panorama: resolveEquirectangularUrl(imageSrc),
            autoLoad: true,
            autoRotate: -1.8,
            autoRotateInactivityDelay: 2500,
            compass: false,
            showZoomCtrl: false,
            showFullscreenCtrl: false,
            mouseZoom: false, // Empêche de bloquer le défilement de la page lors du scroll à la molette
            keyboardZoom: false,
            hfov: 100,
            minHfov: 45,
            maxHfov: 120,
            friction: 0.15,
            touchPanSpeedCoeffFactor: 1.2,
        });

        // Bouton de bascule de la rotation automatique
        const rotateBtn = topBar.querySelector('.sphere-rotate-toggle');
        rotateBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isAutoRotating) {
                viewer.stopAutoRotate();
                isAutoRotating = false;
                rotateBtn.classList.add('opacity-60');
            } else {
                viewer.startAutoRotate(-1.8);
                isAutoRotating = true;
                rotateBtn.classList.remove('opacity-60');
            }
        });

        // Bouton plein écran
        const fullscreenBtn = topBar.querySelector('.sphere-fullscreen-btn');
        fullscreenBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            viewer.toggleFullscreen();
        });
    } catch (err) {
        console.error("[photo-sphere] Erreur lors de l'initialisation :", err);
    }
}

/**
 * Analyse le document à la recherche de toutes les images 360° et les transforme en visualiseurs interactifs.
 */
export function initAllPhotoSpheres() {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('article img, .prose img'));

    images.forEach((img) => {
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || img.dataset.src || img.dataset.fullSrc || '';
        const is360 = alt.startsWith('360:') || src.includes('#360') || img.dataset.is360 === 'true';

        if (!is360) return;

        const bestSrc = img.dataset.fullSrc || src;

        // Cible de remplacement (le figure parent si présent, ou l'image/picture directement)
        const target = img.closest('figure') || img.closest('picture') || img;
        const existingFigcaption = target.querySelector('figcaption');
        const caption = (existingFigcaption?.textContent || alt.replace(/^360:\s*/, '')).trim();

        void mountSphereViewer(target as HTMLElement, bestSrc, caption);
    });
}
