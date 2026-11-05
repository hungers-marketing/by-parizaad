/**
 * Advanced Contact Us Form — Interactive Controller
 * Handles custom accessible dropdown, conditional order fields,
 * drag-and-drop / clipboard file attachments, and client-side validation.
 */

(function () {
  'use strict';

  function initAdvancedContactForm(container) {
    const form = container.querySelector('form');
    if (!form || form.dataset.advancedInitialized === 'true') return;
    form.dataset.advancedInitialized = 'true';

    // ------------------------------------------------------------------------
    // 1. Custom Contact Reason Dropdown
    // ------------------------------------------------------------------------
    const dropdown = container.querySelector('.contact-dropdown');
    const hiddenSelect = container.querySelector('select[name="contact[Contact Reason]"]');
    const trigger = dropdown ? dropdown.querySelector('.contact-dropdown__trigger') : null;
    const menu = dropdown ? dropdown.querySelector('.contact-dropdown__menu') : null;
    const items = menu ? Array.from(menu.querySelectorAll('.contact-dropdown__item')) : [];
    const triggerLabel = trigger ? trigger.querySelector('.contact-dropdown__label') : null;

    // Conditional Fields
    const conditionalOrderField = container.querySelector('.contact-conditional-field');
    const conditionalDamagedTip = container.querySelector('.contact-conditional-tip');

    function checkConditionalFields(selectedReason) {
      if (!conditionalOrderField) return;

      const reasonLower = (selectedReason || '').toLowerCase();
      const isOrderRelated =
        reasonLower.includes('order') ||
        reasonLower.includes('return') ||
        reasonLower.includes('exchange') ||
        reasonLower.includes('refund');

      const isDamaged = reasonLower.includes('damage');

      conditionalOrderField.classList.toggle('is-visible', isOrderRelated);
      if (conditionalDamagedTip) {
        conditionalDamagedTip.classList.toggle('is-visible', isDamaged);
      }
    }

    if (dropdown && trigger && menu) {
      const toggleDropdown = (open) => {
        const shouldOpen = typeof open === 'boolean' ? open : !dropdown.classList.contains('is-open');
        dropdown.classList.toggle('is-open', shouldOpen);
        trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      };

      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        toggleDropdown();
      });

      items.forEach((item) => {
        item.addEventListener('click', () => {
          const value = item.dataset.value || item.textContent.trim();
          if (hiddenSelect) {
            hiddenSelect.value = value;
            hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }

          if (triggerLabel) {
            triggerLabel.textContent = value;
          }

          dropdown.classList.add('has-selection');
          items.forEach((it) => it.classList.toggle('is-selected', it === item));

          const fieldParent = dropdown.closest('.contact-field');
          if (fieldParent) {
            fieldParent.classList.remove('has-error');
          }

          toggleDropdown(false);
          checkConditionalFields(value);
          trigger.focus();
        });
      });

      // Close on click outside
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
          toggleDropdown(false);
        }
      });

      // Accessible Keyboard Navigation
      dropdown.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          toggleDropdown(false);
          trigger.focus();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!dropdown.classList.contains('is-open')) {
            toggleDropdown(true);
            return;
          }

          const focusedIndex = items.indexOf(document.activeElement);
          let nextIndex = 0;
          if (e.key === 'ArrowDown') {
            nextIndex = focusedIndex < items.length - 1 ? focusedIndex + 1 : 0;
          } else {
            nextIndex = focusedIndex > 0 ? focusedIndex - 1 : items.length - 1;
          }
          if (items[nextIndex]) {
            items[nextIndex].focus();
          }
        }
      });
    }

    // ------------------------------------------------------------------------
    // 2. Optional File Uploads (Drag & Drop, Browse, Clipboard Paste)
    // ------------------------------------------------------------------------
    const uploadBox = container.querySelector('.contact-upload');
    const fileInput = container.querySelector('input[type="file"].contact-upload__native');
    const fileListContainer = container.querySelector('.contact-upload__file-list');
    const hiddenFilesReport = container.querySelector('input[name="contact[Attachments]"]');

    const maxFiles = parseInt(container.dataset.maxFiles || '10', 10);
    const maxTotalBytes = parseInt(container.dataset.maxTotalMb || '50', 10) * 1024 * 1024;
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

    let selectedFiles = [];

    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function renderFileList() {
      if (!fileListContainer) return;
      fileListContainer.innerHTML = '';

      if (selectedFiles.length === 0) {
        if (hiddenFilesReport) hiddenFilesReport.value = '';
        return;
      }

      const reportLines = [];

      selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'contact-upload__file-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'contact-upload__file-name';
        nameSpan.textContent = file.name;

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'contact-upload__file-size';
        sizeSpan.textContent = `(${formatFileSize(file.size)})`;
        nameSpan.appendChild(sizeSpan);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'contact-upload__file-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.setAttribute('aria-label', `Remove ${file.name}`);

        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedFiles.splice(index, 1);
          renderFileList();
        });

        item.appendChild(nameSpan);
        item.appendChild(removeBtn);
        fileListContainer.appendChild(item);

        reportLines.push(`${index + 1}. ${file.name} (${formatFileSize(file.size)})`);
      });

      if (hiddenFilesReport) {
        hiddenFilesReport.value = reportLines.join('\n');
      }
    }

    function addFiles(files) {
      const uploadErrorField = container.querySelector('.contact-upload__error-msg');
      if (uploadErrorField) uploadErrorField.textContent = '';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (selectedFiles.length >= maxFiles) {
          if (uploadErrorField) {
            uploadErrorField.textContent = `Maximum ${maxFiles} files allowed.`;
          }
          break;
        }

        const ext = file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          if (uploadErrorField) {
            uploadErrorField.textContent = `Invalid file format: ${file.name}. Allowed: JPG, PNG, WEBP, PDF.`;
          }
          continue;
        }

        const currentTotalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
        if (currentTotalSize + file.size > maxTotalBytes) {
          if (uploadErrorField) {
            uploadErrorField.textContent = `Total file size exceeds ${container.dataset.maxTotalMb || '50'}MB.`;
          }
          break;
        }

        // Avoid duplicates by name and size
        if (!selectedFiles.some((f) => f.name === file.name && f.size === file.size)) {
          selectedFiles.push(file);
        }
      }

      renderFileList();
    }

    if (uploadBox && fileInput) {
      uploadBox.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          addFiles(fileInput.files);
          fileInput.value = '';
        }
      });

      // Drag and Drop
      ['dragenter', 'dragover'].forEach((eventName) => {
        uploadBox.addEventListener(eventName, (e) => {
          e.preventDefault();
          uploadBox.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        uploadBox.addEventListener(eventName, (e) => {
          e.preventDefault();
          uploadBox.classList.remove('is-dragover');
        });
      });

      uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files) {
          addFiles(e.dataTransfer.files);
        }
      });

      // Clipboard Paste
      window.addEventListener('paste', (e) => {
        if (!e.clipboardData || !e.clipboardData.items) return;
        const items = e.clipboardData.items;
        const pastedFiles = [];

        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              const namedFile = new File([file], `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`, {
                type: file.type,
              });
              pastedFiles.push(namedFile);
            }
          }
        }

        if (pastedFiles.length > 0) {
          addFiles(pastedFiles);
        }
      });
    }

    // ------------------------------------------------------------------------
    // 3. Client-side Validation & Submission
    // ------------------------------------------------------------------------
    const nameInput = form.querySelector('input[name="contact[Name]"], input[name="contact[name]"]');
    const emailInput = form.querySelector('input[name="contact[email]"]');
    const topicInput = form.querySelector('input[name="contact[Topic]"]');
    const messageInput = form.querySelector('textarea[name="contact[body]"], textarea[name="contact[comment]"]');
    const submitBtn = form.querySelector('.contact-form__submit');

    function validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    form.addEventListener('submit', async (e) => {
      let hasError = false;
      let firstInvalidField = null;

      const validateField = (input, condition, errorText) => {
        const fieldParent = input ? input.closest('.contact-field') : null;
        if (!fieldParent) return;

        const errorSpan = fieldParent.querySelector('.contact-field__error-msg');
        if (!condition) {
          fieldParent.classList.add('has-error');
          if (errorSpan && errorText) errorSpan.textContent = errorText;
          if (!firstInvalidField) firstInvalidField = input;
          hasError = true;
        } else {
          fieldParent.classList.remove('has-error');
        }
      };

      // Name
      if (nameInput) {
        validateField(nameInput, nameInput.value.trim().length > 0, 'Please enter your full name.');
      }

      // Email
      if (emailInput) {
        const isEmailValid = emailInput.value.trim().length > 0 && validateEmail(emailInput.value.trim());
        validateField(emailInput, isEmailValid, 'Please enter a valid email address.');
      }

      // Contact Reason
      if (hiddenSelect) {
        const isReasonSelected = hiddenSelect.value && hiddenSelect.value.trim().length > 0;
        validateField(trigger, isReasonSelected, 'Please select a contact reason.');
      }

      // Topic
      if (topicInput) {
        validateField(topicInput, topicInput.value.trim().length > 0, 'Please enter a topic.');
      }

      // Message
      if (messageInput) {
        validateField(messageInput, messageInput.value.trim().length > 0, 'Please tell us the details.');
      }

      if (hasError) {
        e.preventDefault();
        if (firstInvalidField) {
          firstInvalidField.focus();
        }
        return;
      }

      // If an upload endpoint is configured and files were selected, upload them
      const uploadEndpoint = container.dataset.uploadEndpoint;
      if (uploadEndpoint && selectedFiles.length > 0) {
        e.preventDefault();
        if (submitBtn) {
          submitBtn.classList.add('is-loading');
          submitBtn.disabled = true;
        }

        try {
          const formData = new FormData();
          selectedFiles.forEach((file) => formData.append('files[]', file));

          const res = await fetch(uploadEndpoint, {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.urls && Array.isArray(data.urls)) {
              if (hiddenFilesReport) {
                hiddenFilesReport.value = data.urls.join('\n');
              }
            }
          }
        } catch (err) {
          console.warn('Upload endpoint error:', err);
        } finally {
          // Continue native form submission with file links appended
          form.submit();
        }
        return;
      }

      // If valid and no asynchronous upload is required, native submission proceeds
      if (submitBtn) {
        submitBtn.classList.add('is-loading');
      }
    });

    // Clear error on user input
    [nameInput, emailInput, topicInput, messageInput].forEach((input) => {
      if (input) {
        input.addEventListener('input', () => {
          const fieldParent = input.closest('.contact-field');
          if (fieldParent) fieldParent.classList.remove('has-error');
        });
      }
    });
  }

  function init() {
    const containers = document.querySelectorAll('.contact-form-container');
    containers.forEach((container) => initAdvancedContactForm(container));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (event) {
    if (event.target.classList.contains('section-contact-form') || event.target.querySelector('.contact-form-container')) {
      init();
    }
  });
})();
