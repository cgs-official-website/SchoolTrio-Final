/**
 * Distance slab helpers.
 *
 * A slab fee covers a distance RANGE in km, e.g. 11 to 15 KM. It is stored in the existing
 * bus_fees.slab_name text column (no migration needed):
 *   "11-15 KM"  -> range 11 to 15 (both ends included)
 *   "15 KM"     -> single distance (old slab fees keep working as 15 to 15)
 * A bus stop keeps a single distance ("25 KM") in bus_stops.slab_name.
 */

const NUM = '(\\d+(?:\\.\\d+)?)';
const RANGE_RE = new RegExp(`^\\s*${NUM}\\s*(?:-|–|—|to)\\s*${NUM}`, 'i');
const SINGLE_RE = new RegExp(NUM);

/** "11-15 KM" -> { from: 11, to: 15 } ; "15 KM" -> { from: 15, to: 15 } ; junk -> null */
export function parseSlab(label) {
    const text = String(label ?? '');
    const r = RANGE_RE.exec(text);
    if (r) {
        const a = Number(r[1]);
        const b = Number(r[2]);
        return { from: Math.min(a, b), to: Math.max(a, b) };
    }
    const s = SINGLE_RE.exec(text);
    return s ? { from: Number(s[1]), to: Number(s[1]) } : null;
}

/** (11, 15) -> "11-15 KM" ; (15, 15) -> "15 KM" */
export function formatSlab(from, to) {
    const a = Number(from);
    const b = Number(to);
    return a === b ? `${a} KM` : `${Math.min(a, b)}-${Math.max(a, b)} KM`;
}

/** Is the stop's distance inside the slab range? (string compare only when nothing is numeric) */
export function stopInSlab(stopLabel, slabLabel) {
    const stop = parseSlab(stopLabel);
    const slab = parseSlab(slabLabel);
    if (stop && slab) return stop.from >= slab.from && stop.from <= slab.to;
    const clean = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, '');
    return clean(stopLabel) !== '' && clean(stopLabel) === clean(slabLabel);
}

/** Do two slab labels share any distance? */
export function slabsOverlap(a, b) {
    const x = parseSlab(a);
    const y = parseSlab(b);
    if (!x || !y) return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
    return x.from <= y.to && y.from <= x.to;
}
