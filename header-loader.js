// header-loader.js

const GA_MEASUREMENT_ID = 'G-4LHV6QPX9J';

function ensureGtag() {
  if (!GA_MEASUREMENT_ID || typeof document === 'undefined') return;
  const existing = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`);
  if (!existing) {
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(gtagScript);
  }
  if (!window.dataLayer) {
    window.dataLayer = [];
    function gtag(){window.dataLayer.push(arguments);} // eslint-disable-line no-inner-declarations
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);
  }
}

function loadHeader() {
  const headerContainer = document.getElementById('site-header');
  if (!headerContainer) return;

  fetch('/header.html')
    .then((response) => response.text())
    .then((html) => {
      ensureGtag();
      headerContainer.innerHTML = html;

      const scripts = headerContainer.querySelectorAll('script');
      scripts.forEach((oldScript) => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value);
        });
        newScript.textContent = oldScript.textContent;
        oldScript.replaceWith(newScript);
      });
    })
    .catch((err) => {
      console.error('Failed to load header:', err);
    });
}

document.addEventListener('DOMContentLoaded', loadHeader);