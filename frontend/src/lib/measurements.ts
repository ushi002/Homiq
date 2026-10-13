// The building's InfluxDB measurements as edited in the form, stored as one string:
// "sv_l[m3,water_cold], tv_l[m3,water_hot]" (name[unit,type]); read by the backend in
// parse_measurements_config.
export interface MeasurementItem {
    id: string; // key for the form rows only
    name: string;
    uom: string;
    type: string;
}

export const newMeasurementId = () => Math.random().toString(36).slice(2, 11);

export const parseMeasurements = (str: string): MeasurementItem[] => {
    if (!str) return [];
    return str.split(/,(?![^\[]*\])/) // commas outside the brackets
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            let name = part;
            let uom = '';
            let type = '';
            if (part.includes('[') && part.endsWith(']')) {
                const [n, content] = part.split('[');
                name = n.trim();
                const inner = content.slice(0, -1);
                if (inner.includes(',')) {
                    const [u, t] = inner.split(',', 2);
                    uom = u.trim();
                    type = t.trim();
                } else {
                    uom = inner.trim();
                }
            }
            return { id: newMeasurementId(), name, uom, type };
        });
};

export const serializeMeasurements = (items: MeasurementItem[]): string =>
    items
        .filter(m => m.name.trim())
        .map(m => {
            const name = m.name.trim();
            const uom = m.uom.trim();
            const type = m.type.trim();
            if (!uom && !type) return name;
            return `${name}[${type ? `${uom},${type}` : uom}]`;
        })
        .join(', ');
