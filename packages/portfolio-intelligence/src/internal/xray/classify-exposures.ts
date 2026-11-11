/** Sector and region for each position from its security profile. */
import { normalizeCountry } from "./country.js";
import { countryToRegion } from "./region.js";
import { normalizeSector } from "./sector.js";
export interface ExposureProfile {
	sector: string | null;
	country: string | null;
}
export type ProfileLookup = (isin: string) => ExposureProfile | null;
export function classifyExposures<
	T extends {
		isin: string | null;
		value: number;
		sektor: string | null;
		region: string | null;
	},
>(
	positions: T[],
	lookup: (isin: string, position: T) => ExposureProfile | null,
	limit: number,
): T[] {
	const out = positions.map((p) => ({ ...p }));
	if (limit <= 0) return out;
	const toClassify = out
		.map((p, index) => ({ p, index }))
		.filter(({ p }) => p.isin !== null)
		.sort((a, b) => b.p.value - a.p.value)
		.slice(0, limit);
	for (const { p } of toClassify) {
		const profile = lookup(p.isin as string, p);
		if (!profile) continue;
		const sektor = normalizeSector(profile.sector);
		if (sektor !== null) p.sektor = sektor;
		const iso = normalizeCountry(profile.country);
		if (iso !== null) p.region = countryToRegion(iso);
	}
	return out;
}
