/**
 * Rehype Figure Plugin
 *
 * Transforms image-containing paragraphs in markdown into semantic
 * `<figure>/<figcaption>` elements. Handles three cases:
 * 1. Image + caption in same paragraph
 * 2. Image in one paragraph, caption in next
 * 3. Standalone image (wrapped in figure for consistent styling)
 */
import { visit } from 'unist-util-visit';

function hastToHtml(nodes) {
    if (!nodes) return '';
    if (!Array.isArray(nodes)) nodes = [nodes];
    return nodes
        .map((node) => {
            if (node.type === 'text') {
                return node.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            if (node.type === 'element') {
                const attrs = Object.entries(node.properties || {})
                    .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
                    .join('');
                const inner = hastToHtml(node.children);
                return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`;
            }
            return '';
        })
        .join('');
}

/**
 * Creates a rehype plugin that converts img-containing paragraphs into figure elements.
 * @returns {Function} Rehype transformer
 */
export function rehypeFigure() {
    return async (tree, file) => {
        let hideImageCaptions = false;
        if (file?.data?.astro?.frontmatter) {
            hideImageCaptions = file.data.astro.frontmatter.hideImageCaptions === true;
        } else if (file?.path) {
            try {
                const fs = await import('node:fs');
                if (fs.existsSync(file.path)) {
                    const content = fs.readFileSync(file.path, 'utf8');
                    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
                    if (match) {
                        const fm = match[1].replace(/\r/g, '');
                        const hideMatch = fm.match(/^hideImageCaptions\s*:\s*(true|false)/m);
                        if (hideMatch) {
                            hideImageCaptions = hideMatch[1] === 'true';
                        }
                    }
                }
            } catch {
                // ignore
            }
        }

        visit(tree, 'element', (node, index, parent) => {
            // Look for paragraphs
            if (node.tagName !== 'p') return;

            // Strategy: Find an image inside the paragraph
            const imgIndex = node.children.findIndex((n) => n.tagName === 'img');
            if (imgIndex === -1) return;

            const imgNode = node.children[imgIndex];

            // CASE 1: Image and caption in the SAME paragraph
            // Check if there are content nodes after the image
            const nodesAfter = node.children.slice(imgIndex + 1);
            const hasContentAfter = nodesAfter.some(
                (n) => (n.type === 'text' && n.value.trim().length > 0) || (n.type === 'element' && n.tagName !== 'br'),
            );

            if (hasContentAfter) {
                // Transform the <p> into a <figure>
                node.tagName = 'figure';
                node.properties = {
                    className: ['table', 'mx-auto', 'max-w-full'],
                };

                // Remove <br> tags immediately following the image to clean up
                const cleanChildren = nodesAfter.filter((n) => n.tagName !== 'br');

                // Add gallery-image class for lightbox
                imgNode.properties = imgNode.properties || {};
                imgNode.properties.className = imgNode.properties.className || [];
                if (!Array.isArray(imgNode.properties.className)) {
                    imgNode.properties.className = [imgNode.properties.className];
                }
                if (!imgNode.properties.className.includes('gallery-image')) {
                    imgNode.properties.className.push('gallery-image', 'cursor-pointer');
                }

                // Extract caption text and safe markup for lightbox
                const captionText = cleanChildren
                    .map((n) => (n.type === 'text' ? n.value : ''))
                    .join('')
                    .trim();
                imgNode.properties['data-caption'] = captionText;
                imgNode.properties['data-caption-safe-markup'] = encodeURIComponent(hastToHtml(cleanChildren));

                // New structure
                node.children = [imgNode];
                if (!hideImageCaptions) {
                    node.children.push({
                        type: 'element',
                        tagName: 'figcaption',
                        properties: {
                            className: [
                                'table-caption',
                                'caption-bottom',
                                'text-center',
                                'text-sm',
                                'text-mp-text-muted',
                                'mt-2',
                                'italic',
                            ],
                        },
                        children: cleanChildren,
                    });
                }
                return; // Done with this node
            }

            // CASE 2: Image in one p, Caption in next p
            const nodesBefore = node.children.slice(0, imgIndex);
            const isOnlyImage =
                nodesBefore.every((n) => n.type === 'text' && !n.value.trim()) &&
                nodesAfter.every((n) => n.type === 'text' && !n.value.trim());

            if (isOnlyImage && parent) {
                // Find next element sibling, skipping whitespace text nodes
                let nextSiblingIndex = index + 1;
                let nextNode = null;

                while (nextSiblingIndex < parent.children.length) {
                    const sibling = parent.children[nextSiblingIndex];
                    if (sibling.type === 'text' && !sibling.value.trim()) {
                        nextSiblingIndex++;
                        continue;
                    }
                    nextNode = sibling;
                    break;
                }

                if (nextNode && nextNode.type === 'element' && nextNode.tagName === 'p') {
                    // Add gallery-image class for lightbox
                    imgNode.properties = imgNode.properties || {};
                    imgNode.properties.className = imgNode.properties.className || [];
                    if (!Array.isArray(imgNode.properties.className)) {
                        imgNode.properties.className = [imgNode.properties.className];
                    }
                    if (!imgNode.properties.className.includes('gallery-image')) {
                        imgNode.properties.className.push('gallery-image', 'cursor-pointer');
                    }

                    // Extract caption text and safe markup for lightbox
                    const captionText = nextNode.children
                        .map((n) => (n.type === 'text' ? n.value : ''))
                        .join('')
                        .trim();
                    imgNode.properties['data-caption'] = captionText;
                    imgNode.properties['data-caption-safe-markup'] = encodeURIComponent(hastToHtml(nextNode.children));

                    // Merge
                    node.tagName = 'figure';
                    node.properties = {
                        className: ['table', 'mx-auto', 'max-w-full'],
                    };
                    node.children = [imgNode];
                    if (!hideImageCaptions) {
                        node.children.push({
                            type: 'element',
                            tagName: 'figcaption',
                            properties: {
                                className: [
                                    'table-caption',
                                    'caption-bottom',
                                    'text-center',
                                    'text-sm',
                                    'text-mp-text-muted',
                                    'mt-2',
                                    'italic',
                                ],
                            },
                            children: nextNode.children,
                        });
                    }

                    // Remove the caption paragraph and any intervening whitespace from parent
                    parent.children.splice(index + 1, nextSiblingIndex - index);

                    return;
                }

                // CASE 3: Standalone image with no caption
                // Add gallery-image class for lightbox
                imgNode.properties = imgNode.properties || {};
                imgNode.properties.className = imgNode.properties.className || [];
                if (!Array.isArray(imgNode.properties.className)) {
                    imgNode.properties.className = [imgNode.properties.className];
                }
                if (!imgNode.properties.className.includes('gallery-image')) {
                    imgNode.properties.className.push('gallery-image', 'cursor-pointer');
                }

                // Wrap it in a figure anyway for consistent styling
                node.tagName = 'figure';
                node.properties = {
                    className: ['table', 'mx-auto', 'max-w-full'],
                };

                // Use alt text as caption if available
                const altText = imgNode.properties.alt;
                if (altText && typeof altText === 'string' && altText.trim().length > 0) {
                    imgNode.properties['data-caption'] = altText.trim();
                    imgNode.properties['data-caption-safe-markup'] = encodeURIComponent(altText.trim());

                    node.children = [imgNode];
                    if (!hideImageCaptions) {
                        node.children.push({
                            type: 'element',
                            tagName: 'figcaption',
                            properties: {
                                className: [
                                    'table-caption',
                                    'caption-bottom',
                                    'text-center',
                                    'text-sm',
                                    'text-mp-text-muted',
                                    'mt-2',
                                    'italic',
                                ],
                            },
                            children: [{ type: 'text', value: altText }],
                        });
                    }
                } else {
                    node.children = [imgNode];
                }
                return;
            }
        });
    };
}
