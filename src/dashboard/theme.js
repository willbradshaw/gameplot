// Apply the saved theme before rendering, falling back to the system preference.
(() => {
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  let savedTheme;
  try {
    savedTheme = localStorage.getItem('theme');
  } catch {
    // The dashboard also works when browser storage is disabled.
  }
  const applyTheme = (dark) => {
    document.documentElement.classList.toggle('dark', dark);
    document.getElementById('theme-toggle')?.setAttribute('aria-pressed', String(dark));
  };
  applyTheme(savedTheme ? savedTheme === 'dark' : preference.matches);
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    applyTheme(document.documentElement.classList.contains('dark'));
    button.addEventListener('click', () => {
      const dark = !document.documentElement.classList.contains('dark');
      savedTheme = dark ? 'dark' : 'light';
      applyTheme(dark);
      try {
        localStorage.setItem('theme', savedTheme);
      } catch {
        // Keep the theme for this page even when it cannot be saved.
      }
    });
  });
})();
