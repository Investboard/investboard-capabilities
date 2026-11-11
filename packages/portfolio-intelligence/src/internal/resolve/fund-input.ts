/**
 * Turning a caller's fund into the engine's fund input, following the same
 * decision as Investboard's app:
 *
 * - a held-whole override keeps the fund whole in the override's class;
 * - a fund whose stated class is cash, bonds, gold or crypto is held whole and its list is never read;
 * - a missing list is pending, unless an index list is supplied to read through;
 * - a fund that reports no constituents is held whole, not pending;
 * - otherwise the class is resolved from the stated and reported class, and a
 *   fund that resolves to cash, bonds, gold or crypto is held whole;
 * - every other fund is looked through.
 */
import type {
	BreakdownEntry,
	ConstituentInput,
	FundInput,
	FundOverride,
} from "../../types.js";
import {
	NEVER_LOOKED_THROUGH_CLASSES,
	resolveFundClass,
} from "../xray/asset-class.js";
import { normalizeCountry } from "../xray/country.js";
import { normalizeSector } from "../xray/sector.js";
import type {
	ClassificationVectorEntry,
	EngineEtfInput,
	FundIndexDisclosure,
} from "../xray/types.js";
import { normalizeIsin, type ValuedHolding } from "./security-profile.js";

export type { ValuedHolding } from "./security-profile.js";

function toVector(
	entries: readonly BreakdownEntry[] | null | undefined,
	keyOf: (raw: string) => string | null,
): ClassificationVectorEntry[] | null {
	if (!entries || entries.length === 0) return null;
	const vector: ClassificationVectorEntry[] = [];
	for (const entry of entries) {
		const key = keyOf(entry.key);
		if (key !== null) vector.push({ key, weight: entry.weight });
	}
	return vector.length > 0 ? vector : null;
}

function toConstituents(
	list: readonly ConstituentInput[],
): EngineEtfInput["constituents"] {
	return list.map((c) => ({
		identifier: c.id,
		isin: normalizeIsin(c.isin),
		name: c.name,
		weight: c.weight,
	}));
}

function base(
	holding: ValuedHolding,
	assetClass: string | null,
): EngineEtfInput {
	return {
		ticker: holding.ticker ?? holding.id,
		isin: normalizeIsin(holding.isin),
		name: holding.name,
		value: holding.value,
		underlyingAssetClass: assetClass,
		constituents: [],
		sectorVector: null,
		countryVector: null,
		asOf: null,
	};
}

export function resolveFundInput(
	holding: ValuedHolding,
	fund: FundInput | undefined,
	overrides: ReadonlyMap<string, FundOverride>,
): EngineEtfInput {
	const isin = normalizeIsin(holding.isin);
	const override = isin ? overrides.get(isin) : undefined;
	if (override?.heldWhole)
		return {
			...base(holding, override.assetClass),
			heldWholeAs: override.assetClass,
		};
	const stated = override ? override.assetClass : holding.assetClass;

	if (NEVER_LOOKED_THROUGH_CLASSES.has(stated))
		return base(holding, resolveFundClass(stated, null));

	const holdings = fund?.holdings ?? { status: "missing" as const };
	let constituents: ConstituentInput[] | null = null;
	let asOf: string | null = null;
	let indexRead: FundIndexDisclosure | undefined;
	if (holdings.status === "listed") {
		constituents = holdings.constituents;
		asOf = holdings.asOf;
	} else if (holdings.status === "none_reported") {
		constituents = [];
	} else if (fund?.readThrough) {
		constituents = fund.readThrough.constituents;
		asOf = fund.readThrough.asOf;
		indexRead = {
			index: fund.readThrough.index,
			fund: fund.readThrough.fundName,
		};
	}
	if (constituents === null)
		return { ...base(holding, resolveFundClass(stated, null)), degraded: true };

	const resolved = resolveFundClass(stated, fund?.reportedClass ?? null);
	if (NEVER_LOOKED_THROUGH_CLASSES.has(resolved ?? ""))
		return base(holding, resolved);

	const input: EngineEtfInput = {
		...base(holding, resolved),
		constituents: toConstituents(constituents),
		sectorVector: indexRead
			? null
			: toVector(fund?.sectorBreakdown, normalizeSector),
		countryVector: indexRead
			? null
			: toVector(fund?.countryBreakdown, normalizeCountry),
		asOf,
	};
	return indexRead ? { ...input, indexRead } : input;
}
