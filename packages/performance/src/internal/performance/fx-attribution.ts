// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import type { HoldingContributionRow } from "./holding-attribution.js";
export interface HoldingFxPeriodEffect {
	readonly holdingId: string;
	readonly currency: string;
	readonly periodIndex: number;
	readonly localContribution: number;
	readonly fxContribution: number;
}
export interface FxAttributionRow {
	readonly key: string;
	readonly holdingCount: number;
	readonly startWeightPct: number | null;
	readonly endWeightPct: number | null;
	readonly localContribution: number;
	readonly localContributionPp: number;
	readonly fxContribution: number;
	readonly fxContributionPp: number;
	readonly combinedContribution: number;
	readonly combinedContributionPp: number;
}
export interface FxAttributionResult {
	readonly methodology: "symmetric_quote_currency_fx_frongello";
	readonly baseCurrency: string;
	readonly rows: ReadonlyArray<FxAttributionRow>;
	readonly localContribution: number;
	readonly localContributionPp: number;
	readonly fxContribution: number;
	readonly fxContributionPp: number;
	readonly reconciliationGap: number;
}
interface Bucket {
	readonly key: string;
	readonly holdingIds: Set<string>;
	startWeightPct: number;
	startWeightCount: number;
	endWeightPct: number;
	endWeightCount: number;
	localContribution: number;
	fxContribution: number;
}
const RECONCILIATION_ABSOLUTE_EPSILON = 1e-10;
const RECONCILIATION_RELATIVE_EPSILON = 1e-12;
const CURRENCY_CODE = /^[A-Z]{3}$/;
function reconciliationTolerance(...values: number[]): number {
	const scale = Math.max(1, ...values.map((value) => Math.abs(value)));
	return Math.max(
		RECONCILIATION_ABSOLUTE_EPSILON,
		scale * RECONCILIATION_RELATIVE_EPSILON,
	);
}
function rowFromBucket(bucket: Bucket): FxAttributionRow {
	const combinedContribution = bucket.localContribution + bucket.fxContribution;
	return {
		key: bucket.key,
		holdingCount: bucket.holdingIds.size,
		startWeightPct: bucket.startWeightCount > 0 ? bucket.startWeightPct : null,
		endWeightPct: bucket.endWeightCount > 0 ? bucket.endWeightPct : null,
		localContribution: bucket.localContribution,
		localContributionPp: bucket.localContribution * 100,
		fxContribution: bucket.fxContribution,
		fxContributionPp: bucket.fxContribution * 100,
		combinedContribution,
		combinedContributionPp: combinedContribution * 100,
	};
}
function getBucket(buckets: Map<string, Bucket>, key: string): Bucket {
	const current = buckets.get(key);
	if (current) return current;
	const created = {
		key,
		holdingIds: new Set<string>(),
		startWeightPct: 0,
		startWeightCount: 0,
		endWeightPct: 0,
		endWeightCount: 0,
		localContribution: 0,
		fxContribution: 0,
	};
	buckets.set(key, created);
	return created;
}
function addHoldingWeight(
	bucket: Bucket,
	holding: HoldingContributionRow | undefined,
): void {
	if (!holding || bucket.holdingIds.has(holding.id)) return;
	bucket.holdingIds.add(holding.id);
	if (holding.startWeightPct !== null) {
		bucket.startWeightPct += holding.startWeightPct;
		bucket.startWeightCount += 1;
	}
	if (holding.endWeightPct !== null) {
		bucket.endWeightPct += holding.endWeightPct;
		bucket.endWeightCount += 1;
	}
}
export function aggregateFxAttribution(input: {
	readonly holdings: ReadonlyArray<HoldingContributionRow>;
	readonly effects: ReadonlyArray<HoldingFxPeriodEffect>;
	readonly futureFactors: ReadonlyArray<number>;
	readonly expectedEffectCount: number;
	readonly reportingCurrency?: string;
}): FxAttributionResult | null {
	if (
		input.effects.length === 0 ||
		input.effects.length !== input.expectedEffectCount
	) {
		return null;
	}
	const holdingById = new Map(
		input.holdings.map((holding) => [holding.id, holding]),
	);
	const buckets = new Map<string, Bucket>();
	const effectContributionByHolding = new Map<string, number>();
	const effectKeys = new Set<string>();
	for (const effect of input.effects) {
		const key = effect.currency.trim().toUpperCase();
		const holding = holdingById.get(effect.holdingId);
		const factor = input.futureFactors[effect.periodIndex];
		const effectKey = `${effect.holdingId}:${effect.periodIndex}`;
		if (
			!holding ||
			!CURRENCY_CODE.test(key) ||
			!Number.isInteger(effect.periodIndex) ||
			effect.periodIndex < 0 ||
			factor === undefined ||
			!Number.isFinite(factor) ||
			!Number.isFinite(effect.localContribution) ||
			!Number.isFinite(effect.fxContribution) ||
			effectKeys.has(effectKey)
		) {
			return null;
		}
		effectKeys.add(effectKey);
		const bucket = getBucket(buckets, key);
		bucket.localContribution += effect.localContribution * factor;
		bucket.fxContribution += effect.fxContribution * factor;
		effectContributionByHolding.set(
			effect.holdingId,
			(effectContributionByHolding.get(effect.holdingId) ?? 0) +
				(effect.localContribution + effect.fxContribution) * factor,
		);
		addHoldingWeight(bucket, holding);
	}
	for (const holding of input.holdings) {
		const effectContribution = effectContributionByHolding.get(holding.id) ?? 0;
		const gap = holding.contribution - effectContribution;
		if (
			Math.abs(gap) >
			reconciliationTolerance(holding.contribution, effectContribution)
		) {
			return null;
		}
	}
	const rows = [...buckets.values()].map(rowFromBucket).sort((a, b) => {
		const fxDifference =
			Math.abs(b.fxContribution) - Math.abs(a.fxContribution);
		return fxDifference !== 0
			? fxDifference
			: Math.abs(b.combinedContribution) - Math.abs(a.combinedContribution);
	});
	const localContribution = rows.reduce(
		(sum, row) => sum + row.localContribution,
		0,
	);
	const fxContribution = rows.reduce((sum, row) => sum + row.fxContribution, 0);
	const coveredContribution = input.holdings.reduce(
		(sum, holding) => sum + holding.contribution,
		0,
	);
	const reconciliationGap =
		coveredContribution - (localContribution + fxContribution);
	if (
		rows.length === 0 ||
		Math.abs(reconciliationGap) >
			reconciliationTolerance(
				coveredContribution,
				localContribution,
				fxContribution,
			)
	) {
		return null;
	}
	return {
		methodology: "symmetric_quote_currency_fx_frongello",
		baseCurrency: input.reportingCurrency ?? "EUR",
		rows,
		localContribution,
		localContributionPp: localContribution * 100,
		fxContribution,
		fxContributionPp: fxContribution * 100,
		reconciliationGap,
	};
}
