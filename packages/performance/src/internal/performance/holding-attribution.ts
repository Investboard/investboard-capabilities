// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import {
	aggregateFxAttribution,
	type FxAttributionResult,
	type HoldingFxPeriodEffect,
} from "./fx-attribution.js";
import {
	type AttributionContext,
	buildAttributionContext,
	openingNav,
	recordedCostInPeriod,
	sumByHolding,
	terminalHoldingValue,
	terminalSeriesValue,
	valueAtOrBefore,
} from "./holding-attribution-boundaries.js";
import { calculateTwr } from "./twr.js";
import type { CashFlow, Snapshot } from "./types.js";
export interface AttributedCashFlow extends CashFlow {
	readonly holdingId: string | null;
	/** A fee booked on its own: known, so it is explained on its own line. */
	readonly recordedCost?: boolean;
}
export interface HoldingValuePoint {
	readonly date: string;
	readonly value: number | null;
}
export interface HoldingValueSeries {
	readonly id: string;
	readonly label: string;
	readonly values: ReadonlyArray<HoldingValuePoint>;
	readonly currency?: string;
	readonly fxRates?: ReadonlyArray<HoldingValuePoint>;
}
export interface HoldingContributionRow {
	readonly id: string;
	readonly label: string;
	readonly startWeightPct: number | null;
	readonly endWeightPct: number | null;
	readonly contribution: number;
	readonly contributionPp: number;
}
export interface HoldingAttributionResult {
	readonly status: "ready" | "withheld";
	readonly withheldReason: "undefined_subperiod" | null;
	readonly methodology: "modified_dietz_frongello";
	readonly totalReturn: number;
	readonly holdings: ReadonlyArray<HoldingContributionRow>;
	/**
	 * Linked effect of fees booked on their own, explained at portfolio level
	 * and never part of the residual. Present only when the request records
	 * such a fee.
	 */
	readonly recordedCostContribution?: number;
	readonly recordedCostContributionPp?: number;
	/** Return explained neither by the holdings nor by recorded standalone fees. */
	readonly residualContribution: number;
	readonly residualContributionPp: number;
	readonly attributedPeriodCount: number;
	readonly periodCount: number;
	readonly rawReconciliationGap: number;
	readonly reconciliationGap: number;
	readonly fxAttribution: FxAttributionResult | null;
}
const EPSILON = 1e-12;
interface PeriodAttribution {
	periodContributions: number[][];
	residualByPeriod: number[];
	recordedCostByPeriod: number[];
	fxEffects: HoldingFxPeriodEffect[];
	expectedFxEffectCount: number;
	attributedPeriodCount: number;
}
function buildFxPeriodEffect(input: {
	context: AttributionContext;
	holding: HoldingValueSeries;
	period: {
		from: string;
		to: string;
	};
	periodIndex: number;
	beginValue: number;
	endValue: number;
	denominator: number;
	dividend: number;
}): HoldingFxPeriodEffect | null {
	const { holding } = input;
	if (!holding.currency || !holding.fxRates) return null;
	const beginRate = valueAtOrBefore(holding.fxRates, input.period.from);
	const endRate = terminalSeriesValue(
		input.context,
		holding.fxRates,
		input.period,
	);
	if (
		beginRate === null ||
		endRate === null ||
		beginRate <= 0 ||
		endRate <= 0
	) {
		return null;
	}
	const beginLocalValue = input.beginValue / beginRate;
	const endLocalValue = input.endValue / endRate;
	const fxContribution =
		((endRate - beginRate) * (beginLocalValue + endLocalValue) * 0.5) /
		input.denominator;
	const localPriceContribution =
		((endLocalValue - beginLocalValue) * (beginRate + endRate) * 0.5) /
		input.denominator;
	return {
		holdingId: holding.id,
		currency: holding.currency,
		periodIndex: input.periodIndex,
		fxContribution,
		localContribution:
			localPriceContribution + input.dividend / input.denominator,
	};
}
function attributeHoldingPeriod(input: {
	context: AttributionContext;
	holding: HoldingValueSeries;
	period: {
		from: string;
		to: string;
	};
	periodIndex: number;
	denominator: number;
	dividend: number;
}): {
	contribution: number;
	fxEffect: HoldingFxPeriodEffect | null;
	expectsFxEffect: boolean;
} | null {
	const beginValue = valueAtOrBefore(input.holding.values, input.period.from);
	const endValue = terminalHoldingValue(
		input.context,
		input.holding,
		input.period,
	);
	if (beginValue === null || endValue === null) return null;
	const contribution =
		(endValue - beginValue + input.dividend) / input.denominator;
	const expectsFxEffect =
		Math.abs(beginValue) >= EPSILON ||
		Math.abs(endValue) >= EPSILON ||
		Math.abs(input.dividend) >= EPSILON;
	return {
		contribution,
		fxEffect: expectsFxEffect
			? buildFxPeriodEffect({
					context: input.context,
					holding: input.holding,
					period: input.period,
					periodIndex: input.periodIndex,
					beginValue,
					endValue,
					denominator: input.denominator,
					dividend: input.dividend,
				})
			: null,
		expectsFxEffect,
	};
}
function attributeOnePeriod(input: {
	context: AttributionContext;
	holdings: ReadonlyArray<HoldingValueSeries>;
	period: {
		from: string;
		to: string;
	};
	periodIndex: number;
}): {
	contributions: number[];
	explained: number;
	recordedCost: number;
	hasAnyValuation: boolean;
	fxEffects: HoldingFxPeriodEffect[];
	expectedFxEffectCount: number;
} {
	const contributions = new Array<number>(input.holdings.length).fill(0);
	const denominator = openingNav(input.context, input.period);
	if (Math.abs(denominator) < EPSILON) {
		return {
			contributions,
			explained: 0,
			recordedCost: 0,
			hasAnyValuation: false,
			fxEffects: [],
			expectedFxEffectCount: 0,
		};
	}
	const includeOpeningDividend = input.period.from === input.context.firstDate;
	const dividends = sumByHolding(input.context.dividendFlows, (flow) => {
		const afterOpen = includeOpeningDividend
			? flow.date >= input.period.from
			: flow.date > input.period.from;
		return afterOpen && flow.date <= input.period.to;
	});
	const fxEffects: HoldingFxPeriodEffect[] = [];
	let expectedFxEffectCount = 0;
	let explained = 0;
	let hasAnyValuation = false;
	for (const [holdingIndex, holding] of input.holdings.entries()) {
		const attributed = attributeHoldingPeriod({
			context: input.context,
			holding,
			period: input.period,
			periodIndex: input.periodIndex,
			denominator,
			dividend: dividends.get(holding.id) ?? 0,
		});
		if (!attributed) continue;
		contributions[holdingIndex] = attributed.contribution;
		explained += attributed.contribution;
		hasAnyValuation = true;
		if (attributed.expectsFxEffect) expectedFxEffectCount += 1;
		if (attributed.fxEffect) fxEffects.push(attributed.fxEffect);
	}
	return {
		contributions,
		explained,
		recordedCost:
			-recordedCostInPeriod(input.context, input.period) / denominator,
		hasAnyValuation,
		fxEffects,
		expectedFxEffectCount,
	};
}
function attributePeriods(
	context: AttributionContext,
	holdings: ReadonlyArray<HoldingValueSeries>,
	periods: ReadonlyArray<{
		from: string;
		to: string;
		return: number | null;
	}>,
): PeriodAttribution {
	const periodContributions = holdings.map(() =>
		new Array<number>(periods.length).fill(0),
	);
	const residualByPeriod = new Array<number>(periods.length).fill(0);
	const recordedCostByPeriod = new Array<number>(periods.length).fill(0);
	const fxEffects: HoldingFxPeriodEffect[] = [];
	let expectedFxEffectCount = 0;
	let attributedPeriodCount = 0;
	for (const [periodIndex, period] of periods.entries()) {
		const outcome = attributeOnePeriod({
			context,
			holdings,
			period,
			periodIndex,
		});
		for (const [
			holdingIndex,
			contribution,
		] of outcome.contributions.entries()) {
			const bucket = periodContributions[holdingIndex];
			if (bucket) bucket[periodIndex] = contribution;
		}
		if (outcome.hasAnyValuation) attributedPeriodCount += 1;
		fxEffects.push(...outcome.fxEffects);
		expectedFxEffectCount += outcome.expectedFxEffectCount;
		residualByPeriod[periodIndex] = (period.return ?? 0) - outcome.explained;
		recordedCostByPeriod[periodIndex] = outcome.recordedCost;
	}
	return {
		periodContributions,
		residualByPeriod,
		recordedCostByPeriod,
		fxEffects,
		expectedFxEffectCount,
		attributedPeriodCount,
	};
}
function futureReturnFactors(
	periods: ReadonlyArray<{
		return: number | null;
	}>,
): number[] {
	const factors = new Array<number>(periods.length).fill(1);
	let factor = 1;
	for (let index = periods.length - 1; index >= 0; index--) {
		factors[index] = factor;
		factor *= 1 + (periods[index]?.return ?? 0);
	}
	return factors;
}
function contributionRows(input: {
	context: AttributionContext;
	holdings: ReadonlyArray<HoldingValueSeries>;
	periodContributions: ReadonlyArray<ReadonlyArray<number>>;
	futureFactors: ReadonlyArray<number>;
}): HoldingContributionRow[] {
	return input.holdings
		.map((holding, holdingIndex): HoldingContributionRow => {
			const contributions = input.periodContributions[holdingIndex] ?? [];
			const contribution = contributions.reduce(
				(sum, periodContribution, periodIndex) =>
					sum + periodContribution * (input.futureFactors[periodIndex] ?? 1),
				0,
			);
			const startValue = valueAtOrBefore(
				holding.values,
				input.context.firstDate,
			);
			const endValue = valueAtOrBefore(holding.values, input.context.lastDate);
			return {
				id: holding.id,
				label: holding.label,
				startWeightPct:
					startValue !== null && input.context.firstValue > 0
						? (startValue / input.context.firstValue) * 100
						: null,
				endWeightPct:
					endValue !== null && input.context.lastValue > 0
						? (endValue / input.context.lastValue) * 100
						: null,
				contribution,
				contributionPp: contribution * 100,
			};
		})
		.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}
export function calculateHoldingAttribution(input: {
	readonly snapshots: ReadonlyArray<Snapshot>;
	readonly cashFlows: ReadonlyArray<AttributedCashFlow>;
	readonly holdings: ReadonlyArray<HoldingValueSeries>;
	readonly reportingCurrency?: string;
}): HoldingAttributionResult {
	const snapshots = [...input.snapshots].sort((a, b) =>
		a.date.localeCompare(b.date),
	);
	const cashFlows = [...input.cashFlows].sort((a, b) =>
		a.date.localeCompare(b.date),
	);
	const twr = calculateTwr(snapshots, cashFlows);
	const base = {
		methodology: "modified_dietz_frongello" as const,
		totalReturn: twr.twr,
		periodCount: twr.subPeriodReturns.length,
	};
	// The recorded-cost line appears only when the request records a standalone fee.
	const hasRecordedCost = cashFlows.some((flow) => flow.recordedCost === true);
	const zeroRecordedCost = hasRecordedCost
		? { recordedCostContribution: 0, recordedCostContributionPp: 0 }
		: {};
	if (twr.dataQuality === "undefined_subperiod") {
		return {
			...base,
			status: "withheld",
			withheldReason: "undefined_subperiod",
			holdings: [],
			...zeroRecordedCost,
			residualContribution: twr.twr,
			residualContributionPp: twr.twr * 100,
			attributedPeriodCount: 0,
			rawReconciliationGap: 0,
			reconciliationGap: 0,
			fxAttribution: null,
		};
	}
	if (snapshots.length < 2 || twr.subPeriodReturns.length === 0) {
		return {
			...base,
			status: "ready",
			withheldReason: null,
			holdings: input.holdings.map((holding) => ({
				id: holding.id,
				label: holding.label,
				startWeightPct: null,
				endWeightPct: null,
				contribution: 0,
				contributionPp: 0,
			})),
			...zeroRecordedCost,
			residualContribution: 0,
			residualContributionPp: 0,
			attributedPeriodCount: 0,
			rawReconciliationGap: 0,
			reconciliationGap: 0,
			fxAttribution: null,
		};
	}
	const context = buildAttributionContext(snapshots, cashFlows);
	const {
		periodContributions,
		residualByPeriod,
		recordedCostByPeriod,
		fxEffects,
		expectedFxEffectCount,
		attributedPeriodCount,
	} = attributePeriods(context, input.holdings, twr.subPeriodReturns);
	const futureFactors = futureReturnFactors(twr.subPeriodReturns);
	const holdingRows = contributionRows({
		context,
		holdings: input.holdings,
		periodContributions,
		futureFactors,
	});
	const holdingContribution = holdingRows.reduce(
		(sum, row) => sum + row.contribution,
		0,
	);
	const linked = (byPeriod: ReadonlyArray<number>) =>
		byPeriod.reduce(
			(sum, value, periodIndex) =>
				sum + value * (futureFactors[periodIndex] ?? 1),
			0,
		);
	const linkedPeriodResidual = linked(residualByPeriod);
	// Standalone fees sit inside the unexplained period gap; they are known,
	// so they leave the residual for their own line.
	const recordedCostContribution = linked(recordedCostByPeriod);
	const rawReconciliationGap =
		twr.twr - (holdingContribution + linkedPeriodResidual);
	const residualContribution =
		linkedPeriodResidual - recordedCostContribution + rawReconciliationGap;
	const reconciliationGap =
		twr.twr -
		(holdingContribution + recordedCostContribution + residualContribution);
	const fxAttribution = aggregateFxAttribution({
		holdings: holdingRows,
		effects: fxEffects,
		futureFactors,
		expectedEffectCount: expectedFxEffectCount,
		reportingCurrency: input.reportingCurrency,
	});
	return {
		...base,
		status: "ready",
		withheldReason: null,
		holdings: holdingRows,
		...(hasRecordedCost
			? {
					recordedCostContribution,
					recordedCostContributionPp: recordedCostContribution * 100,
				}
			: {}),
		residualContribution,
		residualContributionPp: residualContribution * 100,
		attributedPeriodCount,
		rawReconciliationGap,
		reconciliationGap,
		fxAttribution,
	};
}
