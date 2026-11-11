/**
 * What a portfolio really owns: the equity look-through of its funds, merged
 * with direct holdings, and the exposures, overlap, concentration and coverage
 * measured on it. The order of work follows Investboard's X-Ray.
 */
import { measureConcentration } from "./internal/concentration/measure.js";
import { classificationGate } from "./internal/coverage/classification-gate.js";
import {
	classifyPositions,
	measureCoverage,
} from "./internal/coverage/exposure-block.js";
import {
	applyProfilesToFunds,
	computeDimensions,
} from "./internal/dimensions/dimensions.js";
import { resolveFundInput } from "./internal/resolve/fund-input.js";
import {
	normalizeIsin,
	profileMap,
	toEngineDirectHoldings,
	type ValuedHolding,
} from "./internal/resolve/security-profile.js";
import {
	bookAsOf,
	dissolveEtfs,
	lookThroughFundCount,
} from "./internal/xray/dissolve.js";
import { holdingAssetClassBuckets } from "./internal/xray/buckets.js";
import { mergeEtfInputsByFund } from "./internal/xray/fund-identity.js";
import { groupByIssuer } from "./internal/xray/group-by-issuer.js";
import { isResidualId, positionIdentity } from "./internal/xray/identity.js";
import { mergeByIdentity } from "./internal/xray/merge.js";
import { detectOverlaps } from "./internal/xray/overlap.js";
import type {
	EngineEtfInput,
	EtfDissolution,
	MergedPosition,
	OverlapPairV2,
} from "./internal/xray/types.js";
import type {
	Bucket,
	FundOverride,
	FundTreatment,
	OverlapPair,
	PortfolioRequest,
	PortfolioResult,
	Position,
} from "./types.js";
import { freeze } from "./internal/freeze.js";
import { validatePortfolioRequest } from "./validation.js";

export const METHODOLOGY_VERSION = "portfolio-intelligence-v2" as const;

function fundKey(isin: string | null | undefined, ticker: string): string {
	return positionIdentity(normalizeIsin(isin), ticker) ?? ticker;
}

function treatmentOf(
	fund: EngineEtfInput,
	dissolution: EtfDissolution | undefined,
): FundTreatment["treatment"] {
	if (fund.degraded) return "pending";
	if (!dissolution || dissolution.status === "none") return "held_whole";
	return "looked_through";
}

function toPosition(
	p: MergedPosition,
	holdingOf: (fundId: string | undefined, etf: string) => string,
): Position {
	return {
		id: p.id,
		isin: p.isin,
		ticker: p.ticker,
		name: p.name,
		value: p.value,
		weight: p.weight,
		assetClass: p.assetClass as Position["assetClass"],
		sector: p.sektor,
		region: p.region,
		residual: isResidualId(p.id),
		direct: p.provenance.direct,
		viaFunds: p.provenance.viaFunds.map((v) => ({
			holdingId: holdingOf(v.id, v.etf),
			name: v.name ?? "",
			weight: v.weight,
			shareInFund: v.shareInEtf,
		})),
	};
}

function toOverlap(
	pair: OverlapPairV2,
	holdingOf: (fundId: string | undefined, etf: string) => string,
): OverlapPair {
	return {
		fundA: holdingOf(fundKey(pair.isinA, pair.etfA), pair.etfA),
		fundB: holdingOf(fundKey(pair.isinB, pair.etfB), pair.etfB),
		overlap: pair.overlapShare,
		sharedCount: pair.sharedCount,
		shared: pair.sharedHoldings.map((s) => ({ ...s })),
		sharedTail: pair.sharedTail,
	};
}

function emptyResult(
	request: PortfolioRequest,
	unvalued: Array<{ id: string; name: string }>,
	valuedCount: number,
): Omit<PortfolioResult, "snapshot"> {
	const none = { coverage: 0, buckets: [] };
	return {
		methodologyVersion: METHODOLOGY_VERSION,
		status: "unavailable",
		reasonCodes: ["no_valued_holdings"],
		baseCurrency: request.baseCurrency,
		asOf: request.asOf,
		constituentsAsOf: null,
		valuation: { valuedTotal: 0, valuedCount, unvalued },
		basis: [],
		positions: [],
		issuers: [],
		dimensions: {
			sector: none,
			country: none,
			region: none,
			listingCurrency: none,
			economicCurrency: { ...none, hedged: 0 },
		},
		overlap: [],
		concentration: {
			status: "refused",
			refusal: "empty_book",
			attributedCoverage: 0,
			topTenWeight: 0,
			largestIssuer: null,
			hhi: null,
			effectiveIssuers: null,
		},
		coverage: { transparent: 0, opaqueInherent: 0, opaquePending: 0 },
		funds: [],
	};
}

export function analyzePortfolio(input: PortfolioRequest): PortfolioResult {
	validatePortfolioRequest(input);
	const request = structuredClone(input);
	const snapshot = { methodologyVersion: METHODOLOGY_VERSION, request };

	const unvalued = request.holdings
		.filter((h) => h.value === null)
		.map((h) => ({ id: h.id, name: h.name }));
	const valued = request.holdings.filter(
		(h): h is ValuedHolding => h.value !== null && h.value > 0,
	);
	const valuedCount = request.holdings.filter((h) => h.value !== null).length;
	const valuedTotal = valued.reduce((s, h) => s + h.value, 0);
	if (!(valuedTotal > 0))
		return freeze({ ...emptyResult(request, unvalued, valuedCount), snapshot });

	const profiles = profileMap(request.securities ?? []);
	const overrides = new Map<string, FundOverride>();
	for (const o of request.fundOverrides ?? []) {
		const isin = normalizeIsin(o.isin);
		if (isin && !overrides.has(isin)) overrides.set(isin, o);
	}
	const fundInputs = new Map(
		(request.funds ?? []).map((f) => [f.holdingId, f]),
	);

	const fundHoldings = valued.filter((h) => h.kind === "fund");
	const directHoldings = valued.filter((h) => h.kind !== "fund");
	const holdingByFund = new Map<string, string>();
	for (const h of fundHoldings) {
		const key = fundKey(h.isin, h.ticker ?? h.id);
		if (!holdingByFund.has(key)) holdingByFund.set(key, h.id);
	}
	const holdingOf = (fundId: string | undefined, etf: string): string =>
		(fundId && holdingByFund.get(fundId)) ||
		holdingByFund.get(fundKey(null, etf)) ||
		etf;

	const etfInputs = applyProfilesToFunds(
		mergeEtfInputsByFund(
			fundHoldings.map((h) =>
				resolveFundInput(h, fundInputs.get(h.id), overrides),
			),
		),
		profiles,
	);
	const direct = toEngineDirectHoldings(directHoldings, profiles);
	const { exposures, dissolutions } = dissolveEtfs(etfInputs);
	const merged = mergeByIdentity(direct, exposures, valuedTotal);
	const pairs =
		lookThroughFundCount(etfInputs) >= 2 ? detectOverlaps(etfInputs) : [];
	const dimensions = computeDimensions({
		etfInputs,
		direct,
		valued,
		valuedTotal,
	});
	const { coverage } = measureCoverage(etfInputs, dissolutions, valuedTotal);
	const classified = classifyPositions(merged, profiles);
	const gate = classificationGate(classified, valuedTotal, profiles);
	const concentration = measureConcentration(classified);

	const funds: FundTreatment[] = etfInputs.map((fund, index) => {
		const dissolution = dissolutions[index];
		return {
			holdingId: holdingOf(fundKey(fund.isin, fund.ticker), fund.ticker),
			treatment: treatmentOf(fund, dissolution),
			coveredWeight: dissolution?.coveredWeight ?? 0,
			asOf: fund.asOf,
			readThrough: fund.indexRead
				? { index: fund.indexRead.index, fundName: fund.indexRead.fund }
				: null,
		};
	});

	const reasonCodes: string[] = [];
	if (unvalued.length > 0) reasonCodes.push("unvalued_holdings");
	if (funds.some((f) => f.treatment === "pending"))
		reasonCodes.push("fund_holdings_missing");
	if (gate.degraded && gate.reason) reasonCodes.push(gate.reason);

	return freeze({
		methodologyVersion: METHODOLOGY_VERSION,
		status: reasonCodes.length > 0 ? "partial" : "available",
		reasonCodes,
		baseCurrency: request.baseCurrency,
		asOf: request.asOf,
		constituentsAsOf: bookAsOf(dissolutions),
		valuation: { valuedTotal, valuedCount, unvalued },
		basis: holdingAssetClassBuckets(direct, etfInputs, valuedTotal).buckets.map(
			(b) => ({ key: b.key, value: b.value, weight: b.weight }),
		),
		positions: classified.map((p) => toPosition(p, holdingOf)),
		issuers: groupByIssuer(classified).map((g) => ({
			key: g.key,
			name: g.name,
			value: g.value,
			weight: g.weight,
			positionIds: g.breakdown.map((p) => p.id),
		})),
		dimensions,
		overlap: pairs.map((p) => toOverlap(p, holdingOf)),
		concentration,
		coverage: {
			transparent: coverage.transparent,
			opaqueInherent: coverage.opaqueInherent,
			opaquePending: coverage.opaquePending,
		},
		funds,
		snapshot,
	});
}
