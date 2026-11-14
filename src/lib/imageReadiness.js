/** Wait for visible lazy-loaded images before taking a screenshot. No network requests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SaveBothImages = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  async function waitForVisibleImages(doc, options) {
    const opts = Object.assign({ timeoutMs: 10000, settleMs: 600, pollMs: 100 }, options);
    const win = doc.defaultView;
    const start = Date.now();
    let stableSince = start;
    let previous = '';
    const changedLoading = new Map();
    const decodes = new Map();
    try {
      while (true) {
        const bounds = opts.getBounds ? opts.getBounds() :
          { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };
        const images = Array.from(doc.querySelectorAll('img')).filter(function (img) {
          const r = img.getBoundingClientRect();
          const style = win.getComputedStyle(img);
          return r.width > 0 && r.height > 0 && r.bottom > bounds.top &&
            r.top < bounds.bottom && r.right > bounds.left && r.left < bounds.right &&
            style.display !== 'none' && style.visibility !== 'hidden';
        });
        let pending = 0;
        let failed = 0;
        const signature = images.map(function (img) {
          if (img.loading === 'lazy' && !changedLoading.has(img)) {
            changedLoading.set(img, img.getAttribute('loading'));
            img.loading = 'eager';
          }
          const src = img.currentSrc || img.getAttribute('src') || '';
          if (!src || !img.complete) {
            pending++;
          } else if (!img.naturalWidth) {
            failed++;
          } else if (typeof img.decode === 'function') {
            let entry = decodes.get(img);
            if (!entry || entry.src !== src) {
              entry = { src: src, done: false };
              decodes.set(img, entry);
              // A decode rejection may occur during source changes. Poll the current source again.
              Promise.resolve().then(function () { return img.decode(); }).then(
                function () { entry.done = true; }, function () { entry.done = true; }
              );
            }
            if (!entry.done) pending++;
          }
          const r = img.getBoundingClientRect();
          return [src, img.complete, img.naturalWidth, Math.round(r.top), Math.round(r.height)].join(':');
        }).join('|') + ':' + (doc.scrollingElement || doc.documentElement).scrollHeight;
        if (signature !== previous) {
          previous = signature;
          stableSince = Date.now();
        }
        const now = Date.now();
        if ((!pending && now - stableSince >= opts.settleMs) || now - start >= opts.timeoutMs) {
          // Allow the decoded image to be painted; bounded even in a background tab.
          await new Promise(function (resolve) { setTimeout(resolve, opts.pollMs); });
          return { pending: pending, failed: failed };
        }
        await new Promise(function (resolve) { setTimeout(resolve, opts.pollMs); });
      }
    } finally {
      changedLoading.forEach(function (value, img) {
        if (value === null) img.removeAttribute('loading');
        else img.setAttribute('loading', value);
      });
    }
  }

  return { waitForVisibleImages: waitForVisibleImages };
});
