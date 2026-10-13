// Light / dark appearance. "auto" follows the system setting. The choice is stored per browser;
// <html data-theme> is what the CSS reads (app/theme-dark.css).
import { getStored, setStored, useStored } from './stored';
import { THEME_KEY } from './themeBoot';

export type Theme = 'auto' | 'light' | 'dark';

const parse = (t: string | null | undefined): Theme => t === 'light' || t === 'dark' ? t : 'auto';
export const getTheme = (): Theme => parse(getStored(THEME_KEY));
// The chosen theme, 'auto' until the browser storage has been read
export const useTheme = (): Theme => parse(useStored(THEME_KEY));

export const applyTheme = (theme: Theme = getTheme()) => {
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
};

export const setTheme = (theme: Theme) => {
    setStored(THEME_KEY, theme === 'auto' ? null : theme);
    applyTheme(theme);
};
