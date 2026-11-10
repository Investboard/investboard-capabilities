// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import type { HoldingContributionRow } from "./holding-attribution.js";
export type CurrencyContributionKind = "currency" | "unclassified";
export interface HoldingCurrencyClassification {
	readonly holdingId: string;
	readonly currency: string | null;
}
export interface CurrencyContributionRow {
	readonly key: string;
	readonly kind: CurrencyContributionKind;
	readonly holdingCount: number;
	readonly startWeightPct: number | null;
	readonly endWeightPct: number | null;
	readonly contribution: number;
	readonly contributionPp: number;
}
export interface CurrencyAttributionResult {
	readonly methodology: "attributed_price_series_currency";
	readonly rows: ReadonlyArray<CurrencyContributionRow>;
	readonly reconciliationGap: number;
}
interface BucketAccumulator {
	key: string;
	kind: CurrencyContributionKind;
	holdingCount: number;
	startWeightPct: number;
	startWeightCount: number;
	endWeightPct: number;
	endWeightCount: number;
	contribution: number;
}
function currencyBucket(
	currency: string | null | undefined,
): Pick<BucketAccumulator, "key" | "kind"> {
	const key = currency?.trim().toUpperCase();
	return key
		? { key, kind: "currency" }
		: { key: "unknown", kind: "unclassified" };
}
function rowFromBucket(bucket: BucketAccumulator): CurrencyContributionRow {
	return {
		key: bucket.key,
		kind: bucket.kind,
		holdingCount: bucket.holdingCount,
		startWeightPct: bucket.startWeightCount > 0 ? bucket.startWeightPct : null,
		endWeightPct: bucket.endWeightCount > 0 ? bucket.endWeightPct : null,
		contribution: bucket.contribution,
		contributionPp: bucket.contribution * 100,
	};
}
export function aggregateCurrencyAttribution(input: {
	readonly holdings: ReadonlyArray<HoldingContributionRow>;
	readonly classifications: ReadonlyArray<HoldingCurrencyClassification>;
}): CurrencyAttributionResult {
	const currencies = new Map(
		input.classifications.map((item) => [item.holdingId, item.currency]),
	);
	const buckets = new Map<string, BucketAccumulator>();
	for (const holding of input.holdings) {
		const bucket = currencyBucket(currencies.get(holding.id));
		const bucketId = `${bucket.kind}:${bucket.key}`;
		const accumulator = buckets.get(bucketId) ?? {
			...bucket,
			holdingCount: 0,
			startWeightPct: 0,
			startWeightCount: 0,
			endWeightPct: 0,
			endWeightCount: 0,
			contribution: 0,
		};
		accumulator.holdingCount += 1;
		accumulator.contribution += holding.contribution;
		if (holding.startWeightPct !== null) {
			accumulator.startWeightPct += holding.startWeightPct;
			accumulator.startWeightCount += 1;
		}
		if (holding.endWeightPct !== null) {
			accumulator.endWeightPct += holding.endWeightPct;
			accumulator.endWeightCount += 1;
		}
		buckets.set(bucketId, accumulator);
	}
	const rows = [...buckets.values()].map(rowFromBucket).sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "currency" ? -1 : 1;
		return Math.abs(b.contribution) - Math.abs(a.contribution);
	});
	const holdingContribution = input.holdings.reduce(
		(sum, holding) => sum + holding.contribution,
		0,
	);
	const currencyContribution = rows.reduce(
		(sum, row) => sum + row.contribution,
		0,
	);
	return {
		methodology: "attributed_price_series_currency",
		rows,
		reconciliationGap: holdingContribution - currencyContribution,
	};
}
