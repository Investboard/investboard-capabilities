/**
 * Sector, country, region and currency dimensions. Sector, country and region
 * describe the equity part of the portfolio only: their buckets are weighted on
 * the whole valued portfolio and their coverage is measured on the equity part.
 */
import { currencyQualification } from "../../currency-evidence.js";
import type {
	Bucket,
	Dimension,
	PortfolioResult,
	SecurityProfile,
} from "../../types.js";
import { currencyBuckets } from "../xray/buckets.js";
import {
	type ClassificationResult,
	classificationBuckets,
	regionBucketsFromCountry,
} from "../xray/classification-buckets.js";
import { applyConstituentVectors } from "../xray/constituent-classification.js";
import {
	currencyExposure,
	hedgeOfFundName,
} from "../xray/currency-exposure.js";
import { isEquityAxisDirect, isEquityAxisEtf } from "../xray/equity-axis.js";
import { fundIdentity } from "../xray/fund-identity.js";
import { positionIdentity } from "../xray/identity.js";
import type { EngineDirectHolding, EngineEtfInput } from "../xray/types.js";
import {
	normalizeIsin,
	type ValuedHolding,
} from "../resolve/security-profile.js";

/** Re-base each equity fund's breakdown onto its constituents' profiles. */
export function applyProfilesToFunds(
	etfInputs: readonly EngineEtfInput[],
	profiles: ReadonlyMap<string, SecurityProfile>,
): EngineEtfInput[] {
	if (profiles.size === 0) return [...etfInputs];
	return applyConstituentVectors(etfInputs, (isin) => {
		const profile = profiles.get(isin);
		return profile
			? {
					country: profile.country ?? null,
					sector: profile.sector ?? null,
					industry: profile.industry ?? null,
				}
			: undefined;
	});
}

function sourceOf(
	row: { name: string; isin: string | null },
	id: string | null,
) {
	return id ? { id, label: row.name, isin: row.isin } : undefined;
}

function onEquityBase(
	dim: ClassificationResult,
	equityTotal: number,
): ClassificationResult {
	if (!(equityTotal > 0)) return { ...dim, coverage: 0 };
	const classified = dim.buckets.reduce(
		(s, b) => (b.key === "unknown" ? s : s + b.value),
		0,
	);
	return {
		...dim,
		coverage: Math.max(0, Math.min(1, classified / equityTotal)),
	};
}

function toBuckets(
	buckets: ReadonlyArray<{ key: string; value: number; weight: number }>,
): Bucket[] {
	return buckets.map((b) => ({ key: b.key, value: b.value, weight: b.weight }));
}

function toDimension(result: {
	coverage: number;
	buckets: ReadonlyArray<{ key: string; value: number; weight: number }>;
}): Dimension {
	return { coverage: result.coverage, buckets: toBuckets(result.buckets) };
}

export function computeDimensions(args: {
	etfInputs: readonly EngineEtfInput[];
	direct: readonly EngineDirectHolding[];
	valued: readonly ValuedHolding[];
	valuedTotal: number;
}): Omit<PortfolioResult["dimensions"], "reportedEconomicCurrency"> {
	const { etfInputs, direct, valued, valuedTotal } = args;
	const equityEtfs = etfInputs.filter(isEquityAxisEtf);
	const equityDirect = direct.filter(isEquityAxisDirect);
	const equityTotal =
		equityEtfs.reduce((s, e) => s + e.value, 0) +
		equityDirect.reduce(
			(s, d) => s + (Number.isFinite(d.value) ? d.value : 0),
			0,
		);

	const axis = (
		vectorOf: (e: EngineEtfInput) => EngineEtfInput["sectorVector"],
		keyOf: (d: EngineDirectHolding) => string | null | undefined,
	) =>
		classificationBuckets({
			etfs: equityEtfs.map((e) => ({
				value: e.value,
				source: sourceOf(e, fundIdentity(e)),
				vector: vectorOf(e) ?? null,
			})),
			direct: equityDirect.map((d) => ({
				value: d.value,
				source: sourceOf(d, positionIdentity(d.isin, d.ticker)),
				key: keyOf(d) ?? null,
			})),
			totalValue: valuedTotal,
		});

	const sector = axis(
		(e) => e.sectorVector,
		(d) => d.sector,
	);
	const country = axis(
		(e) => e.countryVector,
		(d) => d.country,
	);
	const region = regionBucketsFromCountry(country, valuedTotal);

	const listing = currencyBuckets(
		valued.map((h) => {
			const isin = normalizeIsin(h.isin);
			return {
				id: positionIdentity(isin, h.ticker ?? h.id) ?? h.id,
				name: h.name,
				isin,
				currency: h.listingCurrency,
				value: h.value,
			};
		}),
		valuedTotal,
	);

	const identity = (isin: string | null, ticker: string) =>
		positionIdentity(isin, ticker) ?? ticker;
	const economic = currencyExposure({
		funds: equityEtfs.map((e) => ({
			id: identity(e.isin, e.ticker),
			label: e.name,
			isin: e.isin,
			value: e.value,
			countryVector: e.countryVector ?? null,
			hedge: hedgeOfFundName(e.name),
		})),
		direct: equityDirect.map((d) => ({
			id: identity(d.isin, d.ticker),
			label: d.name,
			isin: d.isin,
			value: d.value,
			country: d.country ?? null,
		})),
		totalValue: valuedTotal,
	});

	return {
		sector: toDimension(onEquityBase(sector, equityTotal)),
		country: toDimension(onEquityBase(country, equityTotal)),
		region: toDimension(onEquityBase(region, equityTotal)),
		listingCurrency: {
			...toDimension(listing),
			qualification: currencyQualification(true),
		},
		economicCurrency: {
			...toDimension(economic),
			qualification: currencyQualification(),
			nameInferredHedgeWeight: economic.hedged.reduce((s, h) => s + h.weight, 0),
			nameInferredHedges: economic.hedged.map((h) => ({
				id: h.id,
				name: h.label,
				isin: h.isin,
				targetCurrency: h.currency,
				weight: h.weight,
				basis: "fund_name_inference",
				sourceAsOf: null,
				hedgeRatio: null,
			})),
		},
	};
}
