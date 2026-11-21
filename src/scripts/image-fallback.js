/**
 * Image Fallback Script
 * Works with native lazy loading (loading="lazy")
 * Attaches error handlers BEFORE images start loading
 */

(function () {
    'use strict';

    function applyFallback(img) {
        if (!img || img.dataset.fallbackApplied) return false;

        const fallbackSrc = img.dataset.fallbackSrc;
        if (!fallbackSrc) return false;

        img.dataset.fallbackApplied = 'true';

        // Remove source elements from picture
        const picture = img.closest('picture');
        if (picture) {
            picture.querySelectorAll('source').forEach((s) => s.remove());
        }

        // Switch to fallback
        img.src = fallbackSrc;
        console.warn('[Fallback] →', fallbackSrc);
        return true;
    }

    function attachErrorHandler(img) {
        if (!img || img.dataset.errorHandlerAttached || !img.dataset.fallbackSrc) return;

        img.dataset.errorHandlerAttached = 'true';

        // Attach error handler BEFORE image loads
        img.onerror = function () {
            applyFallback(this);
        };

        // For images that are already broken (complete but 0 width)
        if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) {
            applyFallback(img);
        }
    }

    function processImages() {
        document
            .querySelectorAll('img[data-fallback-src]:not([data-error-handler-attached])')
            .forEach(attachErrorHandler);
    }

    // Run immediately for images already in DOM
    processImages();

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processImages);
    }

    // Run on window load
    window.addEventListener('load', function () {
        processImages();
        // Check for broken images after full load
        setTimeout(function () {
            document.querySelectorAll('img[data-fallback-src]:not([data-fallback-applied])').forEach(function (img) {
                if (img.complete && img.naturalWidth === 0) {
                    applyFallback(img);
                }
            });
        }, 1000);
    });

    // Astro View Transitions
    document.addEventListener('astro:page-load', processImages);
    document.addEventListener('astro:after-swap', processImages);

    // MutationObserver for dynamically added images
    new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType === 1) {
                    if (node.tagName === 'IMG' && node.dataset.fallbackSrc) {
                        attachErrorHandler(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('img[data-fallback-src]').forEach(function (img) {
                            attachErrorHandler(img);
                        });
                    }
                }
            });
        });
    }).observe(document.documentElement, { childList: true, subtree: true });
})();
