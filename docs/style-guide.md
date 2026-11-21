# Style guide — Miroirs Polaires

Référence des classes Tailwind du design system. Les valeurs ci-dessous sont celles du code au moment de la rédaction ; en cas de divergence, `src/styles/base.css`, `src/styles/design-tokens.ts` et `tailwind.config.mjs` font foi.

## D'où viennent les styles

| Famille | Source réelle | Exposé par |
|---|---|---|
| Couleurs `mp-*` | variables CSS `--color-mp-*` dans `src/styles/base.css` (`:root` = clair, `html.dark` = sombre) | `tailwind.config.mjs` (`'var(--color-mp-…)'`, opacité `/20` par `color-mix`) |
| Espacements, typo, durées, easings, ombres, gradients, z-index, breakpoints, `component` | `tokens` dans `src/styles/design-tokens.ts` | `tailwind.config.mjs`, chargé par `@config` dans `base.css` |
| Valeurs JS (Recharts, styles inline) | `tokens` | `src/lib/theme.ts` (`theme`, `glassStyle`, `dividerStyle`, `toggleButtonStyle`, `withOpacity`) |

Points à connaître :

- `themeTokens.light/dark` dans `design-tokens.ts` **recopie** les valeurs de `base.css`. Tailwind ne le lit pas. `themeTokens.light` est relayé au JS (`tokens.colors` → `src/lib/theme.ts` → Recharts, styles inline), mais `themeTokens.dark` n'est lu nulle part.
- Changer une couleur exige donc de modifier `base.css` (les deux thèmes) **et** `themeTokens.light` si la couleur sert en JS. Mettre aussi à jour `themeTokens.dark` par cohérence.
- Les couleurs de `src/lib/theme.ts` ne suivent pas le mode sombre.
- Le thème par défaut est **clair**. `BaseLayout.astro` ajoute la classe `dark` sur `<html>` selon `localStorage.theme` ou `prefers-color-scheme` (`@custom-variant dark (&:is(.dark *))` dans `base.css`).
- Tailwind 4, configuration hybride : `src/styles/base.css` porte l'import, les sources (`@source`, dont `@source inline(…)` pour les classes masonry), les variantes (`@custom-variant`), les utilitaires (`@utility`) et un bloc de compatibilité v3 ; `tailwind.config.mjs` ne garde que le thème issu de `design-tokens.ts`. La palette par défaut (`red-500`…) et les interlignes de `text-xs`…`text-9xl` restent ceux de Tailwind 3 (`src/styles/tailwind-v3-defaults.mjs`).

## Couleurs

Toujours passer par les classes `mp-*` ; l'opacité Tailwind fonctionne (`bg-mp-accent/20`, `bg-mp-ui-black/90`).

| Classe | Clair (défaut) | Sombre | Usage |
|---|---|---|---|
| `bg-mp-bg` | `#F8F9FA` | `#141414` | Fond principal |
| `bg-mp-bg-secondary` | `#FFFFFF` | `#0A0A0A` | Fond secondaire |
| `bg-mp-ui-black` | `#FFFFFF` | `#050505` | Navbar, footer |
| `bg-mp-glass-bg` | `rgba(255,255,255,.85)` | `rgba(21,26,37,.8)` | Panneaux verre |
| `bg-mp-glass-solid`, `bg-mp-glass-hover`, `bg-mp-surface` | — | — | Variantes verre / surface |
| `text-mp-text-heading` | `#0F172A` | `#EBEBE6` | Titres |
| `text-mp-text-body` | `#334155` | `#D1D5DB` | Corps |
| `text-mp-text-muted` | `#64748B` | `#8A8A85` | Secondaire |
| `text-mp-text-primary`, `text-mp-text-secondary`, `text-mp-text-link`, `text-mp-text-link-hover` | — | — | Variantes texte |
| `text-mp-accent` / `bg-mp-accent` | `#9A6A15` | `#D4B483` | Or champagne : liens, CTA |
| `bg-mp-accent-light` | accent à 12 % | accent à 20 % | Badges |
| `border-mp-border`, `border-mp-border-hover`, `border-mp-border-light` | — | — | Bordures neutres |
| `border-mp-border-accent` | accent à 35 % | accent à 30 % | Bordures actives |
| `border-mp-accent-border` | accent à 30 % | accent à 30 % | Variante historique, valeur proche mais distincte |
| `text-mp-astro-red` | `#DC2626` | `#EF4444` | Alerte |
| `bg-mp-deep-space`, `bg-mp-ice-paper` | — | — | Fonds spéciaux |

`border-mp-accent` est l'accent **plein**, pas la bordure à 30 %.

Une classe `mp-*` inconnue (ex. `bg-mp-background-secondary`, `text-mp-accent-red`) ne génère aucun CSS et ne provoque aucune erreur : vérifier le nom dans `tailwind.config.mjs`.

## Typographie

| Police | Classe | Chargement |
|---|---|---|
| Inter | `font-sans` | `public/fonts/inter/` (400, 600) |
| Playfair Display | `font-serif` | `public/fonts/playfair-display/` (400, 700) |
| JetBrains Mono | `font-mono` | `public/fonts/jetbrains-mono/` (400, 700), sans preload |

Les polices sont déclarées dans `src/styles/fonts.css` ; Inter 400 et Playfair 400 sont préchargées dans `BaseLayout.astro`.

Tailles : paliers fixes en rem par breakpoint (pas de `clamp()`).

| Échelle | Classes | Mobile / tablette / desktop |
|---|---|---|
| Hero | `text-hero-mobile md:text-hero-tablet lg:text-hero-desktop` | 52 / 64 / 88 px |
| H1 | `text-h1-*` | 32 / 40 / 60 px |
| H2 | `text-h2-*` | 24 / 32 / 40 px |
| H3 | `text-h3-*` | 21,6 / 28 / 32 px |
| XS | `text-xs-*` | 12 px |
| Micro | `text-micro-*` | 10,4 px |

`h1`–`h3` reçoivent déjà ces échelles, `font-serif font-light` et `text-mp-text-heading` dans `base.css` : ne pas les répéter. Les tokens `body` et `small` existent dans `design-tokens.ts` mais ne sont **pas** exposés en classes.

### Contenu Markdown (prose)

Les pages publiques utilisent `prose-slate` + surcharges `mp`. Ne pas utiliser `prose-invert`, qui casserait le thème clair ; il ne subsiste que dans l'aperçu de `VoyagesEditor.tsx` (admin).

```html
<div class="prose prose-lg prose-slate prose-headings:text-mp-text-heading prose-strong:text-mp-text-heading prose-headings:font-serif prose-headings:font-normal prose-p:text-mp-text-body max-w-none">
```

Le composant `.prose-mp` (`base.css`, avec `dark:prose-invert`) existe mais n'est utilisé nulle part.

## Liens

- Dans `.prose` : couleur héritée, soulignement 1 px décalé de 4 px à 40 % d'opacité, accent au survol (`tailwind.config.mjs`, `typography.DEFAULT.css.a`).
- Ailleurs : `text-mp-accent no-underline` (`base.css`) ; au survol `text-mp-accent-hover`, qui est un accent à 8–10 % d'opacité (texte quasi transparent, à surveiller).
- Les liens externes reçoivent `target="_blank" rel="noopener noreferrer"` automatiquement (MutationObserver dans `BaseLayout.astro`) : ne pas les ajouter à la main.

## Composants et utilitaires

- Boutons : `src/components/UI/PrimaryButton.astro` (`variant="default | glow | secondary | filled | inverted"`), `src/components/UI/IconButton.tsx`.
- `base.css` : `.container-mp` (largeur max 1400 px + `px-4`), `.glass`, `.glass-hover`, `.touch-feedback` (scale 0,97 au tap, tactile uniquement), `.scrollbar-hide`, `.scrollbar-thin`, `.snap-x-mandatory`, `.text-balance`, `.text-pretty`, `.text-gradient-champagne`, `.prose-mp`.
- `line-clamp-N` est natif.

## Layout et espacements

| Token | Valeur | Usage |
|---|---|---|
| `h-navbar` / `h-navbar-mobile` | 56 / 64 px | Barre de navigation |
| `h-breadcrumb` | 44 px | Fil d'Ariane |
| `top-header-offset` | 100 px | Éléments sticky |
| `max-w-container` | 1400 px | Largeur de contenu |
| `*-floating-menu` | 60 px | Menu flottant mobile |
| `min-h-touch` / `min-w-touch` | 48 px | Cible tactile minimale |
| `h-touch-comfort` | 56 px | CTA, navigation |
| `h-touch-icon` | 44 px | Bouton icône |
| `aspect-photo` | 3/2 | Vignettes |

Safe areas iOS : `safe-top`, `safe-bottom`, `safe-left`, `safe-right`, `safe-x`, `safe-y`.

Breakpoints : `xs` 625, `sm` 640, `md` 768, **`nav` 900** (bascule menu mobile ↔ horizontal), `lg` 1024, `xl` 1280, `2xl` 1536 px.

## Navigation

- < 900 px : hamburger + tiroir (backdrop + panneau) ; ≥ 900 px : menu horizontal (`nav:hidden` / `nav:flex`).
- Accessibilité en place : `aria-expanded` sur le bouton, `aria-current="page"` sur le lien actif, fermeture par Échap et clic sur le backdrop (`src/scripts/navbar.ts`).

## Mouvement

Durées : `duration-micro` 100, `-fast` 150, `-base` 200, `-slow` 300, `-slower` 400, `-slowest` 600, `-extended` 1500, `-counter` 2000 ms.
Easings : `ease-mp-ease`, `ease-ease-out`, `ease-ease-in`, `ease-ease-in-out`, `ease-ease-out-back`, `ease-ease-spring`.
Animations : `animate-blob`, `animate-heroFadeIn`, `animate-arrow-bounce-left`, `animate-arrow-bounce-right`.
Variantes : `touch:`, `mouse:` (`@custom-variant` dans `base.css`), `motion-safe:`, `motion-reduce:` (natives) ; `hover:` garde le comportement v3 (pas limité aux appareils à survol) ; `base.css` neutralise déjà les animations sous `prefers-reduced-motion: reduce`.

## Effets

- Ombres :
  - qui suivent le thème (variables CSS) : `shadow-floating`, `shadow-floating-inverse`, `shadow-card-hover` ;
  - fixes (`tokens.boxShadow`) : `shadow-hero`, `shadow-glow`, `shadow-glow-strong`, `shadow-glow-subtle`.
- Gradients : `bg-gradient-champagne`, `bg-gradient-champagne-v`, `bg-gradient-overlay`, `bg-gradient-overlay-compact`, `bg-gradient-overlay-light`, `bg-gradient-overlay-top`, `bg-gradient-deep-space`, `bg-gradient-shimmer`, `bg-radial-glow`. Leurs valeurs viennent de `tokens.gradients` et sont figées sur la palette claire.

## Tokens de composants

`tokens.component` (`gallery`, `chart`, `blog`, `navbar`, `mobileMenu`) est accessible en CSS via `theme('component.navbar.buttonSize')` et dans les classes arbitraires (`prose-img:max-h-[theme('component.blog.imageMaxHeight')]`). Hauteurs dérivées : `h-chart`, `h-chart-lg`, `h-chart-sm`, `h-gallery-row`, `h-gallery-row-mobile`.

## Dataviz

`tokens.charts` : palette de 14 couleurs, couleurs par observatoire et par lieu, curseur `rgba(0, 0, 0, 0.06)`. Côté JS, `src/lib/theme.ts` expose la palette dans `theme.chartData` et le curseur dans `theme.chart.cursor`.

## Styles inline

Préférer les classes. Les helpers inline de `src/lib/theme.ts` (`glassStyle`, `dividerStyle`, `toggleButtonStyle`) sont tolérés dans les composants React existants ; ne pas en ajouter de nouveaux pour des valeurs statiques.
