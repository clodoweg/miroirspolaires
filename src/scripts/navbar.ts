/**
 * Navbar Interaction Script
 * Handles scroll effects and mobile menu toggle
 */

// TODO: Remove empty global Window declaration if no extensions are needed

function initNavbar() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const body = document.body;
    let isOpen = false;

    // Menu Toggle
    const backdrop = document.getElementById('mobile-menu-backdrop');
    const panel = document.getElementById('mobile-menu-panel');

    // Close Interaction
    const closeMenu = () => {
        isOpen = false;
        menuBtn?.classList.remove('is-open');
        menuBtn?.setAttribute('aria-expanded', 'false');

        // Hide Backdrop
        backdrop?.classList.add('opacity-0', 'pointer-events-none');
        backdrop?.classList.remove('opacity-100');

        // Hide Panel
        panel?.classList.add('-translate-x-full');
        panel?.classList.remove('translate-x-0');

        body.style.overflow = '';
    };

    // Open Interaction
    const openMenu = () => {
        isOpen = true;
        menuBtn?.classList.add('is-open');
        menuBtn?.setAttribute('aria-expanded', 'true');

        // Show Backdrop
        backdrop?.classList.remove('opacity-0', 'pointer-events-none');
        backdrop?.classList.add('opacity-100');

        // Show Panel
        panel?.classList.remove('-translate-x-full');
        panel?.classList.add('translate-x-0');

        body.style.overflow = 'hidden';
    };

    const toggleMenu = () => {
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    };

    menuBtn?.addEventListener('click', toggleMenu);
    backdrop?.addEventListener('click', closeMenu);

    // Close on simple link click (optional but good for UX)
    // panel?.querySelectorAll('a').forEach(link => {
    //     link.addEventListener('click', closeMenu);
    // });

    // Keyboard Accessibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) closeMenu();
    });

    // Resize Handler
    window.addEventListener('resize', () => {
        // Breakpoint matching 'nav:hidden' which usually corresponds to md or lg
        // Checking tailwind config, nav: is likely custom, but assuming standard logic
        // If window gets wide enough, close menu.
        // Let's assume 1024px or check CSS.
        // Based on user prompt code example: 900px
        if (window.innerWidth >= 900 && isOpen) {
            closeMenu();
        }
    });
    // Scroll Handler for Opacity
    const navbar = document.getElementById('navbar');
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
        if (!navbar) return;

        // If at top, use default 90%
        if (window.scrollY <= 20) {
            navbar.classList.remove('bg-mp-ui-black', 'bg-mp-ui-black/50');
            navbar.classList.add('bg-mp-ui-black/90', 'backdrop-blur-md');
            return;
        }

        // If scrolling and not at top, become transparent (50%)
        navbar.classList.remove('bg-mp-ui-black', 'bg-mp-ui-black/90');
        navbar.classList.add('bg-mp-ui-black/50', 'backdrop-blur-md');

        // Clear existing timeout
        clearTimeout(scrollTimeout);

        // Set timeout to revert to default (90%) when scrolling stops
        scrollTimeout = setTimeout(() => {
            navbar.classList.remove('bg-mp-ui-black', 'bg-mp-ui-black/50');
            navbar.classList.add('bg-mp-ui-black/90', 'backdrop-blur-md');
        }, 600);
    };

    window.removeEventListener('scroll', handleScroll);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check
}

// Run on initial load
initNavbar();

// Run on View Transition navigation
document.addEventListener('astro:after-swap', initNavbar);

export {};
