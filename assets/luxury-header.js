/**
 * Luxury Transparent & Sticky Header Controller
 * Handles scroll thresholds, transparent-to-solid transitions,
 * dual-logo switching, and announcement bar synchronization.
 */

(function () {
  'use strict';

  function initLuxuryHeader() {
    const headerWrapper = document.querySelector('.header-wrapper--transparent');
    if (!headerWrapper) return;

    const headerSection = headerWrapper.closest('.section-header') || document.querySelector('.section-header');
    if (!headerSection) return;

    headerSection.classList.add('section-header--transparent');

    const threshold = parseInt(headerSection.dataset.scrollThreshold || '50', 10);
    const announcementBar = document.querySelector('.utility-bar, .announcement-bar-section, [class*="announcement-bar"]');

    function syncAnnouncementHeight() {
      if (announcementBar) {
        const height = announcementBar.offsetHeight;
        document.documentElement.style.setProperty('--announcement-bar-height', `${height}px`);
      } else {
        document.documentElement.style.setProperty('--announcement-bar-height', '0px');
      }
    }

    function syncHeaderHeight() {
      if (headerSection) {
        const height = headerSection.offsetHeight;
        if (height > 0) {
          document.documentElement.style.setProperty('--header-height', `${height}px`);
        }
      }
    }

    syncAnnouncementHeight();
    syncHeaderHeight();
    window.addEventListener('resize', () => {
      syncAnnouncementHeight();
      syncHeaderHeight();
    }, { passive: true });

    let isTicking = false;
    let isMenuOpen = false;

    function updateHeaderState() {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const shouldBeSolid = scrollTop > threshold || isMenuOpen;

      if (shouldBeSolid) {
        headerWrapper.classList.add('is-solid');
        headerSection.classList.add('is-scrolled');
      } else {
        headerWrapper.classList.remove('is-solid');
        headerSection.classList.remove('is-scrolled');
      }

      isTicking = false;
    }

    function onScroll() {
      if (!isTicking) {
        requestAnimationFrame(updateHeaderState);
        isTicking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    updateHeaderState();

    // Listen for mobile drawer opening/closing and menu disclosures
    const allMenuDetails = headerSection.querySelectorAll('header-drawer details, header-menu details');
    allMenuDetails.forEach((detail) => {
      detail.addEventListener('toggle', () => {
        isMenuOpen = [...allMenuDetails].some((d) => d.open);
        updateHeaderState();
      });
    });

    // Listen for search modal
    const searchDetails = headerSection.querySelectorAll('details-modal details');
    searchDetails.forEach((detail) => {
      detail.addEventListener('toggle', () => {
        if (detail.open) {
          headerWrapper.classList.add('is-solid');
        } else {
          updateHeaderState();
        }
      });
    });
  }

  function initDesktopMenuHover() {
    const isDesktop = window.matchMedia('(min-width: 990px) and (hover: hover)');
    const headerMenus = document.querySelectorAll('.header__inline-menu header-menu');

    headerMenus.forEach((headerMenu) => {
      // Avoid attaching duplicate event listeners
      if (headerMenu.dataset.hoverInitialized === 'true') return;
      headerMenu.dataset.hoverInitialized = 'true';

      const details = headerMenu.querySelector('details');
      const summary = headerMenu.querySelector('summary');
      if (!details || !summary) return;

      let closeTimer = null;

      const openMenu = () => {
        if (!isDesktop.matches) return;
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        if (!details.hasAttribute('open')) {
          details.setAttribute('open', '');
          summary.setAttribute('aria-expanded', 'true');
          details.dispatchEvent(new Event('toggle'));
        }
      };

      const closeMenu = () => {
        if (!isDesktop.matches) return;
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
          if (!headerMenu.contains(document.activeElement)) {
            details.removeAttribute('open');
            summary.setAttribute('aria-expanded', 'false');
            details.dispatchEvent(new Event('toggle'));
          }
          closeTimer = null;
        }, 140);
      };

      headerMenu.addEventListener('mouseenter', openMenu);
      headerMenu.addEventListener('mouseleave', closeMenu);

      const megaContent = details.querySelector('.mega-menu__content, .luxury-mega-menu');
      if (megaContent) {
        megaContent.addEventListener('mouseenter', openMenu);
        megaContent.addEventListener('mouseleave', closeMenu);
      }

      // Parent link click navigation: if summary has a valid destination URL, click navigates to it
      summary.addEventListener('click', (e) => {
        if (!isDesktop.matches) return;
        const targetUrl = summary.dataset.url;
        if (targetUrl && targetUrl !== '#' && targetUrl !== '') {
          e.preventDefault();
          window.location.href = targetUrl;
        }
      });

      // Accessible Escape key to close dropdown and return focus
      headerMenu.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && details.hasAttribute('open')) {
          details.removeAttribute('open');
          summary.setAttribute('aria-expanded', 'false');
          details.dispatchEvent(new Event('toggle'));
          summary.focus();
        }
      });
    });
  }

  function init() {
    initLuxuryHeader();
    initDesktopMenuHover();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Shopify Theme Editor re-render support
  document.addEventListener('shopify:section:load', function (event) {
    if (event.target.classList.contains('section-header')) {
      init();
    }
  });
})();
