// header-loader.js

function loadHeader() {
  const headerContainer = document.getElementById('site-header');
  if (!headerContainer) return;

  fetch('header.html')
    .then((response) => response.text())
    .then((html) => {
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