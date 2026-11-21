/**
 * Justified Gallery Layout Script
 * Creates a Google Photos-style layout where each row has the same height
 * and images stretch to fill the row based on their aspect ratios.
 */

interface ImageDimensions {
    width: number;
    height: number;
}

interface RowItem {
    item: HTMLElement;
    aspectRatio: number;
}

interface Row {
    items: RowItem[];
    aspectSum: number;
    height: number;
}

function initJustifiedGallery(): void {
    const galleries = document.querySelectorAll<HTMLElement>('.justified-gallery');

    galleries.forEach((gallery) => {
        const items = Array.from(gallery.children).filter(
            (child): child is HTMLElement =>
                child instanceof HTMLElement &&
                (child.tagName === 'IMG' || child.tagName === 'A' || child.tagName === 'PICTURE'),
        );

        if (items.length === 0) return;

        // Get container width and target row height
        const containerWidth = gallery.clientWidth;
        const gap = 8; // gap-2 = 8px
        const isMobile = window.innerWidth < 768;
        const targetRowHeight = isMobile ? 200 : 320;

        // Wait for all images to load to get their natural dimensions
        const imagePromises: Promise<ImageDimensions>[] = items.map((item) => {
            const img = item.tagName === 'IMG' ? (item as HTMLImageElement) : item.querySelector('img');

            if (!img || !(img instanceof HTMLImageElement)) {
                return Promise.resolve({ width: 1, height: 1 });
            }

            // Check for explicit attributes first (fastest, supports lazy loading)
            const attrWidth = parseInt(img.getAttribute('width') || '0', 10);
            const attrHeight = parseInt(img.getAttribute('height') || '0', 10);
            if (attrWidth > 0 && attrHeight > 0) {
                return Promise.resolve({ width: attrWidth, height: attrHeight });
            }

            if (img.complete && img.naturalWidth > 0) {
                return Promise.resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                });
            }

            return new Promise<ImageDimensions>((resolve) => {
                img.onload = () =>
                    resolve({
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                    });
                img.onerror = () => resolve({ width: 1, height: 1 });
            });
        });

        Promise.all(imagePromises).then((dimensions: ImageDimensions[]) => {
            // Calculate aspect ratios
            const aspectRatios = dimensions.map((d) => d.width / d.height);

            // Layout algorithm: pack images until row fills container width
            let currentRow: RowItem[] = [];
            let currentRowAspectSum = 0;
            const rows: Row[] = [];

            items.forEach((item, index) => {
                const aspectRatio = aspectRatios[index] || 1;
                currentRow.push({ item, aspectRatio });
                currentRowAspectSum += aspectRatio;

                // Calculate potential row width if scaled to targetHeight
                const gapsWidth = (currentRow.length - 1) * gap;
                const rowWidthAtTargetHeight = currentRowAspectSum * targetRowHeight + gapsWidth;

                // If row would exceed or fill container width, commit it
                if (rowWidthAtTargetHeight >= containerWidth || index === items.length - 1) {
                    // Calculate exact height to fill container width
                    const availableWidth = containerWidth - gapsWidth;
                    const exactHeight = availableWidth / currentRowAspectSum;

                    rows.push({
                        items: [...currentRow],
                        aspectSum: currentRowAspectSum,
                        height: exactHeight,
                    });
                    currentRow = [];
                    currentRowAspectSum = 0;
                }
            });

            // Apply calculated widths to each image
            rows.forEach((row, rowIndex) => {
                const isLastRow = rowIndex === rows.length - 1;

                // For last row, don't stretch to fill if it would make images too tall
                let rowHeight = row.height;
                // On mobile, if the last image is alone, we WANT it to take full width (user request)
                const isMobileSingleLast = isMobile && isLastRow && row.items.length === 1;

                if (!isMobileSingleLast && isLastRow && row.items.length < 3 && rowHeight > targetRowHeight * 1.5) {
                    rowHeight = targetRowHeight;
                }

                row.items.forEach(({ item, aspectRatio }) => {
                    const width = rowHeight * aspectRatio;

                    item.style.width = `${width}px`;
                    item.style.height = `${rowHeight}px`;
                    item.style.flexGrow = '0';
                    item.style.flexShrink = '0';

                    // Add rounded corners
                    item.style.borderRadius = '0.5rem';
                    item.style.overflow = 'hidden';

                    if (item.tagName === 'A' || item.tagName === 'PICTURE') {
                        const img = item.querySelector('img');
                        if (img instanceof HTMLImageElement) {
                            img.style.width = '100%';
                            img.style.height = '100%';
                            img.style.objectFit = 'cover';
                            img.style.borderRadius = '0.5rem';
                        }
                    } else if (item.tagName === 'IMG') {
                        (item as HTMLImageElement).style.objectFit = 'cover';
                    }
                });
            });

            // Mark gallery as ready
            gallery.classList.add('jg-ready');
        });
    });
}

// Initialize on page load and Astro navigation
document.addEventListener('astro:page-load', initJustifiedGallery);

// Re-layout on window resize (debounced)
let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Reset and recalculate
        document.querySelectorAll<HTMLElement>('.justified-gallery').forEach((gallery) => {
            gallery.classList.remove('jg-ready');
            Array.from(gallery.children).forEach((child) => {
                if (child instanceof HTMLElement) {
                    child.style.width = '';
                    child.style.height = '';
                }
            });
        });
        initJustifiedGallery();
    }, 200);
});
