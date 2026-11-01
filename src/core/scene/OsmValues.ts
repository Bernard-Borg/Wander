/** Strict shared OSM direction and metre parsers. @packageDocumentation */
/** Accepts a finite number or one of the eight abbreviated compass bearings. */
export function osmDirection(value: unknown): number | undefined {
    const text = String(value ?? "").trim().toUpperCase();
    const compass: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
    if (Object.hasOwn(compass, text)) return compass[text];
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return undefined;
    const number = Number(text);
    return Number.isFinite(number) ? ((number % 360) + 360) % 360 : undefined;
}

/** Parses a positive metric dimension, optionally suffixed with m. */
export function osmMetres(value: unknown): number | undefined {
    const text = String(value ?? "").trim();
    if (!/^\d+(?:\.\d+)?\s*(?:m)?$/i.test(text)) return undefined;
    const number = parseFloat(text);
    return Number.isFinite(number) && number > 0 ? number : undefined;
}
