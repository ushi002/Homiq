// Server-safe part of the theme (lib/theme.ts has the client hooks), imported by the root layout
export const THEME_KEY = 'homiq_theme';

// Runs in <head> before the page is painted, so a dark page never flashes white (same logic as applyTheme)
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
