/**
 * HeroSlider Custom Web Component
 * Ultra-performant, accessible, multimedia slider for Shopify
 * Supports mixed Image & Video slides, autoplay, touch swipe, and Theme Editor events.
 */

if (!customElements.get('hero-slider')) {
  class HeroSlider extends HTMLElement {
    constructor() {
      super();
      this.currentIndex = 0;
      this.autoplayTimer = null;
      this.fallbackTimer = null;
      this.videoEndHandler = null;
      this.isHovered = false;
      this.isInteracting = false;

      this.onPrevClick = this.prev.bind(this);
      this.onNextClick = this.next.bind(this);
      this.onMouseEnter = this.handleMouseEnter.bind(this);
      this.onMouseLeave = this.handleMouseLeave.bind(this);
      this.onKeyDown = this.handleKeyDown.bind(this);
      this.onTouchStart = this.handleTouchStart.bind(this);
      this.onTouchMove = this.handleTouchMove.bind(this);
      this.onTouchEnd = this.handleTouchEnd.bind(this);

      this.onBlockSelect = this.handleBlockSelect.bind(this);
      this.onBlockDeselect = this.handleBlockDeselect.bind(this);
    }

    connectedCallback() {
      this.slides = Array.from(this.querySelectorAll('.hero-slider__slide'));
      if (this.slides.length <= 1) {
        // If single slide or none, activate it and exit
        if (this.slides[0]) this.activateSlide(0);
        return;
      }

      this.dots = Array.from(this.querySelectorAll('.hero-slider__dot, .hero-slider__line'));
      this.prevBtn = this.querySelector('.hero-slider__arrow--prev');
      this.nextBtn = this.querySelector('.hero-slider__arrow--next');
      this.counterCurrent = this.querySelector('.hero-slider__counter--current');

      this.autoplayEnabled = this.getAttribute('data-autoplay') === 'true';
      this.autoplaySpeed = parseInt(this.getAttribute('data-autoplay-speed') || '5000', 10);
      this.videoMode = this.getAttribute('data-video-mode') || 'video_end';
      this.pauseOnHover = this.getAttribute('data-pause-on-hover') === 'true';
      this.loop = this.getAttribute('data-loop') !== 'false';

      // Event Listeners
      if (this.prevBtn) this.prevBtn.addEventListener('click', this.onPrevClick);
      if (this.nextBtn) this.nextBtn.addEventListener('click', this.onNextClick);

      this.dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
          this.goToSlide(index, true);
        });
      });

      if (this.pauseOnHover) {
        this.addEventListener('mouseenter', this.onMouseEnter);
        this.addEventListener('mouseleave', this.onMouseLeave);
      }

      this.addEventListener('keydown', this.onKeyDown);
      this.addEventListener('touchstart', this.onTouchStart, { passive: true });
      this.addEventListener('touchmove', this.onTouchMove, { passive: false });
      this.addEventListener('touchend', this.onTouchEnd, { passive: true });

      // Shopify Theme Editor Events
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:block:deselect', this.onBlockDeselect);

      // Initialize First Slide
      this.activateSlide(0);
    }

    disconnectedCallback() {
      this.clearTimers();
      if (this.prevBtn) this.prevBtn.removeEventListener('click', this.onPrevClick);
      if (this.nextBtn) this.nextBtn.removeEventListener('click', this.onNextClick);
      this.removeEventListener('mouseenter', this.onMouseEnter);
      this.removeEventListener('mouseleave', this.onMouseLeave);
      this.removeEventListener('keydown', this.onKeyDown);
      this.removeEventListener('touchstart', this.onTouchStart);
      this.removeEventListener('touchmove', this.onTouchMove);
      this.removeEventListener('touchend', this.onTouchEnd);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);
    }

    clearTimers() {
      if (this.autoplayTimer) {
        clearTimeout(this.autoplayTimer);
        this.autoplayTimer = null;
      }
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = null;
      }
    }

    prev() {
      let index = this.currentIndex - 1;
      if (index < 0) {
        index = this.loop ? this.slides.length - 1 : 0;
      }
      this.goToSlide(index, true);
    }

    next() {
      let index = this.currentIndex + 1;
      if (index >= this.slides.length) {
        index = this.loop ? 0 : this.slides.length - 1;
      }
      this.goToSlide(index, true);
    }

    goToSlide(index, manualAction = false) {
      if (index === this.currentIndex && this.slides[index].classList.contains('is-active')) return;
      this.clearTimers();
      this.activateSlide(index);
    }

    activateSlide(index) {
      const prevIndex = this.currentIndex;
      this.currentIndex = index;

      // Update Slides Classes
      this.slides.forEach((slide, idx) => {
        const isActive = idx === index;
        slide.classList.toggle('is-active', isActive);
        slide.setAttribute('aria-hidden', !isActive);

        // Slide transition helpers
        slide.classList.toggle('is-prev', idx < index);

        // Video Handling
        const video = slide.querySelector('video');
        if (video) {
          if (isActive) {
            video.currentTime = 0;
            video.muted = true;
            video.playsInline = true;
            const playPromise = video.play();
            if (playPromise !== undefined) {
              playPromise.catch(() => {
                // Autoplay may be restricted by browser power-saving
              });
            }
          } else {
            video.pause();
          }
        }
      });

      // Update Pagination Dots
      this.dots.forEach((dot, idx) => {
        dot.classList.toggle('is-active', idx === index);
        dot.setAttribute('aria-selected', idx === index);
      });

      // Update Counter
      if (this.counterCurrent) {
        this.counterCurrent.textContent = (index + 1).toString().padStart(2, '0');
      }

      // Schedule Next Slide if Autoplay is Enabled
      if (this.autoplayEnabled && !this.isHovered && !this.isInteracting) {
        this.scheduleNextSlide(index);
      }
    }

    scheduleNextSlide(index) {
      this.clearTimers();
      const currentSlide = this.slides[index];
      const video = currentSlide.querySelector('video');
      const overrideDuration = parseInt(currentSlide.dataset.durationOverride || '0', 10);

      // Determine slide duration
      let duration = overrideDuration > 0 ? overrideDuration * 1000 : this.autoplaySpeed;

      if (video && this.videoMode === 'video_end') {
        // Option A: Advance after video ends
        this.videoEndHandler = () => {
          this.next();
        };
        video.addEventListener('ended', this.videoEndHandler, { once: true });

        // Reliable Fallback timer if video stalls or encounters an error
        const maxVideoTime = (video.duration && !isNaN(video.duration) && isFinite(video.duration))
          ? Math.max(video.duration * 1000 + 500, 4000)
          : 15000;

        this.fallbackTimer = setTimeout(() => {
          this.next();
        }, maxVideoTime);
      } else {
        // Option B / Standard image duration
        this.autoplayTimer = setTimeout(() => {
          this.next();
        }, duration);
      }
    }

    handleMouseEnter() {
      this.isHovered = true;
      this.clearTimers();
    }

    handleMouseLeave() {
      this.isHovered = false;
      if (this.autoplayEnabled && !this.isInteracting) {
        this.scheduleNextSlide(this.currentIndex);
      }
    }

    handleKeyDown(event) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.next();
      }
    }

    // Touch Swipe Gestures
    handleTouchStart(event) {
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchStartTime = Date.now();
    }

    handleTouchMove(event) {
      if (!this.touchStartX || !this.touchStartY) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;

      // If horizontal swipe is dominant, prevent vertical scroll jank
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        if (event.cancelable) event.preventDefault();
      }
    }

    handleTouchEnd(event) {
      if (!this.touchStartX) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;
      const timeElapsed = Date.now() - this.touchStartTime;

      if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) && timeElapsed < 800) {
        if (deltaX < 0) {
          this.next();
        } else {
          this.prev();
        }
      }

      this.touchStartX = null;
      this.touchStartY = null;
    }

    // Shopify Theme Editor Integration
    handleBlockSelect(event) {
      const blockId = event.target.dataset.blockId;
      if (!blockId) return;

      const slideIndex = this.slides.findIndex((slide) => slide.dataset.blockId === blockId);
      if (slideIndex !== -1) {
        this.isInteracting = true;
        this.clearTimers();
        this.goToSlide(slideIndex, true);
      }
    }

    handleBlockDeselect() {
      this.isInteracting = false;
      if (this.autoplayEnabled && !this.isHovered) {
        this.scheduleNextSlide(this.currentIndex);
      }
    }
  }

  customElements.define('hero-slider', HeroSlider);
}
