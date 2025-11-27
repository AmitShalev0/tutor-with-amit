// header-loader.js
function isLoggedIn() {
  return !!(window.firebaseAuth && window.firebaseAuth.currentUser);
}

function showCorrectHeader(isLoggedIn) {
  const inHeader = document.getElementById('header-in');
  const outHeader = document.getElementById('header-out');
  if (isLoggedIn) {
    if (inHeader) inHeader.style.display = '';
    if (outHeader) outHeader.style.display = 'none';
  } else {
    if (inHeader) inHeader.style.display = 'none';
    if (outHeader) outHeader.style.display = '';
  }
}

function loadHeader() {
  const headerContainer = document.getElementById('site-header');
  if (!headerContainer) return;
  fetch('header.html')
    .then(response => response.text())
    .then(html => {
      headerContainer.innerHTML = html;
      // Wait for Firebase Auth to be ready
      if (window.firebaseAuth && window.firebaseOnAuth) {
        window.firebaseOnAuth(window.firebaseAuth, user => {
          showCorrectHeader(!!user);
        });
      } else {
        // Fallback: always show logged-out header
        showCorrectHeader(false);
      }
    });
}

document.addEventListener('DOMContentLoaded', loadHeader);