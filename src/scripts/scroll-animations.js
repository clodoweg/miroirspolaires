const initAnimations = () => {
    // 1. Reveal Animations on Scroll
    const observerOptions = {
        root: null,
        rootMargin: '1200px', // Pre-trigger much earlier to avoid seeing empty spaces
        threshold: 0.01, // Trigger as soon as a tiny part is near
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const target = entry.target;

                // Handle staggered delay
                const delay = target.getAttribute('data-delay') || '0';
                target.style.transitionDelay = `${delay}ms`;

                target.classList.add('reveal-visible');
                obs.unobserve(target); // Run once
            }
        });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.js-reveal');
    revealElements.forEach((el) => observer.observe(el));

    // 2. Parallax Effect (Subtle)
    const parallaxElements = document.querySelectorAll('[data-parallax]');
    if (parallaxElements.length > 0) {
        window.addEventListener(
            'scroll',
            () => {
                const scrolled = window.scrollY;
                parallaxElements.forEach((el) => {
                    const speed = parseFloat(el.getAttribute('data-parallax-speed') || '0.1');
                    const yPos = -(scrolled * speed);
                    if (el instanceof HTMLElement) {
                        el.style.transform = `translateY(${yPos}px)`;
                    }
                });
            },
            { passive: true },
        );
    }
};

// Initialize on first load
document.addEventListener('DOMContentLoaded', initAnimations);

// Re-initialize on View Transitions navigation
document.addEventListener('astro:page-load', initAnimations);
