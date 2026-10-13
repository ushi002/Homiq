// Light / dark appearance. "auto" follows the system setting. The choice is stored per browser;
// <html data-theme> is what the CSS reads (app/theme-dark.css).
import { getStored, setStored, useStored } from './stored';

export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'homiq_theme';

const parse = (t: string | null | undefined): Theme => t === 'light' || t === 'dark' ? t : 'auto';
export const getTheme = (): Theme => parse(getStored(KEY));
// The chosen theme, 'auto' until the browser storage has been read
export const useTheme = (): Theme => parse(useStored(KEY));

export const applyTheme = (theme: Theme = getTheme()) => {
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
};

export const setTheme = (theme: Theme) => {
    setStored(KEY, theme === 'auto' ? null : theme);
    applyTheme(theme);
};

// Runs in <head> before the page is painted, so a dark page never flashes white (same logic as applyTheme)
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
