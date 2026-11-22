/**
 * Rendu sûr des légendes HTML de la Lightbox.
 *
 * Responsabilité : afficher le balisage de légende produit au build par `rehype-figure`
 * (`data-caption-safe-markup` : texte et liens) sans passer par `innerHTML`.
 *
 * WARNING: sécurité. La légende vient du Markdown, qui accepte du HTML brut : seules les balises de
 * `ALLOWED_TAGS` sont recopiées, sans aucun attribut sauf un `href` http(s), relatif ou d'ancre. Les autres
 * balises sont réduites à leur texte, et celles de `DROPPED_TAGS` (scripts, styles, documents intégrés)
 * écartées avec leur contenu. Aucun script ni gestionnaire `on…` ne peut donc atteindre la page.
 */

const ALLOWED_TAGS = new Set(['A', 'EM', 'STRONG', 'I', 'B', 'CODE', 'BR']);
// POURQUOI : leur contenu n'est pas du texte de légende (code, styles, documents intégrés) : on l'écarte.
const DROPPED_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'TEMPLATE',
    'NOSCRIPT',
    'IFRAME',
    'OBJECT',
    'SVG',
    'MATH',
    'TEXTAREA',
    'TITLE',
]);
const SAFE_HREF_RE = /^(?:https?:\/\/|\/|#|\.\.?\/)/i;

function copySafeNodes(source: Node, target: Node, doc: Document): void {
    for (const child of Array.from(source.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            target.appendChild(doc.createTextNode(child.textContent ?? ''));
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const element = child as Element;
        if (DROPPED_TAGS.has(element.tagName.toUpperCase())) continue;
        if (!ALLOWED_TAGS.has(element.tagName)) {
            // POURQUOI : une balise non prévue garde son texte, sans son balisage ni ses attributs.
            copySafeNodes(element, target, doc);
            continue;
        }
        const copy = doc.createElement(element.tagName.toLowerCase());
        const href = element.getAttribute('href')?.trim();
        if (element.tagName === 'A' && href && SAFE_HREF_RE.test(href)) copy.setAttribute('href', href);
        copySafeNodes(element, copy, doc);
        target.appendChild(copy);
    }
}

/**
 * Remplace le contenu d'un élément par une légende HTML filtrée.
 *
 * @param target - Élément de légende à remplir.
 * @param markup - Balisage de la légende (déjà décodé de `data-caption-safe-markup`).
 */
export function renderCaptionMarkup(target: HTMLElement, markup: string): void {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const fragment = target.ownerDocument.createDocumentFragment();
    copySafeNodes(parsed.body, fragment, target.ownerDocument);
    target.replaceChildren(fragment);
}
