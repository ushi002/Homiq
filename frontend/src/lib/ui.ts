// Shared Tailwind classes of the recurring building blocks, so the pages look the same and
// a change (or the dark theme in app/theme-dark.css) is made in one place.

// Page background and padding
export const PAGE = 'min-h-screen p-4 sm:p-8 bg-gray-50 text-gray-900';
// White box; on phones it spans the full width without side borders
export const CARD = 'bg-white -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100';
// Form field label and full-width text input / select
export const LABEL = 'block text-sm font-medium text-gray-700';
export const INPUT = 'mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm';
// Small uppercase label and compact select of filter bars (year, month…)
export const FILTER_LABEL = 'block text-xs font-bold text-gray-500 uppercase';
export const FILTER_SELECT = 'rounded-md border-gray-300 shadow-sm border p-1 text-sm';
// Buttons: main action, secondary (outlined) action
export const BUTTON = 'bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50';
export const BUTTON_SECONDARY = 'px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';
// Empty state of a list
export const EMPTY_STATE = 'p-8 bg-white rounded-xl text-center text-gray-400 border border-dashed border-gray-200';
