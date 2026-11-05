/**
 * Parizaad Instagram Stories & Shoppable UGC Gallery
 * Web Component handling carousel navigation, responsive touch scroll,
 * IntersectionObserver for videos, shoppable product overlays, quick cart additions,
 * lightbox modal, and Shopify Theme Editor lifecycle integration.
 */

if (!customElements.get('parizaad-instagram-stories')) {
  class ParizaadInstagramStories extends HTMLElement {
    constructor() {
      super();

      this.carousel = null;
      this.cards = [];
      this.prevArrow = null;
      this.nextArrow = null;
      this.dotsContainer = null;
      this.dots = [];
      this.modal = null;
      this.videoObserver = null;
      this.autoplayTimer = null;

      this.onScroll = this.onScroll.bind(this);
      this.onArrowClick = this.onArrowClick.bind(this);
      this.onCardClick = this.onCardClick.bind(this);
      this.onPlusButtonClick = this.onPlusButtonClick.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.closeModal = this.closeModal.bind(this);
    }

    connectedCallback() {
      this.carousel = this.querySelector('.parizaad-stories__carousel');
      this.cards = Array.from(this.querySelectorAll('.parizaad-stories__card'));
      if (!this.carousel || this.cards.length === 0) return;

      this.prevArrow = this.querySelector('.parizaad-stories__nav-arrow--prev');
      this.nextArrow = this.querySelector('.parizaad-stories__nav-arrow--next');
      this.dotsContainer = this.querySelector('.parizaad-stories__dots');
      this.modal = this.querySelector('.parizaad-stories-modal');

      this.cardClickAction = this.dataset.cardClickAction || 'product';
      this.plusButtonAction = this.dataset.plusButtonAction || 'product';
      this.autoplayEnabled = this.dataset.autoplay === 'true';
      this.autoplayInterval = parseInt(this.dataset.autoplayInterval || '5', 10) * 1000;

      this.initArrows();
      this.initDots();
      this.initCardInteractions();
      this.initVideoObserver();
      this.initModal();
      this.updateNavigationState();

      this.carousel.addEventListener('scroll', this.onScroll, { passive: true });

      if (this.autoplayEnabled && this.cards.length > 1) {
        this.startAutoplay();
        this.addEventListener('mouseenter', () => this.stopAutoplay());
        this.addEventListener('mouseleave', () => this.startAutoplay());
        this.addEventListener('touchstart', () => this.stopAutoplay(), { passive: true });
      }

      // Theme Editor block selection
      this.initThemeEditorEvents();
    }

    disconnectedCallback() {
      if (this.carousel) {
        this.carousel.removeEventListener('scroll', this.onScroll);
      }
      if (this.videoObserver) {
        this.videoObserver.disconnect();
      }
      this.stopAutoplay();
    }

    /* ------------------------------------------------------------------------
       Navigation Arrows
       ------------------------------------------------------------------------ */
    initArrows() {
      if (this.prevArrow) {
        this.prevArrow.addEventListener('click', () => this.onArrowClick(-1));
      }
      if (this.nextArrow) {
        this.nextArrow.addEventListener('click', () => this.onArrowClick(1));
      }
    }

    onArrowClick(direction) {
      if (!this.carousel || this.cards.length === 0) return;

      const cardWidth = this.cards[0].offsetWidth;
      const gap = parseFloat(getComputedStyle(this.carousel).gap || '20');
      const scrollStep = cardWidth + gap;

      this.carousel.scrollBy({
        left: direction * scrollStep,
        behavior: 'smooth',
      });
    }

    /* ------------------------------------------------------------------------
       Dots Pagination
       ------------------------------------------------------------------------ */
    initDots() {
      if (!this.dotsContainer) return;
      this.dotsContainer.innerHTML = '';
      this.dots = [];

      this.cards.forEach((card, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `parizaad-stories__dot ${index === 0 ? 'is-active' : ''}`;
        dot.setAttribute('aria-label', `Go to story ${index + 1}`);
        dot.addEventListener('click', () => {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        });
        this.dotsContainer.appendChild(dot);
        this.dots.push(dot);
      });
    }

    updateNavigationState() {
      if (!this.carousel) return;

      const maxScrollLeft = this.carousel.scrollWidth - this.carousel.clientWidth;
      const currentScroll = this.carousel.scrollLeft;

      if (this.prevArrow) {
        this.prevArrow.disabled = currentScroll <= 4;
      }
      if (this.nextArrow) {
        this.nextArrow.disabled = currentScroll >= maxScrollLeft - 4;
      }

      // Update dots based on visible card
      if (this.dots.length > 0) {
        const cardWidth = this.cards[0].offsetWidth + parseFloat(getComputedStyle(this.carousel).gap || '20');
        const activeIndex = Math.min(Math.round(currentScroll / cardWidth), this.dots.length - 1);

        this.dots.forEach((dot, idx) => {
          dot.classList.toggle('is-active', idx === activeIndex);
        });
      }
    }

    onScroll() {
      window.requestAnimationFrame(() => {
        this.updateNavigationState();
      });
    }

    /* ------------------------------------------------------------------------
       Card & Overlay Click Handling
       ------------------------------------------------------------------------ */
    initCardInteractions() {
      this.cards.forEach((card) => {
        // Main card click
        card.addEventListener('click', (e) => {
          // If clicked inside the shoppable product overlay, let overlay handler process it
          if (e.target.closest('.parizaad-stories__product-overlay')) {
            return;
          }
          this.onCardClick(card);
        });

        // Plus button click inside product overlay
        const plusBtn = card.querySelector('.parizaad-stories__plus-btn');
        if (plusBtn) {
          plusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onPlusButtonClick(plusBtn, card);
          });
        }
      });
    }

    onCardClick(card) {
      const action = card.dataset.cardAction || this.cardClickAction;
      const productUrl = card.dataset.productUrl;
      const instagramUrl = card.dataset.instagramUrl;

      if (action === 'lightbox') {
        this.openLightbox(card);
      } else if (action === 'product' && productUrl) {
        window.location.href = productUrl;
      } else if (action === 'instagram' && instagramUrl) {
        window.open(instagramUrl, '_blank', 'noopener,noreferrer');
      }
    }

    /* ------------------------------------------------------------------------
       Plus Button Action (Quick Add to Cart / Navigate / Quick View)
       ------------------------------------------------------------------------ */
    async onPlusButtonClick(btn, card) {
      const action = this.plusButtonAction;
      const productUrl = card.dataset.productUrl;
      const variantId = btn.dataset.variantId;
      const isAvailable = btn.dataset.available === 'true';
      const hasOnlyDefaultVariant = btn.dataset.hasOnlyDefaultVariant === 'true';

      if (action === 'product' || !variantId || !isAvailable) {
        if (productUrl) {
          window.location.href = productUrl;
        }
        return;
      }

      if (action === 'cart') {
        // If product has multiple variants, navigate to product page so user selects size/options
        if (!hasOnlyDefaultVariant) {
          if (productUrl) {
            window.location.href = productUrl;
          }
          return;
        }

        // Add to cart via AJAX
        btn.classList.add('is-loading');
        btn.disabled = true;

        try {
          const cartAddUrl = (window.routes && window.routes.cart_add_url) || '/cart/add.js';
          const response = await fetch(cartAddUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              id: variantId,
              quantity: 1,
            }),
          });

          const data = await response.json();

          if (response.ok) {
            // Dawn cart update event
            if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
              publish(PUB_SUB_EVENTS.cartUpdate, { source: 'parizaad-instagram-stories', cartData: data });
            }

            // Update cart bubble counter
            const cartResp = await fetch('/cart.js');
            if (cartResp.ok) {
              const cartData = await cartResp.json();
              document.querySelectorAll('.cart-count-bubble span:first-child').forEach((bubble) => {
                bubble.textContent = cartData.item_count;
              });
              const bubbleContainer = document.querySelector('.cart-count-bubble');
              if (bubbleContainer) {
                bubbleContainer.classList.remove('visually-hidden');
              }
            }

            // Open Dawn Cart Drawer if open method exists
            const cartDrawer = document.querySelector('cart-drawer');
            if (cartDrawer && typeof cartDrawer.open === 'function') {
              cartDrawer.open(btn);
            }
          } else {
            console.warn('Cart error:', data.description || data.message);
            if (productUrl) window.location.href = productUrl;
          }
        } catch (err) {
          console.error('Add to cart failed:', err);
          if (productUrl) window.location.href = productUrl;
        } finally {
          btn.classList.remove('is-loading');
          btn.disabled = false;
        }
      } else if (action === 'quickview') {
        if (productUrl) {
          window.location.href = productUrl;
        }
      }
    }

    /* ------------------------------------------------------------------------
       Video Autoplay & Viewport Observer
       ------------------------------------------------------------------------ */
    initVideoObserver() {
      const videos = Array.from(this.querySelectorAll('video.parizaad-stories__media'));
      if (videos.length === 0 || !('IntersectionObserver' in window)) return;

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      this.videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const video = entry.target;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise.catch(() => {
                  // Autoplay policy prevented playback
                });
              }
            } else {
              video.pause();
            }
          });
        },
        { threshold: [0, 0.5, 1] }
      );

      videos.forEach((video) => this.videoObserver.observe(video));
    }

    /* ------------------------------------------------------------------------
       Modal Lightbox
       ------------------------------------------------------------------------ */
    initModal() {
      if (!this.modal) return;

      const closeBtn = this.modal.querySelector('.parizaad-stories-modal__close');
      if (closeBtn) {
        closeBtn.addEventListener('click', this.closeModal);
      }

      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.closeModal();
        }
      });
    }

    openLightbox(card) {
      if (!this.modal) return;

      const mediaWrap = this.modal.querySelector('.parizaad-stories-modal__media-wrap');
      const overlayWrap = this.modal.querySelector('.parizaad-stories-modal__overlay-wrap');
      if (!mediaWrap) return;

      mediaWrap.innerHTML = '';
      if (overlayWrap) overlayWrap.innerHTML = '';

      const isVideo = card.dataset.mediaType === 'video';
      const videoSrc = card.dataset.videoSrc;
      const imgSrc = card.dataset.fullImage;
      const altText = card.dataset.alt || '';

      if (isVideo && videoSrc) {
        const video = document.createElement('video');
        video.src = videoSrc;
        video.className = 'parizaad-stories-modal__media';
        video.autoplay = true;
        video.controls = true;
        video.playsInline = true;
        video.loop = true;
        mediaWrap.appendChild(video);
      } else if (imgSrc) {
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = altText;
        img.className = 'parizaad-stories-modal__media';
        mediaWrap.appendChild(img);
      }

      // Clone shoppable product overlay into modal if present
      const productOverlay = card.querySelector('.parizaad-stories__product-overlay');
      if (productOverlay && overlayWrap) {
        const clonedOverlay = productOverlay.cloneNode(true);
        const clonedPlusBtn = clonedOverlay.querySelector('.parizaad-stories__plus-btn');
        if (clonedPlusBtn) {
          clonedPlusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onPlusButtonClick(clonedPlusBtn, card);
          });
        }
        overlayWrap.appendChild(clonedOverlay);
      }

      this.modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', this.onKeyDown);

      const closeBtn = this.modal.querySelector('.parizaad-stories-modal__close');
      if (closeBtn) closeBtn.focus();
    }

    closeModal() {
      if (!this.modal || !this.modal.classList.contains('is-open')) return;

      // Pause modal video if playing
      const video = this.modal.querySelector('video');
      if (video) video.pause();

      this.modal.classList.remove('is-open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', this.onKeyDown);
    }

    onKeyDown(e) {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    }

    /* ------------------------------------------------------------------------
       Autoplay
       ------------------------------------------------------------------------ */
    startAutoplay() {
      this.stopAutoplay();
      this.autoplayTimer = setInterval(() => {
        if (!this.carousel) return;
        const maxScrollLeft = this.carousel.scrollWidth - this.carousel.clientWidth;
        if (this.carousel.scrollLeft >= maxScrollLeft - 10) {
          this.carousel.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          this.onArrowClick(1);
        }
      }, this.autoplayInterval);
    }

    stopAutoplay() {
      if (this.autoplayTimer) {
        clearInterval(this.autoplayTimer);
        this.autoplayTimer = null;
      }
    }

    /* ------------------------------------------------------------------------
       Shopify Theme Editor Lifecycle
       ------------------------------------------------------------------------ */
    initThemeEditorEvents() {
      if (!Shopify || !Shopify.designMode) return;

      document.addEventListener('shopify:block:select', (event) => {
        if (!this.contains(event.target)) return;
        const blockId = event.detail.blockId;
        const card = this.querySelector(`.parizaad-stories__card[data-block-id="${blockId}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          card.style.outline = '2px solid #121212';
          card.style.outlineOffset = '4px';
        }
      });

      document.addEventListener('shopify:block:deselect', (event) => {
        if (!this.contains(event.target)) return;
        const blockId = event.detail.blockId;
        const card = this.querySelector(`.parizaad-stories__card[data-block-id="${blockId}"]`);
        if (card) {
          card.style.outline = '';
          card.style.outlineOffset = '';
        }
      });
    }
  }

  customElements.define('parizaad-instagram-stories', ParizaadInstagramStories);
}
