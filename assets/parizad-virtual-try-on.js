/**
 * BY PARIZAD VIRTUAL JEWELRY TRY-ON STUDIO
 * Production-Hardened Real Client-Side Computer Vision Engine
 * Uses Self-Hosted Google MediaPipe Tasks Vision (Apache 2.0 License)
 * 100% In-Browser Private Processing — Zero Photo Data Transmitted Across Network
 */

(function () {
  'use strict';

  class ParizadTryOnStudio {
    constructor(container) {
      this.container = container;
      this.canvas = container.querySelector('.parizad-tryon__canvas');
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.viewport = container.querySelector('.parizad-tryon__viewport');
      this.fileInput = container.querySelector('.parizad-tryon__file-input');
      this.dropzone = container.querySelector('.parizad-tryon__upload-dropzone');
      this.statusDot = container.querySelector('.parizad-tryon__status-dot');
      this.statusText = container.querySelector('.parizad-tryon__status-text');

      // Notices
      this.missingCollNotice = container.querySelector('.parizad-tryon__missing-collection');
      this.emptyCollNotice = container.querySelector('.parizad-tryon__empty-collection');
      this.assetNotice = container.querySelector('.parizad-tryon__asset-notice');
      this.cartError = container.querySelector('.parizad-tryon__cart-error');

      // State
      this.isProductPage = container.dataset.isProductPage === 'true';
      this.productCategory = container.dataset.productCategory || 'necklaces';
      this.currentProduct = null;
      this.activeCategory = this.isProductPage ? this.productCategory : (container.dataset.defaultCategory || 'rings');
      this.customerPhoto = null;
      this.photoOriginalWidth = 0;
      this.photoOriginalHeight = 0;
      this.inferenceRequestId = 0;

      // Real MediaPipe AI Models & Local-First Paths
      this.visionModule = null;
      this.handLandmarker = null;
      this.poseLandmarker = null;
      this.detectedLandmarks = null;
      this.showLandmarksOverlay = false;

      this.localJsUrl = container.dataset.mediapipeJsUrl;
      this.localHandModelUrl = container.dataset.handModelUrl;
      this.localPoseModelUrl = container.dataset.poseModelUrl;
      this.localWasmPath = container.dataset.wasmPath;

      // Products from Real Shopify Catalog (Strict Collections)
      this.catalog = {
        rings: { collectionConfigured: false, products: [] },
        bracelets: { collectionConfigured: false, products: [] },
        necklaces: { collectionConfigured: false, products: [] },
      };
      this.selectedProduct = null;
      this.activeJewelryAsset = null;
      this.jewelryImageCache = new Map();

      // Transform state
      this.transform = {
        x: 0.5,
        y: 0.5,
        scale: 1.0,
        rotation: 0,
        opacity: 1.0,
      };

      this.activeFinger = 'ring';
      this.necklaceLength = 'short';
      this.isBeforeAfterActive = false;

      // Drag and Touch interactions
      this.isDragging = false;
      this.dragStartX = 0;
      this.dragStartY = 0;
      this.transformStartPos = { x: 0, y: 0 };

      this.maxUploadBytes = parseInt(container.dataset.maxUploadMb || '15', 10) * 1024 * 1024;

      this.init();
    }

    async init() {
      if (this.isProductPage) {
        this.loadCurrentProduct();
        this.initProductModeVariantSync();
      } else {
        this.loadShopifyCatalog();
        this.initTabs();
      }

      this.initPhotoUpload();
      this.initSliders();
      this.initActionButtons();
      this.initCanvasInteractions();
      this.initGuidelinesModal();

      this.switchCategory(this.activeCategory);
    }

    /* ------------------------------------------------------------------------
       1. Product Mode & Strict Shopify Catalog Loading
       ------------------------------------------------------------------------ */
    loadCurrentProduct() {
      const sectionId = this.container.dataset.sectionId;
      const script = document.getElementById(`ParizadTryonProduct-${sectionId}`);
      if (script) {
        try {
          this.currentProduct = JSON.parse(script.textContent);
          this.selectedProduct = this.currentProduct;
        } catch (err) {
          console.error('Failed to parse current product JSON:', err);
        }
      }
    }

    initProductModeVariantSync() {
      if (!this.isProductPage || !this.currentProduct) return;

      // 1. Internal variant select within try-on panel
      const variantSelect = this.container.querySelector('.parizad-tryon__variant-select');
      if (variantSelect) {
        variantSelect.addEventListener('change', () => {
          const opt = variantSelect.selectedOptions[0];
          if (!opt) return;
          const variantId = parseInt(variantSelect.value, 10);
          const price = opt.dataset.price;
          const available = opt.dataset.available === 'true';
          this.updateActiveVariant(variantId, price, available);
        });
      }

      // 2. Synchronize from Dawn's native variant selectors (variant-radios, variant-selects)
      document.addEventListener('change', (e) => {
        const picker = e.target.closest('variant-radios, variant-selects');
        if (picker) {
          const variantId = picker.currentVariant ? picker.currentVariant.id : parseInt(e.target.value, 10);
          if (variantId && this.currentProduct && this.currentProduct.variants) {
            const match = this.currentProduct.variants.find((v) => v.id === variantId);
            if (match) {
              this.updateActiveVariant(match.id, match.price, match.available);
              if (variantSelect) variantSelect.value = match.id;
            }
          }
        }
      });
    }

    updateActiveVariant(variantId, priceText, available) {
      if (!this.selectedProduct) return;
      this.selectedProduct.variantId = variantId;
      this.selectedProduct.available = available;
      if (priceText) this.selectedProduct.price = priceText;

      const priceEl = this.container.querySelector('[data-summary-price]');
      if (priceEl && priceText) priceEl.textContent = priceText;

      const availBadge = this.container.querySelector('[data-summary-avail]');
      if (availBadge) {
        availBadge.className = `parizad-tryon__avail-badge ${available ? 'is-available' : 'is-sold-out'}`;
        availBadge.textContent = available ? 'In Stock' : 'Sold Out';
      }

      const cartBtn = this.container.querySelector('.parizad-tryon__cart-btn');
      if (cartBtn) {
        cartBtn.disabled = !available;
        const cartText = cartBtn.querySelector('.parizad-tryon__cart-text');
        if (cartText) cartText.textContent = available ? 'Add to Cart' : 'Sold Out';
      }
    }

    loadShopifyCatalog() {
      const sectionId = this.container.dataset.sectionId;
      const script = document.getElementById(`ParizadTryonCatalog-${sectionId}`);
      if (script) {
        try {
          this.catalog = JSON.parse(script.textContent);
        } catch (err) {
          console.error('Failed to parse strict Shopify catalog JSON:', err);
        }
      }
    }

    renderProductsList() {
      if (this.isProductPage) {
        if (this.currentProduct) {
          this.selectProduct(this.currentProduct);
        }
        return;
      }

      const grid = this.container.querySelector('.parizad-tryon__products-grid');
      if (!grid) return;

      grid.innerHTML = '';
      if (this.missingCollNotice) this.missingCollNotice.style.display = 'none';
      if (this.emptyCollNotice) this.emptyCollNotice.style.display = 'none';
      if (this.assetNotice) this.assetNotice.style.display = 'none';

      const categoryData = this.catalog[this.activeCategory] || { collectionConfigured: false, products: [] };

      // Phase 2: Handle unconfigured collections
      if (!categoryData.collectionConfigured) {
        if (this.missingCollNotice) {
          this.missingCollNotice.style.display = 'block';
          const p = this.missingCollNotice.querySelector('p:last-child');
          if (p) p.textContent = `Please select a ${this.getCategoryDisplayName(this.activeCategory)} collection in Theme Editor.`;
        }
        this.selectProduct(null);
        return;
      }

      // Phase 2: Handle empty collections
      if (!categoryData.products || categoryData.products.length === 0) {
        if (this.emptyCollNotice) {
          this.emptyCollNotice.style.display = 'block';
          const p = this.emptyCollNotice.querySelector('p');
          if (p) p.textContent = `No products found in the selected ${this.getCategoryDisplayName(this.activeCategory)} collection.`;
        }
        this.selectProduct(null);
        return;
      }

      // Render actual Shopify collection products
      categoryData.products.forEach((product, index) => {
        const card = document.createElement('div');
        card.className = `parizad-tryon__product-card ${index === 0 ? 'is-selected' : ''}`;
        card.dataset.productId = product.id;
        card.dataset.variantId = product.variantId;

        const thumbImg = product.featuredImage
          ? `<img src="${product.featuredImage}" alt="${this.escapeHtml(product.title)}" loading="lazy">`
          : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1rem;color:#888;">No Photo</div>`;

        const assetBadge = product.hasTryonAsset
          ? `<span style="position:absolute;top:6px;right:6px;background:#2E6B38;color:#FFF;border-radius:10px;padding:2px 6px;font-size:0.95rem;font-weight:600;">TRY-ON</span>`
          : ``;

        card.innerHTML = `
          ${assetBadge}
          <div class="parizad-tryon__product-thumb">${thumbImg}</div>
          <span class="parizad-tryon__product-name">${this.escapeHtml(product.title)}</span>
          <span class="parizad-tryon__product-price">${product.price}</span>
        `;

        card.addEventListener('click', () => {
          grid.querySelectorAll('.parizad-tryon__product-card').forEach((c) => c.classList.remove('is-selected'));
          card.classList.add('is-selected');
          this.selectProduct(product);
        });

        grid.appendChild(card);
      });

      if (categoryData.products.length > 0) {
        this.selectProduct(categoryData.products[0]);
      }
    }

    selectProduct(product) {
      this.selectedProduct = product;
      this.activeJewelryAsset = null;

      const viewBtn = this.container.querySelector('.parizad-tryon__view-btn');
      const cartBtn = this.container.querySelector('.parizad-tryon__cart-btn');
      if (this.cartError) this.cartError.style.display = 'none';

      if (!product) {
        if (viewBtn) {
          viewBtn.href = '#';
          viewBtn.style.pointerEvents = 'none';
          viewBtn.style.opacity = '0.5';
        }
        if (cartBtn) cartBtn.disabled = true;
        this.renderCanvas();
        return;
      }

      if (viewBtn) {
        if (this.isProductPage) {
          viewBtn.href = '#MainContent';
        } else {
          viewBtn.href = product.url || '#';
        }
        viewBtn.style.pointerEvents = 'auto';
        viewBtn.style.opacity = '1';
      }

      if (cartBtn) {
        cartBtn.disabled = !product.available || !product.variantId;
        const textSpan = cartBtn.querySelector('.parizad-tryon__cart-text');
        if (textSpan) {
          textSpan.textContent = product.available ? 'Add to Cart' : 'Sold Out';
        }
      }

      // Phase 3: Strict Transparent Try-On Asset Metafield Checking
      if (!product.hasTryonAsset || !product.tryonAssetUrl) {
        if (this.assetNotice) this.assetNotice.style.display = 'block';
        this.activeJewelryAsset = null;
        this.renderCanvas();
        return;
      }

      if (this.assetNotice) this.assetNotice.style.display = 'none';
      this.loadProductTryonAsset(product);
    }

    loadProductTryonAsset(product) {
      const url = product.tryonAssetUrl;

      if (this.jewelryImageCache.has(url)) {
        this.activeJewelryAsset = this.jewelryImageCache.get(url);
        this.renderCanvas();
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const assetObj = {
          img,
          aspectRatio: img.naturalWidth / img.naturalHeight,
          defaultScale: product.defaultScale != null ? product.defaultScale : 1.0,
          rotationOffset: product.rotationOffset != null ? product.rotationOffset : 0,
          anchorX: product.anchorX != null ? product.anchorX : 0.5,
          anchorY: product.anchorY != null ? product.anchorY : 0.5,
        };
        this.jewelryImageCache.set(url, assetObj);
        if (this.selectedProduct && this.selectedProduct.id === product.id) {
          this.activeJewelryAsset = assetObj;
          this.renderCanvas();
        }
      };
      img.onerror = () => {
        console.warn('Could not load transparent try-on asset from:', url);
        if (this.assetNotice) this.assetNotice.style.display = 'block';
        this.activeJewelryAsset = null;
        this.renderCanvas();
      };
      img.src = url;
    }

    /* ------------------------------------------------------------------------
       2. Real MediaPipe Tasks Vision Inference Engine (100% Self-Hosted Runtime)
       ------------------------------------------------------------------------ */
    async getVisionModule() {
      if (this.visionModule) return this.visionModule;

      this.updateStatus('Loading self-hosted MediaPipe AI vision runtime...', 'detecting');
      try {
        // Load vendored local asset from Shopify theme assets
        const vision = await import(this.localJsUrl);
        this.visionModule = vision;
        return vision;
      } catch (err) {
        console.error('Self-hosted MediaPipe JS import failed:', err);
        throw new Error(
          `Failed to load self-hosted MediaPipe runtime from '${this.localJsUrl}'. ` +
          `Shopify theme assets do not serve binary/ESM modules without appropriate MIME configuration. (${err.message})`
        );
      }
    }

    async getHandLandmarker() {
      if (this.handLandmarker) return this.handLandmarker;

      const vision = await this.getVisionModule();
      this.updateStatus('Initializing self-hosted Hand Landmarker neural model...', 'detecting');

      // Strictly use local vendored WASM binaries
      const cleanWasmPath = (this.localWasmPath || '').replace(/\/+$/, '');
      const fileset = await vision.FilesetResolver.forVisionTasks(cleanWasmPath);

      // Strictly use local vendored task model asset
      this.handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: this.localHandModelUrl,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });

      return this.handLandmarker;
    }

    async getPoseLandmarker() {
      if (this.poseLandmarker) return this.poseLandmarker;

      const vision = await this.getVisionModule();
      this.updateStatus('Initializing self-hosted Pose Landmarker neural model...', 'detecting');

      // Strictly use local vendored WASM binaries
      const cleanWasmPath = (this.localWasmPath || '').replace(/\/+$/, '');
      const fileset = await vision.FilesetResolver.forVisionTasks(cleanWasmPath);

      // Strictly use local vendored task model asset
      this.poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: this.localPoseModelUrl,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });

      return this.poseLandmarker;
    }

    async runAutomaticLandmarkFitting() {
      if (!this.customerPhoto) return;

      const currentReqId = ++this.inferenceRequestId;
      this.updateStatus('Running MediaPipe neural inference on photograph...', 'detecting');

      try {
        if (this.activeCategory === 'rings' || this.activeCategory === 'bracelets') {
          const landmarker = await this.getHandLandmarker();
          if (this.inferenceRequestId !== currentReqId || !this.customerPhoto) return;

          // Perform real image inference
          const result = landmarker.detect(this.customerPhoto);

          if (!result.landmarks || result.landmarks.length === 0) {
            this.detectedLandmarks = null;
            this.updateStatus('No hand detected in photo. Switched to precision manual mode.', 'error');
            this.renderCanvas();
            return;
          }

          const handLandmarks = result.landmarks[0];
          this.detectedLandmarks = { type: 'hand', landmarks: handLandmarks };

          if (this.activeCategory === 'rings') {
            this.fitRingToDetectedLandmarks(handLandmarks);
          } else {
            this.fitBraceletToDetectedLandmarks(handLandmarks);
          }
        } else if (this.activeCategory === 'necklaces') {
          const landmarker = await this.getPoseLandmarker();
          if (this.inferenceRequestId !== currentReqId || !this.customerPhoto) return;

          const result = landmarker.detect(this.customerPhoto);

          if (!result.landmarks || result.landmarks.length === 0) {
            this.detectedLandmarks = null;
            this.updateStatus('No body/shoulders detected. Switched to precision manual mode.', 'error');
            this.renderCanvas();
            return;
          }

          const poseLandmarks = result.landmarks[0];
          this.detectedLandmarks = { type: 'pose', landmarks: poseLandmarks };
          this.fitNecklaceToDetectedLandmarks(poseLandmarks);
        }

        this.syncSlidersFromTransform();
        this.renderCanvas();
      } catch (err) {
        console.warn('Real AI detection execution error:', err);
        const detailMsg = err.message ? `: ${err.message}` : '';
        this.updateStatus(`Self-hosted AI error${detailMsg}. Switched to precision manual mode.`, 'error');
        this.renderCanvas();
      }
    }

    // A1: Hand Landmark Ring Fitting (Phase 4 - Anatomical Accuracy)
    fitRingToDetectedLandmarks(landmarks) {
      const W = this.photoOriginalWidth;
      const H = this.photoOriginalHeight;

      const fingerIndices = {
        thumb: { mcp: 2, pip: 3, dip: 4 },
        index: { mcp: 5, pip: 6, dip: 7 },
        middle: { mcp: 9, pip: 10, dip: 11 },
        ring: { mcp: 13, pip: 14, dip: 15 },
        pinky: { mcp: 17, pip: 18, dip: 19 },
      };

      const finger = fingerIndices[this.activeFinger] || fingerIndices.ring;
      const mcp = landmarks[finger.mcp];
      const pip = landmarks[finger.pip];

      // Proximal phalanx: ring rests naturally in the lower third closer to MCP (60% MCP, 40% PIP)
      const ringX = mcp.x * 0.60 + pip.x * 0.40;
      const ringY = mcp.y * 0.60 + pip.y * 0.40;

      // Finger direction vector from base knuckle to PIP
      const dx = (pip.x - mcp.x) * W;
      const dy = (pip.y - mcp.y) * H;
      const fingerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

      // Ring slips perpendicular to finger direction
      const ringRotation = fingerAngle + 90;

      // Proportional scale: derived from proximal phalanx length
      const proxLen = Math.sqrt(dx * dx + dy * dy);
      const baseDim = W * 0.45;
      const fittedScale = Math.max(0.12, Math.min(1.8, (proxLen * 0.62) / baseDim));

      this.transform.x = ringX;
      this.transform.y = ringY;
      this.transform.rotation = Math.round(ringRotation);
      this.transform.scale = parseFloat(fittedScale.toFixed(2));
      this.transform.opacity = 1.0;

      this.updateStatus(`Hand landmarks detected: Ring fitted to ${this.activeFinger} finger`, 'ready');
    }

    // A2: Wrist Landmark Bracelet Fitting (Phase 4 - Anatomical Accuracy)
    fitBraceletToDetectedLandmarks(landmarks) {
      const W = this.photoOriginalWidth;
      const H = this.photoOriginalHeight;

      const wrist = landmarks[0];
      const middleMcp = landmarks[9];

      // Vector pointing UP the forearm away from hand
      const vx = (wrist.x - middleMcp.x) * W;
      const vy = (wrist.y - middleMcp.y) * H;
      const armAngle = (Math.atan2(vy, vx) * 180) / Math.PI;

      const braceletRot = armAngle + 90;
      const normV = Math.sqrt(vx * vx + vy * vy);
      // Place ~20% of hand length proximal to wrist joint
      const offsetDist = normV > 0 ? normV * 0.20 : 0;
      const posX = wrist.x + (vx / (normV || 1)) * (offsetDist / W);
      const posY = wrist.y + (vy / (normV || 1)) * (offsetDist / H);

      // Palm breadth across Index MCP (5) and Pinky MCP (17)
      const palmDx = (landmarks[17].x - landmarks[5].x) * W;
      const palmDy = (landmarks[17].y - landmarks[5].y) * H;
      const palmBreadth = Math.sqrt(palmDx * palmDx + palmDy * palmDy);
      const baseDim = W * 0.45;
      // Wrist breadth is roughly 88% of palm breadth
      const fittedScale = Math.max(0.2, Math.min(2.0, (palmBreadth * 0.88) / baseDim));

      this.transform.x = posX;
      this.transform.y = posY;
      this.transform.rotation = Math.round(braceletRot);
      this.transform.scale = parseFloat(fittedScale.toFixed(2));
      this.transform.opacity = 1.0;

      this.updateStatus('Wrist landmarks detected: Bracelet fitted across forearm', 'ready');
    }

    // A3: Pose Landmark Necklace Fitting (Phase 4 - Anatomical Accuracy)
    fitNecklaceToDetectedLandmarks(landmarks) {
      const W = this.photoOriginalWidth;
      const H = this.photoOriginalHeight;

      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];

      const midX = (leftShoulder.x + rightShoulder.x) / 2;
      const midY = (leftShoulder.y + rightShoulder.y) / 2;

      // Vector from Right Shoulder (12) to Left Shoulder (11) (viewer left-to-right)
      const sx = (leftShoulder.x - rightShoulder.x) * W;
      const sy = (leftShoulder.y - rightShoulder.y) * H;
      const shoulderSpan = Math.sqrt(sx * sx + sy * sy);
      const shoulderTilt = (Math.atan2(sy, sx) * 180) / Math.PI;

      // Normal vector pointing straight down the sternum
      const ux = -sy / (shoulderSpan || 1);
      const uy = sx / (shoulderSpan || 1);

      const lengthFactors = {
        choker: 0.12,
        short: 0.28,
        medium: 0.48,
        long: 0.70,
      };

      const dropPx = shoulderSpan * (lengthFactors[this.necklaceLength] || 0.28);
      const posX = midX + (ux * dropPx) / W;
      const posY = midY + (uy * dropPx) / H;

      const baseDim = W * 0.45;
      const fittedScale = Math.max(0.25, Math.min(2.2, (shoulderSpan * 0.65) / baseDim));

      this.transform.x = posX;
      this.transform.y = posY;
      this.transform.rotation = Math.round(shoulderTilt);
      this.transform.scale = parseFloat(fittedScale.toFixed(2));
      this.transform.opacity = 1.0;

      this.updateStatus(`Pose landmarks detected: Necklace fitted to neckline (${this.necklaceLength} drape)`, 'ready');
    }

    /* ------------------------------------------------------------------------
       3. Photo Lifecycle Management (Phase 6)
       ------------------------------------------------------------------------ */
    initPhotoUpload() {
      if (!this.dropzone || !this.fileInput) return;

      const browseBtn = this.container.querySelector('.parizad-tryon__upload-btn');
      if (browseBtn) {
        browseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.fileInput.click();
        });
      }

      this.dropzone.addEventListener('click', () => {
        this.fileInput.click();
      });

      this.fileInput.addEventListener('change', () => {
        if (this.fileInput.files && this.fileInput.files[0]) {
          this.loadCustomerPhoto(this.fileInput.files[0]);
          this.fileInput.value = '';
        }
      });

      // Drag and drop
      ['dragenter', 'dragover'].forEach((event) => {
        this.viewport.addEventListener(event, (e) => {
          e.preventDefault();
          this.viewport.style.borderColor = '#121212';
        });
      });

      ['dragleave', 'drop'].forEach((event) => {
        this.viewport.addEventListener(event, (e) => {
          e.preventDefault();
          this.viewport.style.borderColor = '';
        });
      });

      this.viewport.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.loadCustomerPhoto(e.dataTransfer.files[0]);
        }
      });
    }

    loadCustomerPhoto(file) {
      if (file.size > this.maxUploadBytes) {
        alert(
          `File size exceeds limit (${Math.round(this.maxUploadBytes / (1024 * 1024))}MB). Please choose a smaller photo.`
        );
        return;
      }

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        alert('Please upload a valid JPEG, PNG, or WebP photograph.');
        return;
      }

      this.updateStatus('Loading photograph locally...', 'detecting');

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        // Downscale safely to max 1600px to maintain 60fps canvas performance
        const maxDimension = 1600;
        let targetWidth = img.naturalWidth;
        let targetHeight = img.naturalHeight;

        if (targetWidth > maxDimension || targetHeight > maxDimension) {
          if (targetWidth > targetHeight) {
            targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
            targetWidth = maxDimension;
          } else {
            targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
            targetHeight = maxDimension;
          }
        }

        const downscaleCanvas = document.createElement('canvas');
        downscaleCanvas.width = targetWidth;
        downscaleCanvas.height = targetHeight;
        const downscaleCtx = downscaleCanvas.getContext('2d');
        downscaleCtx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const processedImg = new Image();
        processedImg.onload = () => {
          this.customerPhoto = processedImg;
          this.photoOriginalWidth = targetWidth;
          this.photoOriginalHeight = targetHeight;

          if (this.viewport) {
            this.viewport.classList.add('has-photo');
          }

          this.runAutomaticLandmarkFitting();
        };
        processedImg.src = downscaleCanvas.toDataURL('image/jpeg', 0.92);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        this.updateStatus('Error loading image file.', 'error');
      };

      img.src = objectUrl;
    }

    removeCustomerPhoto() {
      this.customerPhoto = null;
      this.detectedLandmarks = null;
      this.inferenceRequestId++; // invalidate any active background inference

      if (this.viewport) {
        this.viewport.classList.remove('has-photo');
      }

      this.transform.x = 0.5;
      this.transform.y = 0.5;
      this.transform.rotation = 0;
      this.transform.scale = 1.0;

      this.syncSlidersFromTransform();
      this.updateStatus('Upload a photograph to run MediaPipe landmark fitting', 'ready');

      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    /* ------------------------------------------------------------------------
       4. Real Shopify Cart Add Action (Phase 5)
       ------------------------------------------------------------------------ */
    async addProductToShopifyCart() {
      const cartBtn = this.container.querySelector('.parizad-tryon__cart-btn');
      const textSpan = cartBtn ? cartBtn.querySelector('.parizad-tryon__cart-text') : null;

      if (this.cartError) this.cartError.style.display = 'none';

      if (!this.selectedProduct || !this.selectedProduct.variantId || this.selectedProduct.variantId === 0) {
        if (this.cartError) {
          this.cartError.textContent = 'Selected product does not have an active purchasable variant.';
          this.cartError.style.display = 'block';
        }
        return;
      }

      if (!this.selectedProduct.available) {
        if (this.cartError) {
          this.cartError.textContent = 'This product is currently out of stock.';
          this.cartError.style.display = 'block';
        }
        return;
      }

      if (cartBtn) cartBtn.disabled = true;
      if (textSpan) textSpan.textContent = 'Adding...';

      try {
        const cartAddUrl = (window.routes && window.routes.cart_add_url) || '/cart/add.js';
        const response = await fetch(cartAddUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            id: this.selectedProduct.variantId,
            quantity: 1,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          if (textSpan) textSpan.textContent = 'Added to Cart ✓';

          // Trigger Dawn's cart update pubsub event
          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
            publish(PUB_SUB_EVENTS.cartUpdate, { source: 'parizad-tryon', cartData: data });
          }

          // Update header cart counter badge
          const cartResp = await fetch('/cart.js');
          if (cartResp.ok) {
            const cartData = await cartResp.json();
            document.querySelectorAll('.cart-count-bubble span:first-child').forEach((bubble) => {
              bubble.textContent = cartData.item_count;
            });
            const bubbleWrap = document.querySelector('.cart-count-bubble');
            if (bubbleWrap) bubbleWrap.classList.remove('visually-hidden');
          }

          // Open Dawn cart-drawer if available
          const cartDrawer = document.querySelector('cart-drawer');
          if (cartDrawer && typeof cartDrawer.open === 'function') {
            cartDrawer.open(cartBtn);
          }

          setTimeout(() => {
            if (textSpan) textSpan.textContent = 'Add to Cart';
            if (cartBtn) cartBtn.disabled = false;
          }, 2000);
        } else {
          const errMsg = data.description || data.message || 'Could not add this product to your cart.';
          if (this.cartError) {
            this.cartError.textContent = errMsg;
            this.cartError.style.display = 'block';
          }
          if (textSpan) textSpan.textContent = 'Add to Cart';
          if (cartBtn) cartBtn.disabled = false;
        }
      } catch (err) {
        console.error('Cart add error:', err);
        if (this.cartError) {
          this.cartError.textContent = 'Network error while adding to cart. Please try again.';
          this.cartError.style.display = 'block';
        }
        if (textSpan) textSpan.textContent = 'Add to Cart';
        if (cartBtn) cartBtn.disabled = false;
      }
    }

    /* ------------------------------------------------------------------------
       5. Tabs, Sliders & Toolbar Actions
       ------------------------------------------------------------------------ */
    initTabs() {
      const tabs = this.container.querySelectorAll('.parizad-tryon__tab');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => t.classList.remove('is-active'));
          tab.classList.add('is-active');
          const category = tab.dataset.category;
          this.switchCategory(category);
        });
      });
    }

    switchCategory(category) {
      this.activeCategory = category;

      const fingerGroup = this.container.querySelector('.parizad-tryon__finger-group');
      const necklaceGroup = this.container.querySelector('.parizad-tryon__necklace-group');

      if (fingerGroup) fingerGroup.style.display = category === 'rings' ? 'flex' : 'none';
      if (necklaceGroup) necklaceGroup.style.display = category === 'necklaces' ? 'flex' : 'none';

      this.renderProductsList();

      if (this.customerPhoto) {
        this.runAutomaticLandmarkFitting();
      } else {
        this.renderCanvas();
      }
    }

    initSliders() {
      const bind = (selector, param, formatter) => {
        const slider = this.container.querySelector(selector);
        if (!slider) return;
        const valSpan = slider.closest('.parizad-tryon__slider-group')?.querySelector('.parizad-tryon__slider-val');

        slider.addEventListener('input', () => {
          const val = parseFloat(slider.value);
          this.transform[param] = val;
          if (valSpan && formatter) valSpan.textContent = formatter(val);
          this.renderCanvas();
        });
      };

      bind('.parizad-tryon__slider--scale', 'scale', (v) => `${Math.round(v * 100)}%`);
      bind('.parizad-tryon__slider--rotation', 'rotation', (v) => `${Math.round(v)}°`);
      bind('.parizad-tryon__slider--x', 'x', (v) => `${Math.round(v * 100)}%`);
      bind('.parizad-tryon__slider--y', 'y', (v) => `${Math.round(v * 100)}%`);
      bind('.parizad-tryon__slider--opacity', 'opacity', (v) => `${Math.round(v * 100)}%`);

      // Finger pills
      const fingerPills = this.container.querySelectorAll('.parizad-tryon__finger-pill');
      fingerPills.forEach((pill) => {
        pill.addEventListener('click', () => {
          fingerPills.forEach((p) => p.classList.remove('is-active'));
          pill.classList.add('is-active');
          this.activeFinger = pill.dataset.finger;
          if (this.detectedLandmarks && this.detectedLandmarks.type === 'hand') {
            this.fitRingToDetectedLandmarks(this.detectedLandmarks.landmarks);
            this.syncSlidersFromTransform();
            this.renderCanvas();
          } else {
            this.runAutomaticLandmarkFitting();
          }
        });
      });

      // Necklace length drape pills
      const lengthPills = this.container.querySelectorAll('.parizad-tryon__length-pill');
      lengthPills.forEach((pill) => {
        pill.addEventListener('click', () => {
          lengthPills.forEach((p) => p.classList.remove('is-active'));
          pill.classList.add('is-active');
          this.necklaceLength = pill.dataset.length;
          if (this.detectedLandmarks && this.detectedLandmarks.type === 'pose') {
            this.fitNecklaceToDetectedLandmarks(this.detectedLandmarks.landmarks);
            this.syncSlidersFromTransform();
            this.renderCanvas();
          } else {
            this.runAutomaticLandmarkFitting();
          }
        });
      });
    }

    syncSlidersFromTransform() {
      const update = (selector, val, formatter) => {
        const slider = this.container.querySelector(selector);
        if (slider) {
          slider.value = val;
          const valSpan = slider.closest('.parizad-tryon__slider-group')?.querySelector('.parizad-tryon__slider-val');
          if (valSpan && formatter) valSpan.textContent = formatter(val);
        }
      };

      update('.parizad-tryon__slider--scale', this.transform.scale, (v) => `${Math.round(v * 100)}%`);
      update('.parizad-tryon__slider--rotation', this.transform.rotation, (v) => `${Math.round(v)}°`);
      update('.parizad-tryon__slider--x', this.transform.x, (v) => `${Math.round(v * 100)}%`);
      update('.parizad-tryon__slider--y', this.transform.y, (v) => `${Math.round(v * 100)}%`);
      update('.parizad-tryon__slider--opacity', this.transform.opacity, (v) => `${Math.round(v * 100)}%`);
    }

    initActionButtons() {
      const autofitBtn = this.container.querySelector('.parizad-tryon__btn--autofit');
      const landmarksBtn = this.container.querySelector('.parizad-tryon__btn--landmarks');
      const beforeAfterBtn = this.container.querySelector('.parizad-tryon__btn--before-after');
      const resetBtn = this.container.querySelector('.parizad-tryon__btn--reset');
      const changePhotoBtn = this.container.querySelector('.parizad-tryon__btn--change-photo');
      const removePhotoBtn = this.container.querySelector('.parizad-tryon__btn--remove-photo');
      const cartBtn = this.container.querySelector('.parizad-tryon__cart-btn');

      if (autofitBtn) {
        autofitBtn.addEventListener('click', () => this.runAutomaticLandmarkFitting());
      }

      if (landmarksBtn) {
        landmarksBtn.addEventListener('click', () => {
          this.showLandmarksOverlay = !this.showLandmarksOverlay;
          landmarksBtn.classList.toggle('is-active', this.showLandmarksOverlay);
          this.renderCanvas();
        });
      }

      if (beforeAfterBtn) {
        beforeAfterBtn.addEventListener('click', () => {
          this.isBeforeAfterActive = !this.isBeforeAfterActive;
          beforeAfterBtn.classList.toggle('is-active', this.isBeforeAfterActive);
          this.renderCanvas();
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          this.runAutomaticLandmarkFitting();
        });
      }

      if (changePhotoBtn) {
        changePhotoBtn.addEventListener('click', () => {
          if (this.fileInput) this.fileInput.click();
        });
      }

      if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => this.removeCustomerPhoto());
      }

      if (cartBtn) {
        cartBtn.addEventListener('click', () => this.addProductToShopifyCart());
      }
    }

    /* ------------------------------------------------------------------------
       6. Canvas Interactions (Direct Pointer / Touch Drag & Wheel Zoom)
       ------------------------------------------------------------------------ */
    initCanvasInteractions() {
      if (!this.canvas) return;

      const getCoords = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - rect.left) / rect.width,
          y: (clientY - rect.top) / rect.height,
        };
      };

      const startDrag = (e) => {
        if (!this.customerPhoto || !this.activeJewelryAsset) return;
        this.isDragging = true;
        this.canvas.classList.add('is-dragging');
        const coords = getCoords(e);
        this.dragStartX = coords.x;
        this.dragStartY = coords.y;
        this.transformStartPos = { x: this.transform.x, y: this.transform.y };
      };

      const moveDrag = (e) => {
        if (!this.isDragging) return;
        e.preventDefault();
        const coords = getCoords(e);
        const dx = coords.x - this.dragStartX;
        const dy = coords.y - this.dragStartY;

        this.transform.x = Math.max(0.02, Math.min(0.98, this.transformStartPos.x + dx));
        this.transform.y = Math.max(0.02, Math.min(0.98, this.transformStartPos.y + dy));

        this.syncSlidersFromTransform();
        this.renderCanvas();
      };

      const endDrag = () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.canvas.classList.remove('is-dragging');
        }
      };

      this.canvas.addEventListener('mousedown', startDrag);
      window.addEventListener('mousemove', moveDrag);
      window.addEventListener('mouseup', endDrag);

      this.canvas.addEventListener('touchstart', startDrag, { passive: true });
      window.addEventListener('touchmove', moveDrag, { passive: false });
      window.addEventListener('touchend', endDrag);

      this.canvas.addEventListener(
        'wheel',
        (e) => {
          if (!this.customerPhoto || !this.activeJewelryAsset) return;
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.05 : -0.05;
          this.transform.scale = Math.max(0.1, Math.min(2.5, this.transform.scale + delta));
          this.syncSlidersFromTransform();
          this.renderCanvas();
        },
        { passive: false }
      );
    }

    /* ------------------------------------------------------------------------
       7. Canvas Render Loop (Only renders real transparent assets)
       ------------------------------------------------------------------------ */
    renderCanvas() {
      if (!this.ctx || !this.canvas || !this.customerPhoto) return;

      const w = this.photoOriginalWidth;
      const h = this.photoOriginalHeight;

      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }

      this.ctx.clearRect(0, 0, w, h);

      // 1. Draw customer photograph
      this.ctx.drawImage(this.customerPhoto, 0, 0, w, h);

      // Before / After Comparison
      if (this.isBeforeAfterActive) {
        this.drawBeforeBadge();
        return;
      }

      // 2. Draw Detected AI Landmarks (if toggled)
      if (this.showLandmarksOverlay && this.detectedLandmarks) {
        this.drawLandmarksOverlay(w, h);
      }

      // 3. Draw Real Transparent Jewelry Layer (Phase 3: Only if product has a valid asset!)
      if (this.activeJewelryAsset && this.activeJewelryAsset.img) {
        this.ctx.save();

        const renderX = this.transform.x * w;
        const renderY = this.transform.y * h;
        const baseDim = w * 0.45;
        const effectiveScale = this.transform.scale * (this.activeJewelryAsset.defaultScale || 1.0);
        const targetW = baseDim * effectiveScale;
        const targetH = targetW / (this.activeJewelryAsset.aspectRatio || 1);
        const effectiveRotation = this.transform.rotation + (this.activeJewelryAsset.rotationOffset || 0);

        this.ctx.translate(renderX, renderY);
        this.ctx.rotate((effectiveRotation * Math.PI) / 180);
        this.ctx.globalAlpha = this.transform.opacity;

        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        this.ctx.shadowBlur = Math.max(4, Math.round(w * 0.015));
        this.ctx.shadowOffsetY = Math.max(2, Math.round(w * 0.008));

        const anchorX = this.activeJewelryAsset.anchorX != null ? this.activeJewelryAsset.anchorX : 0.5;
        const anchorY = this.activeJewelryAsset.anchorY != null ? this.activeJewelryAsset.anchorY : 0.5;

        this.ctx.drawImage(this.activeJewelryAsset.img, -targetW * anchorX, -targetH * anchorY, targetW, targetH);
        this.ctx.restore();
      }

      // 4. Subtle guide crosshair when dragging
      if (this.isDragging) {
        this.drawAlignmentCrosshair(this.transform.x * w, this.transform.y * h);
      }
    }

    drawLandmarksOverlay(w, h) {
      if (!this.detectedLandmarks || !this.detectedLandmarks.landmarks) return;

      this.ctx.save();
      this.ctx.fillStyle = '#00FFFF';
      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = 2;

      this.detectedLandmarks.landmarks.forEach((pt) => {
        const px = pt.x * w;
        const py = pt.y * h;

        this.ctx.beginPath();
        this.ctx.arc(px, py, Math.max(3, w * 0.006), 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      });

      this.ctx.restore();
    }

    drawBeforeBadge() {
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(18, 18, 18, 0.8)';
      this.ctx.fillRect(20, 20, 150, 36);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = '600 14px sans-serif';
      this.ctx.fillText('ORIGINAL PHOTO', 28, 43);
      this.ctx.restore();
    }

    drawAlignmentCrosshair(x, y) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([4, 4]);

      this.ctx.beginPath();
      this.ctx.moveTo(x - 25, y);
      this.ctx.lineTo(x + 25, y);
      this.ctx.moveTo(x, y - 25);
      this.ctx.lineTo(x, y + 25);
      this.ctx.stroke();

      this.ctx.restore();
    }

    initGuidelinesModal() {
      const modal = this.container.querySelector('.parizad-tryon__guidelines-modal');
      const openBtn = this.container.querySelector('.parizad-tryon__btn--guidelines');
      const closeBtn = this.container.querySelector('.parizad-tryon__guidelines-close');

      if (!modal) return;
      if (openBtn) openBtn.addEventListener('click', () => modal.classList.add('is-open'));
      if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('is-open'));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('is-open');
      });
    }

    updateStatus(message, state) {
      if (this.statusText) this.statusText.textContent = message;
      if (this.statusDot) {
        this.statusDot.className = `parizad-tryon__status-dot is-${state || 'ready'}`;
      }
    }

    capitalize(str) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    }

    getCategoryDisplayName(cat) {
      if (cat === 'necklaces') return 'Necklaces & Pendants';
      return this.capitalize(cat);
    }

    escapeHtml(str) {
      if (!str) return '';
      return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }
  }

  function init() {
    const studios = document.querySelectorAll('.parizad-tryon-section');
    studios.forEach((studio) => new ParizadTryOnStudio(studio));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (event) {
    if (
      event.target.classList.contains('section-parizad-virtual-try-on') ||
      event.target.querySelector('.parizad-tryon-section')
    ) {
      init();
    }
  });
})();
