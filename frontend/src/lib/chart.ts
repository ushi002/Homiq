// Round the axis maximum up to a clean step (1, 2, 2.5, 5 × 10^n), 4 intervals
export const niceScale = (max: number) => {
    const raw = max / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
    return { step, top: Math.ceil(max / step) * step };
};
