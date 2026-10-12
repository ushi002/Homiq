// CSV export built in the browser from data the page already has.
// Czech: ";" separator and decimal comma (what Czech Excel expects), English: "," and dot.
// The BOM makes Excel read the file as UTF-8, so diacritics survive.

export type CsvValue = string | number | null | undefined;

export function buildCsv(rows: CsvValue[][], language: string): string {
    const czech = language === 'cs';
    const separator = czech ? ';' : ',';
    const cell = (v: CsvValue) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'number') return czech ? String(v).replace('.', ',') : String(v);
        return /[";,\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    return '﻿' + rows.map(r => r.map(cell).join(separator)).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "SVJ Ke Kapličce 469" -> "svj-ke-kaplicce-469"
export const fileSlug = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
