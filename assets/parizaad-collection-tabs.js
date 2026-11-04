/**
 * Parizaad Collection Tabs with Product Carousel
 * Minimalist luxury collection switcher and responsive product carousel.
 */

if (!customElements.get('parizaad-collection-tabs')) {
  class ParizaadCollectionTabs extends HTMLElement {
    constructor() {
      super();
      this.currentTabIndex = 0;
      this.onTabClick = this.onTabClick.bind(this);
      this.onTabKeyDown = this.onTabKeyDown.bind(this);
      this.onArrowClick = this.onArrowClick.bind(this);
      this.onTrackScroll = this.onTrackScroll.bind(this);
    }

    connectedCallback() {
      this.tabs = Array.from(this.querySelectorAll('.parizaad-tabs__tab'));
      this.panels = Array.from(this.querySelectorAll('.parizaad-tabs__panel'));
      this.dynamicButton = this.querySelector('.parizaad-tabs__btn');
      this.isInfinite = this.dataset.infiniteLoop === 'true';

      if (this.tabs.length === 0 || this.panels.length === 0) return;

      this.initTabs();
      this.initCarousels();
      this.initThemeEditorEvents();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onTabClick);
      this.removeEventListener('keydown', this.onTabKeyDown);

      this.panels.forEach((panel) => {
        const track = panel.querySelector('.parizaad-carousel__track');
        if (track) {
          track.removeEventListener('scroll', this.onTrackScroll);
        }
      });
    }

    initTabs() {
      this.addEventListener('click', this.onTabClick);
      this.addEventListener('keydown', this.onTabKeyDown);

      // Initialize default active tab (or index 0)
      const activeIndex = this.tabs.findIndex((tab) => tab.classList.contains('is-active'));
      this.selectTab(activeIndex >= 0 ? activeIndex : 0, false);
    }

    initCarousels() {
      this.panels.forEach((panel) => {
        const track = panel.querySelector('.parizaad-carousel__track');
        const prevArrow = panel.querySelector('.parizaad-carousel__arrow--prev');
        const nextArrow = panel.querySelector('.parizaad-carousel__arrow--next');

        if (track) {
          track.addEventListener('scroll', this.onTrackScroll, { passive: true });
        }

        if (prevArrow) {
          prevArrow.addEventListener('click', this.onArrowClick);
        }

        if (nextArrow) {
          nextArrow.addEventListener('click', this.onArrowClick);
        }

        this.updateArrowStates(panel);
      });
    }

    onTabClick(event) {
      const tab = event.target.closest('.parizaad-tabs__tab');
      if (!tab || !this.contains(tab)) return;

      event.preventDefault();
      const index = this.tabs.indexOf(tab);
      if (index >= 0) {
        this.selectTab(index);
      }
    }

    onTabKeyDown(event) {
      const activeTab = document.activeElement.closest('.parizaad-tabs__tab');
      if (!activeTab || !this.contains(activeTab)) return;

      const currentIndex = this.tabs.indexOf(activeTab);
      let newIndex = null;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        newIndex = (currentIndex + 1) % this.tabs.length;
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        newIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
      } else if (event.key === 'Home') {
        event.preventDefault();
        newIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        newIndex = this.tabs.length - 1;
      }

      if (newIndex !== null) {
        this.selectTab(newIndex);
        this.tabs[newIndex].focus();
      }
    }

    selectTab(index, smoothScrollNav = true) {
      if (index < 0 || index >= this.tabs.length) return;
      this.currentTabIndex = index;

      // Update tabs state
      this.tabs.forEach((tab, i) => {
        const isActive = i === index;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.setAttribute('tabindex', isActive ? '0' : '-1');

        if (isActive && smoothScrollNav) {
          tab.scrollIntoView({
            behavior: 'smooth',
            inline: 'center',
            block: 'nearest',
          });
        }
      });

      // Update panels state
      this.panels.forEach((panel, i) => {
        const isActive = i === index;
        panel.classList.toggle('is-active', isActive);
        panel.hidden = !isActive;

        if (isActive) {
          // Reset carousel scroll position
          const track = panel.querySelector('.parizaad-carousel__track');
          if (track) {
            track.scrollTo({ left: 0, behavior: 'auto' });
          }

          this.updateArrowStates(panel);

          // Update dynamic button label and URL
          if (this.dynamicButton) {
            const btnLabel = panel.dataset.buttonLabel;
            const btnUrl = panel.dataset.buttonUrl;

            if (btnLabel) {
              this.dynamicButton.textContent = btnLabel;
            }
            if (btnUrl) {
              this.dynamicButton.setAttribute('href', btnUrl);
            }
          }
        }
      });

      // Dispatch custom tab change event
      this.dispatchEvent(
        new CustomEvent('parizaad:tab:change', {
          bubbles: true,
          detail: { tabIndex: this.currentTabIndex },
        })
      );
    }

    onArrowClick(event) {
      event.preventDefault();
      const arrow = event.currentTarget;
      const panel = arrow.closest('.parizaad-tabs__panel');
      if (!panel) return;

      const track = panel.querySelector('.parizaad-carousel__track');
      if (!track) return;

      const item = track.querySelector('.parizaad-carousel__item');
      if (!item) return;

      const gap = parseInt(window.getComputedStyle(track).gap || '24', 10);
      const scrollStep = item.offsetWidth + gap;
      const isNext = arrow.classList.contains('parizaad-carousel__arrow--next');

      if (isNext) {
        const maxScroll = track.scrollWidth - track.clientWidth;
        if (track.scrollLeft >= maxScroll - 5 && this.isInfinite) {
          track.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          track.scrollBy({ left: scrollStep, behavior: 'smooth' });
        }
      } else {
        if (track.scrollLeft <= 5 && this.isInfinite) {
          track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
        } else {
          track.scrollBy({ left: -scrollStep, behavior: 'smooth' });
        }
      }
    }

    onTrackScroll(event) {
      const track = event.target;
      const panel = track.closest('.parizaad-tabs__panel');
      if (panel) {
        requestAnimationFrame(() => this.updateArrowStates(panel));
      }
    }

    updateArrowStates(panel) {
      const track = panel.querySelector('.parizaad-carousel__track');
      const prevArrow = panel.querySelector('.parizaad-carousel__arrow--prev');
      const nextArrow = panel.querySelector('.parizaad-carousel__arrow--next');

      if (!track || !prevArrow || !nextArrow) return;

      const maxScroll = track.scrollWidth - track.clientWidth;

      // If content fits without scrolling, disable both arrows
      if (maxScroll <= 4) {
        prevArrow.disabled = true;
        nextArrow.disabled = true;
        prevArrow.style.display = 'none';
        nextArrow.style.display = 'none';
        return;
      }

      prevArrow.style.display = 'flex';
      nextArrow.style.display = 'flex';

      if (!this.isInfinite) {
        prevArrow.disabled = track.scrollLeft <= 4;
        nextArrow.disabled = track.scrollLeft >= maxScroll - 4;
      } else {
        prevArrow.disabled = false;
        nextArrow.disabled = false;
      }
    }

    initThemeEditorEvents() {
      document.addEventListener('shopify:block:select', (event) => {
        if (!this.contains(event.target)) return;

        const blockId = event.detail?.blockId || event.target.dataset?.blockId;
        if (!blockId) return;

        const targetIndex = this.tabs.findIndex((tab) => tab.dataset.blockId === blockId);
        if (targetIndex >= 0) {
          this.selectTab(targetIndex);
        }
      });

      document.addEventListener('shopify:section:load', (event) => {
        if (event.target.contains(this)) {
          this.connectedCallback();
        }
      });
    }
  }

  customElements.define('parizaad-collection-tabs', ParizaadCollectionTabs);
}
