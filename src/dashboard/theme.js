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
    let transition;
    button.addEventListener('click', () => {
      const dark = !(savedTheme
        ? savedTheme === 'dark'
        : document.documentElement.classList.contains('dark'));
      savedTheme = dark ? 'dark' : 'light';
      transition?.skipTransition();
      const root = document.documentElement;
      root.classList.add('theme-changing');
      const update = () => applyTheme(dark);
      if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const current = document.startViewTransition(update);
        transition = current;
        // Rapid clicks can skip a transition before its snapshots are ready.
        current.ready.catch(() => {});
        current.finished.finally(() => {
          if (transition === current) {
            root.classList.remove('theme-changing');
            transition = undefined;
          }
        });
      } else {
        update();
        // Resolve the new colours before restoring normal hover transitions.
        getComputedStyle(root).color;
        root.classList.remove('theme-changing');
      }
      try {
        localStorage.setItem('theme', savedTheme);
      } catch {
        // Keep the theme for this page even when it cannot be saved.
      }
    });
  });
})();
