/** Editable country-code aliases for the basic traffic-sign renderer. @packageDocumentation */
/** A visual family supported by TrafficSigns. */
export type TrafficSignKind =
    | "no_entry"
    | "no_access"
    | "stop"
    | "give_way"
    | "speed_limit"
    | "one_way";
/** Country prefixes map to one code or explicitly listed aliases. */
export type TrafficSignMapping = Record<
    TrafficSignKind,
    Record<string, string | readonly string[]>
>;
/** Catalogue codes omit the country prefix; unknown codes are deliberately not guessed.
 * Sources: OSM Wiki NL:Overzicht_Nederlandse_Verkeersborden and DE:Verkehrszeichen_in_?sterreich.
 * Swiss no-entry uses the CH:2.02 code; priority signs use the Swiss signal numbering.
 */
export const TRAFFIC_SIGN_CODES: TrafficSignMapping = {
    no_entry: { AT: "52.2", CH: "2.02", NL: ["C2", "C02"] },
    no_access: { AT: "52.1", CH: "2.01", NL: ["C1", "C01"] },
    stop: { AT: "52.24", CH: "3.01", NL: ["B7", "B07"] },
    give_way: { AT: "52.23", CH: "3.02", NL: ["B6", "B06"] },
    speed_limit: { AT: "52.10a", CH: "2.30", NL: ["A1", "A01"] },
    one_way: { NL: "C3" },
};
/** One parsed, renderable sign; parameters are explicit sign text, never inferred from road limits. */
export interface TrafficSignSpec {
    /** Renderer family. */
    kind: TrafficSignKind;
    /** Numeric limit when this is a speed sign. */
    speed?: string;
    /** Additional unit label for explicitly tagged miles per hour. */
    mph?: boolean;
    /** NL zone-start qualifier; zone-end codes are intentionally unsupported. */
    zone?: boolean;
}
/** Splits combinations without splitting quoted text or bracket parameters. */
function signTokens(raw: string): string[] {
    const result: string[] = [];
    let token = "",
        depth = 0,
        quoted = false;
    for (const character of raw) {
        if (character === '"') quoted = !quoted;
        if (!quoted && character === "[") depth++;
        if (!quoted && character === "]") depth = Math.max(0, depth - 1);
        if (!quoted && depth === 0 && (character === "," || character === ";")) {
            result.push(token.trim());
            token = "";
        } else token += character;
    }
    if (token.trim()) result.push(token.trim());
    return result;
}
/** Resolves explicit codes only in configured countries, including whitespace and inherited compound prefixes. */
export function parseTrafficSigns(
    tags: Record<string, unknown>,
    countryCode: string | readonly string[],
    mapping: TrafficSignMapping = TRAFFIC_SIGN_CODES,
): TrafficSignSpec[] {
    const countries = (typeof countryCode === "string" ? [countryCode] : countryCode).map((code) =>
        code.toUpperCase(),
    );
    const result: TrafficSignSpec[] = [];
    let country = countries.length === 1 ? countries[0] : "";
    for (const raw of signTokens(String(tags.traffic_sign ?? ""))) {
        const prefix = raw.match(/^([a-z]{2})\s*:\s*(.*)$/i);
        const token = prefix ? prefix[2] : raw;
        if (prefix) country = prefix[1].toUpperCase();
        const generic = token.trim().toLowerCase();
        if (["stop", "give_way", "no_entry"].includes(generic)) {
            result.push({ kind: generic as TrafficSignKind });
            continue;
        }
        const identifier = token.match(/^([a-z]*\d+(?:\.\d+)*[a-z]*)(?=$|[\s\[\-])/i)?.[1];
        const entries =
            identifier && countries.includes(country)
                ? (Object.entries(mapping) as [
                      TrafficSignKind,
                      Record<string, string | readonly string[]>,
                  ][])
                : [];
        let kind: TrafficSignKind | undefined;
        for (const [candidate, codes] of entries) {
            const aliases = codes[country];
            if (
                (typeof aliases === "string" ? [aliases] : (aliases ?? [])).some(
                    (code) => code.toUpperCase() === identifier!.toUpperCase(),
                )
            ) {
                kind = candidate;
                break;
            }
        }
        if (generic === "maxspeed") kind = "speed_limit";
        if (!kind) continue;
        if (kind === "speed_limit") {
            const parameter =
                token.match(/\[(\d{1,3})\]/)?.[1] ?? token.match(/-(\d{1,3})(?:-ZB)?$/i)?.[1];
            const tagged = String(tags.maxspeed ?? "")
                .trim()
                .match(/^(\d{1,3})(?:\s*(mph|km\/h))?$/i);
            const speed = parameter ?? tagged?.[1];
            if (!speed || Number(speed) < 1 || Number(speed) > 250) continue;
            result.push({
                kind,
                speed,
                mph: !parameter && tagged?.[2]?.toLowerCase() === "mph",
                zone: /-ZB$/i.test(token),
            });
        } else result.push({ kind });
    }
    const seen = new Set<string>();
    return result.filter((sign) => {
        const key = JSON.stringify(sign);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
