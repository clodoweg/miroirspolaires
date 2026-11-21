---
paths:
  - "src/components/**/*.{astro,tsx}"
  - "src/pages/**/*.astro"
  - "src/layouts/**/*.astro"
  - "src/styles/**"
  - "src/lib/theme.ts"
  - "tailwind.config.mjs"
---

# Styles

Suivre `docs/style-guide.md` (liste complète des classes et valeurs). Règles impératives :

- Styler avec des classes Tailwind. Ne jamais coder une couleur, une durée ou une taille en dur si un token existe.
- Couleurs : uniquement les classes `mp-*` (`bg-mp-bg`, `bg-mp-bg-secondary`, `text-mp-text-heading`, `text-mp-text-body`, `text-mp-text-muted`, `text-mp-accent`, `border-mp-border`, `border-mp-border-accent`…). L'opacité s'écrit `bg-mp-accent/20`.
- Avant d'utiliser une classe `mp-*`, vérifier que le token existe dans `tailwind.config.mjs` : une classe inconnue ne génère aucun CSS, sans erreur.
- Une nouvelle couleur s'ajoute dans `src/styles/base.css`, dans les **deux** blocs (`:root` pour le thème clair par défaut, `html.dark` pour le sombre), puis se mappe dans `tailwind.config.mjs` par `'var(--color-mp-…)'` (Tailwind 4 gère seul l'opacité `/20` par `color-mix`). Si la couleur sert en JS (Recharts, styles inline), il faut aussi la recopier dans `themeTokens.light` (`src/styles/design-tokens.ts`), qui alimente `src/lib/theme.ts`. `themeTokens.dark` se met à jour par cohérence.
- Les autres tokens (espacements, typo, durées, ombres, gradients, z-index, breakpoints, `component`) s'ajoutent dans `tokens` de `design-tokens.ts`, puis s'exposent dans `tailwind.config.mjs`. `src/lib/theme.ts` les relaie au JS (Recharts) mais ne connaît que la palette claire.
- Penser aux deux thèmes : vérifier le rendu avec et sans la classe `dark` sur `<html>`.
- Centraliser : un motif répété dans plusieurs composants devient un composant (`src/components/UI/`) ou une classe `@layer components` dans `base.css`, jamais un copier-coller de longues listes de classes.
- Typographie : `h1`–`h3` sont déjà stylés globalement. Ailleurs, utiliser les paliers `text-{hero,h1,h2,h3,xs,micro}-{mobile,tablet,desktop}` avec `md:` et `lg:`, pas de tailles arbitraires. Il n'y a pas de `clamp()` et pas de classe `text-body-*`.
- Markdown : `prose prose-lg prose-slate` + `prose-headings:text-mp-text-heading prose-p:text-mp-text-body prose-strong:text-mp-text-heading`. Pas de `prose-invert`, qui casse le thème clair (seul l'aperçu de `VoyagesEditor.tsx` l'utilise encore).
- Cibles tactiles d'au moins 48 px (`min-h-touch`, `min-w-touch`), `h-touch-comfort` (56 px) pour les CTA et la navigation, `h-touch-icon` (44 px) pour les boutons icône, `.touch-feedback` pour le retour au tap.
- Encoche iOS : `safe-top`, `safe-bottom`, `safe-x`, `safe-y` sur les éléments fixés aux bords.
- Breakpoint de navigation : `nav:` (900 px) bascule entre le menu mobile et le menu horizontal (`nav:hidden` / `nav:flex`). Ne pas utiliser `md:` ou `lg:` pour ça.
- Interactions : `mouse:hover:` pour les effets de survol, `touch:active:` pour le tactile, `motion-safe:` pour les animations.
- Boutons : réutiliser `PrimaryButton.astro` (`variant` = `default | glow | secondary | filled | inverted`) ou `IconButton.tsx`.
- Liens externes : ne pas ajouter `target`/`rel`, `BaseLayout.astro` s'en charge.
- Styles inline (`style={{…}}`) : seulement pour des valeurs calculées à l'exécution.
- Tailwind 4 : `src/styles/base.css` est le point d'entrée (`@import 'tailwindcss' source(none)`, `@source`, `@config`, `@plugin`). Les variantes custom (`dark`, `hover`, `touch`, `mouse`) y sont des `@custom-variant`, les utilitaires custom des `@utility`, et un bloc « compatibilité » y garde les comportements v3 (bordure grise par défaut, `space-y`/`divide-y`, `--tw-leading`…) : ne pas le retirer sans revalider les captures.
- Les classes générées en JS par le plugin masonry doivent figurer dans le `@source inline(…)` de `src/styles/base.css` (ex-`safelist`).
- Un `<style>` de composant qui utilise `@apply` doit commencer par `@reference "…/styles/base.css";`.
- Les couleurs par défaut (`red-500`, `slate-700`…) et les interlignes de `text-xs`…`text-9xl` gardent les valeurs de Tailwind 3 (`src/styles/tailwind-v3-defaults.mjs`).
