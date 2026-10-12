// Light / dark appearance. "auto" follows the system setting. The choice is stored per browser;
// <html data-theme> is what the CSS reads (app/theme-dark.css).
export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'homiq_theme';

export const getTheme = (): Theme => {
    try {
        const t = localStorage.getItem(KEY);
        return t === 'light' || t === 'dark' ? t : 'auto';
    } catch {
        return 'auto';
    }
};

export const applyTheme = (theme: Theme = getTheme()) => {
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
};

export const setTheme = (theme: Theme) => {
    try {
        if (theme === 'auto') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, theme);
    } catch {
        // storage unavailable: the choice lasts until reload
    }
    applyTheme(theme);
};

// Runs in <head> before the page is painted, so a dark page never flashes white (same logic as applyTheme)
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
