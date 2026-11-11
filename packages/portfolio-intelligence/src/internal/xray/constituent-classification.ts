/** Re-basing a fund's sector and country breakdown onto its individual constituents. */
import { normalizeCountry } from "./country.js";
import { isEquityAxisEtf } from "./equity-axis.js";
import { normalizeSector } from "./sector.js";
import type { ClassificationVectorEntry, EngineEtfInput } from "./types.js";
export interface ConstituentClassification {
	country: string | null;
	sector: string | null;
	industry: string | null;
}
export interface ConstituentVectors {
	countryVector: ClassificationVectorEntry[] | null;
	sectorVector: ClassificationVectorEntry[] | null;
	industryVector: ClassificationVectorEntry[] | null;
}
export function composeConstituentVectors(
	constituents: ReadonlyArray<{
		isin: string | null;
		weight: number;
	}>,
	classifyByIsin: (isin: string) => ConstituentClassification | undefined,
): ConstituentVectors {
	const countryAcc = new Map<string, number>();
	const sectorAcc = new Map<string, number>();
	const industryAcc = new Map<string, number>();
	for (const c of constituents) {
		if (!c.isin || !Number.isFinite(c.weight) || c.weight <= 0) continue;
		const cls = classifyByIsin(c.isin);
		if (!cls) continue;
		const country = normalizeCountry(cls.country);
		if (country)
			countryAcc.set(country, (countryAcc.get(country) ?? 0) + c.weight);
		const sector = normalizeSector(cls.sector);
		if (sector) sectorAcc.set(sector, (sectorAcc.get(sector) ?? 0) + c.weight);
		const industry = cls.industry?.trim();
		if (industry)
			industryAcc.set(industry, (industryAcc.get(industry) ?? 0) + c.weight);
	}
	return {
		countryVector: toVector(countryAcc),
		sectorVector: toVector(sectorAcc),
		industryVector: toVector(industryAcc),
	};
}
function toVector(
	acc: Map<string, number>,
): ClassificationVectorEntry[] | null {
	if (acc.size === 0) return null;
	return [...acc.entries()]
		.map(([key, weight]) => ({ key, weight }))
		.sort((a, b) => b.weight - a.weight);
}
export function applyConstituentVectors(
	etfInputs: ReadonlyArray<EngineEtfInput>,
	classifyByIsin: (isin: string) => ConstituentClassification | undefined,
): EngineEtfInput[] {
	return etfInputs.map((etf) => {
		if (!isEquityAxisEtf(etf) || etf.constituents.length === 0) return etf;
		const { countryVector, sectorVector, industryVector } =
			composeConstituentVectors(etf.constituents, classifyByIsin);
		if (!countryVector && !sectorVector && !industryVector) return etf;
		return {
			...etf,
			countryVector: countryVector ?? etf.countryVector,
			sectorVector: sectorVector ?? etf.sectorVector,
			industryVector: industryVector ?? etf.industryVector ?? null,
		};
	});
}
