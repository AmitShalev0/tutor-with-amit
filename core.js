// Lightweight helpers shared on marketing pages

function deriveFaqHrefFromContact(contactHref) {
  if (typeof contactHref !== 'string' || !contactHref.trim()) {
    return 'faq.html';
  }
  const trimmed = contactHref.trim();
  const swapped = trimmed.replace(/contact(\.html)?/i, 'faq$1');
  if (swapped !== trimmed) {
    return swapped;
  }
  if (trimmed.endsWith('/')) {
    return `${trimmed}faq.html`;
  }
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash !== -1) {
    return `${trimmed.slice(0, lastSlash + 1)}faq.html`;
  }
  return 'faq.html';
}

function injectFooterFaqLink() {
  const footers = document.querySelectorAll('.site-footer');
  footers.forEach((footer) => {
    if (!footer || footer.dataset.faqLinkInjected === 'true') {
      return;
    }
    const contactLink = footer.querySelector('a[href*="contact"]');
    if (!contactLink) {
      return;
    }
    if (footer.querySelector('[data-footer-link="faq"]')) {
      footer.dataset.faqLinkInjected = 'true';
      return;
    }
    const faqHref = deriveFaqHrefFromContact(contactLink.getAttribute('href'));
    const separator = document.createTextNode(' · ');
    const faqLink = document.createElement('a');
    faqLink.href = faqHref;
    faqLink.textContent = 'FAQ';
    faqLink.setAttribute('data-footer-link', 'faq');
    if (contactLink.className) {
      faqLink.className = contactLink.className;
    }
    contactLink.after(separator, faqLink);
    footer.dataset.faqLinkInjected = 'true';
  });
}

function setupThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
      document.body.classList.add('light-theme');
      toggle.checked = true;
    } else {
      document.documentElement.classList.remove('light-theme');
      document.body.classList.remove('light-theme');
      toggle.checked = false;
    }
  }

  let stored = localStorage.getItem('site-theme');
  if (!stored) {
    stored = 'dark';
  }
  applyTheme(stored);

  toggle.addEventListener('change', () => {
    const next = toggle.checked ? 'light' : 'dark';
    localStorage.setItem('site-theme', next);
    applyTheme(next);
  });
}

function setYear() {
  const yearSpan = document.getElementById('year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setYear();
  setupThemeToggle();
  injectFooterFaqLink();
});
