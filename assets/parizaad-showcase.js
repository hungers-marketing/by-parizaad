/**
 * Parizaad Showcase — Interactive Shop the Look Web Component
 * Handles slide transitions, interactive hotspots, synchronized product panel,
 * pagination dots, mobile touch gestures, and Shopify Theme Editor integration.
 */

if (!customElements.get('parizaad-showcase')) {
  class ParizaadShowcase extends HTMLElement {
    constructor() {
      super();
      this.currentSlideIndex = 0;
      this.autoplayTimer = null;
      this.touchStartX = 0;
      this.touchStartY = 0;
      this.touchEndX = 0;
      this.touchEndY = 0;

      this.onArrowClick = this.onArrowClick.bind(this);
      this.onHotspotClick = this.onHotspotClick.bind(this);
      this.onPaginationClick = this.onPaginationClick.bind(this);
      this.onTouchStart = this.onTouchStart.bind(this);
      this.onTouchEnd = this.onTouchEnd.bind(this);
      this.onMouseEnter = this.onMouseEnter.bind(this);
      this.onMouseLeave = this.onMouseLeave.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
    }

    connectedCallback() {
      this.slides = Array.from(this.querySelectorAll('.parizaad-showcase__slide'));
      if (this.slides.length === 0) return;

      this.prevBtn = this.querySelector('.parizaad-showcase__arrow--prev');
      this.nextBtn = this.querySelector('.parizaad-showcase__arrow--next');
      this.mediaContainer = this.querySelector('.parizaad-showcase__carousel');

      this.isInfinite = this.dataset.infiniteLoop === 'true';
      this.autoplayEnabled = this.dataset.autoplay === 'true';
      this.autoplayInterval = parseInt(this.dataset.autoplayInterval || '5', 10) * 1000;
      this.pauseOnHover = this.dataset.pauseOnHover === 'true';

      // Find initial slide or default to 0
      const activeSlideIndex = this.slides.findIndex((s) => s.classList.contains('is-active'));
      this.currentSlideIndex = activeSlideIndex >= 0 ? activeSlideIndex : 0;

      this.initEvents();
      this.goToSlide(this.currentSlideIndex, false);

      if (this.autoplayEnabled) {
        this.startAutoplay();
      }

      this.initThemeEditorEvents();
    }

    disconnectedCallback() {
      this.stopAutoplay();
      this.removeEventListener('keydown', this.onKeyDown);
      if (this.prevBtn) this.prevBtn.removeEventListener('click', this.onArrowClick);
      if (this.nextBtn) this.nextBtn.removeEventListener('click', this.onArrowClick);
      if (this.mediaContainer) {
        this.mediaContainer.removeEventListener('touchstart', this.onTouchStart);
        this.mediaContainer.removeEventListener('touchend', this.onTouchEnd);
        this.mediaContainer.removeEventListener('mouseenter', this.onMouseEnter);
        this.mediaContainer.removeEventListener('mouseleave', this.onMouseLeave);
      }
    }

    initEvents() {
      if (this.prevBtn) {
        this.prevBtn.addEventListener('click', this.onArrowClick);
      }
      if (this.nextBtn) {
        this.nextBtn.addEventListener('click', this.onArrowClick);
      }

      // Hotspots & Pagination Delegation
      this.addEventListener('click', (event) => {
        const hotspot = event.target.closest('.parizaad-hotspot');
        if (hotspot && this.contains(hotspot)) {
          event.preventDefault();
          this.onHotspotClick(hotspot);
          return;
        }

        const paginationDot = event.target.closest('.parizaad-showcase__pagination-dot');
        if (paginationDot && this.contains(paginationDot)) {
          event.preventDefault();
          this.onPaginationClick(paginationDot);
        }
      });

      // Mobile Touch Swipe
      if (this.mediaContainer) {
        this.mediaContainer.addEventListener('touchstart', this.onTouchStart, { passive: true });
        this.mediaContainer.addEventListener('touchend', this.onTouchEnd, { passive: true });

        if (this.pauseOnHover && this.autoplayEnabled) {
          this.mediaContainer.addEventListener('mouseenter', this.onMouseEnter);
          this.mediaContainer.addEventListener('mouseleave', this.onMouseLeave);
        }
      }

      // Keyboard navigation
      this.addEventListener('keydown', this.onKeyDown);
    }

    onArrowClick(event) {
      event.preventDefault();
      const isNext = event.currentTarget.classList.contains('parizaad-showcase__arrow--next');
      if (isNext) {
        this.nextSlide();
      } else {
        this.prevSlide();
      }
    }

    nextSlide() {
      const nextIndex = this.currentSlideIndex + 1;
      if (nextIndex < this.slides.length) {
        this.goToSlide(nextIndex);
      } else if (this.isInfinite) {
        this.goToSlide(0);
      }
    }

    prevSlide() {
      const prevIndex = this.currentSlideIndex - 1;
      if (prevIndex >= 0) {
        this.goToSlide(prevIndex);
      } else if (this.isInfinite) {
        this.goToSlide(this.slides.length - 1);
      }
    }

    goToSlide(index, animate = true) {
      if (index < 0 || index >= this.slides.length) return;

      this.currentSlideIndex = index;

      this.slides.forEach((slide, i) => {
        if (i === index) {
          slide.classList.add('is-active');
          slide.removeAttribute('aria-hidden');

          // Initialize active product on this slide
          const hotspots = Array.from(slide.querySelectorAll('.parizaad-hotspot'));
          let defaultIndex = 0;

          // Check if any hotspot has data-is-default="true"
          const defaultHotspotIndex = hotspots.findIndex((h) => h.dataset.isDefault === 'true');
          if (defaultHotspotIndex >= 0) {
            defaultIndex = defaultHotspotIndex;
          }

          this.selectProductOnSlide(slide, defaultIndex);
        } else {
          slide.classList.remove('is-active');
          slide.setAttribute('aria-hidden', 'true');
        }
      });

      this.updateArrowStates();

      // Dispatch custom slide change event
      this.dispatchEvent(
        new CustomEvent('parizaad:slide:change', {
          bubbles: true,
          detail: { slideIndex: this.currentSlideIndex },
        })
      );
    }

    onHotspotClick(hotspot) {
      const slide = hotspot.closest('.parizaad-showcase__slide');
      if (!slide) return;

      const productIndex = parseInt(hotspot.dataset.productIndex || '0', 10);
      this.selectProductOnSlide(slide, productIndex);
    }

    onPaginationClick(dot) {
      const slide = dot.closest('.parizaad-showcase__slide');
      if (!slide) return;

      const productIndex = parseInt(dot.dataset.productIndex || '0', 10);
      this.selectProductOnSlide(slide, productIndex);
    }

    selectProductOnSlide(slide, productIndex) {
      const hotspots = Array.from(slide.querySelectorAll('.parizaad-hotspot'));
      const productCards = Array.from(slide.querySelectorAll('.parizaad-showcase__product-card'));
      const paginationDots = Array.from(slide.querySelectorAll('.parizaad-showcase__pagination-dot'));

      // Update hotspots
      hotspots.forEach((hotspot) => {
        const hIdx = parseInt(hotspot.dataset.productIndex || '0', 10);
        const isActive = hIdx === productIndex;
        hotspot.classList.toggle('is-active', isActive);
        hotspot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Update product cards
      productCards.forEach((card) => {
        const cIdx = parseInt(card.dataset.productIndex || '0', 10);
        const isActive = cIdx === productIndex;
        card.classList.toggle('is-active', isActive);
        card.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });

      // Update pagination dots
      paginationDots.forEach((dot) => {
        const dIdx = parseInt(dot.dataset.productIndex || '0', 10);
        const isActive = dIdx === productIndex;
        dot.classList.toggle('is-active', isActive);
        dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Dispatch product selection event
      this.dispatchEvent(
        new CustomEvent('parizaad:product:select', {
          bubbles: true,
          detail: {
            slideIndex: this.currentSlideIndex,
            productIndex,
          },
        })
      );
    }

    updateArrowStates() {
      if (this.slides.length <= 1) {
        if (this.prevBtn) this.prevBtn.style.display = 'none';
        if (this.nextBtn) this.nextBtn.style.display = 'none';
        return;
      }

      if (this.prevBtn) this.prevBtn.style.display = 'flex';
      if (this.nextBtn) this.nextBtn.style.display = 'flex';

      if (!this.isInfinite) {
        if (this.prevBtn) {
          const isAtStart = this.currentSlideIndex === 0;
          this.prevBtn.disabled = isAtStart;
          this.prevBtn.setAttribute('aria-disabled', isAtStart ? 'true' : 'false');
        }
        if (this.nextBtn) {
          const isAtEnd = this.currentSlideIndex === this.slides.length - 1;
          this.nextBtn.disabled = isAtEnd;
          this.nextBtn.setAttribute('aria-disabled', isAtEnd ? 'true' : 'false');
        }
      } else {
        if (this.prevBtn) {
          this.prevBtn.disabled = false;
          this.prevBtn.removeAttribute('aria-disabled');
        }
        if (this.nextBtn) {
          this.nextBtn.disabled = false;
          this.nextBtn.removeAttribute('aria-disabled');
        }
      }
    }

    onTouchStart(event) {
      if (event.touches.length !== 1) return;
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    }

    onTouchEnd(event) {
      if (!this.touchStartX || !this.touchStartY) return;
      this.touchEndX = event.changedTouches[0].clientX;
      this.touchEndY = event.changedTouches[0].clientY;

      const diffX = this.touchStartX - this.touchEndX;
      const diffY = this.touchStartY - this.touchEndY;

      // Ensure horizontal swipe dominates vertical scroll
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (diffX > 0) {
          this.nextSlide();
        } else {
          this.prevSlide();
        }
      }

      this.touchStartX = 0;
      this.touchStartY = 0;
    }

    onMouseEnter() {
      this.stopAutoplay();
    }

    onMouseLeave() {
      if (this.autoplayEnabled) {
        this.startAutoplay();
      }
    }

    startAutoplay() {
      this.stopAutoplay();
      this.autoplayTimer = setInterval(() => {
        this.nextSlide();
      }, this.autoplayInterval);
    }

    stopAutoplay() {
      if (this.autoplayTimer) {
        clearInterval(this.autoplayTimer);
        this.autoplayTimer = null;
      }
    }

    onKeyDown(event) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prevSlide();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.nextSlide();
      }
    }

    initThemeEditorEvents() {
      document.addEventListener('shopify:block:select', (event) => {
        if (!this.contains(event.target)) return;
        this.stopAutoplay();

        const block = event.target;
        // If slide block was selected
        if (block.classList.contains('parizaad-showcase__slide')) {
          const sIdx = this.slides.indexOf(block);
          if (sIdx >= 0) this.goToSlide(sIdx);
          return;
        }

        // If hotspot block was selected
        const hotspot = block.classList.contains('parizaad-hotspot') ? block : block.querySelector('.parizaad-hotspot');
        if (hotspot) {
          const slide = hotspot.closest('.parizaad-showcase__slide');
          if (slide) {
            const sIdx = this.slides.indexOf(slide);
            if (sIdx >= 0) {
              this.goToSlide(sIdx);
              const pIdx = parseInt(hotspot.dataset.productIndex || '0', 10);
              this.selectProductOnSlide(slide, pIdx);
            }
          }
        }
      });

      document.addEventListener('shopify:block:deselect', (event) => {
        if (!this.contains(event.target)) return;
        if (this.autoplayEnabled) this.startAutoplay();
      });

      document.addEventListener('shopify:section:load', (event) => {
        if (event.target.contains(this)) {
          this.connectedCallback();
        }
      });
    }
  }

  customElements.define('parizaad-showcase', ParizaadShowcase);
}
