import { datedValue, type PreparedHistory } from "./history.js";
import type { AttributedCashFlow } from "./internal/performance/holding-attribution.js";
import type { PerformanceRequest, PerformanceWealthBridge } from "./types.js";

/** Opening-unit monetary price/FX effects are independent symmetric products. */
export function buildWealthBridge(
	request: PerformanceRequest,
	history: PreparedHistory,
	flows: readonly AttributedCashFlow[],
): PerformanceWealthBridge {
	const first = request.snapshots[0]!;
	const last = request.snapshots.at(-1)!;
	const selected = flows.filter(
		(f) =>
			f.date <= last.date &&
			(f.date > first.date || (f.date === first.date && f.type === "dividend")),
	);
	const securityFunding = selected.reduce(
		(sum, f) =>
			sum +
			(f.type === "buy"
				? Math.abs(f.amount)
				: f.type === "sell"
					? -Math.abs(f.amount)
					: 0),
		0,
	);
	const income = selected.reduce(
		(sum, f) => sum + (f.type === "dividend" ? Math.abs(f.amount) : 0),
		0,
	);
	const costs = request.recordedCosts?.filter(
		(c) => c.date > first.date && c.date <= last.date,
	);
	const recordedFees = costs ? costs.reduce((sum, c) => sum + c.fees, 0) : null;
	const recordedTaxes =
		costs && costs.every((c) => c.taxes !== null)
			? costs.reduce((sum, c) => sum + (c.taxes ?? 0), 0)
			: null;
	let localPrice = 0;
	let quoteFx = 0;
	let unvaluedIntervalCount = 0;
	let hasMarketEvidence = false;
	const corporateDates = new Map<string, Set<string>>();
	for (const effect of request.effects) {
		if (effect.type !== "split" && effect.type !== "merger") continue;
		const dates = corporateDates.get(effect.holdingId) ?? new Set<string>();
		dates.add(effect.date);
		corporateDates.set(effect.holdingId, dates);
	}
	for (const position of request.positions) {
		const path = history.paths.get(position.id)!;
		const included = history.evidence.some(
			(p) => p.id === position.id && p.status === "included",
		);
		for (let index = 1; index < history.dates.length; index++) {
			const from = history.dates[index - 1]!;
			const to = history.dates[index]!;
			const units = path.get(from) ?? 0;
			if (units === 0) continue;
			const p0 = datedValue(position.prices, from);
			const p1 = datedValue(position.prices, to);
			const r0 =
				position.quoteCurrency === request.reportingCurrency
					? 1
					: datedValue(position.fxRates ?? [], from);
			const r1 =
				position.quoteCurrency === request.reportingCurrency
					? 1
					: datedValue(position.fxRates ?? [], to);
			if (
				!included ||
				p0 === null ||
				p1 === null ||
				r0 === null ||
				r1 === null ||
				// Every in-window effect date is already a valuation boundary.
				corporateDates.get(position.id)?.has(to)
			) {
				unvaluedIntervalCount++;
				continue;
			}
			hasMarketEvidence = true;
			localPrice += (units * (p1 - p0) * (r0 + r1)) / 2;
			quoteFx += (units * (r1 - r0) * (p0 + p1)) / 2;
		}
	}
	const netExternalFlows = securityFunding - income;
	const investmentResult = last.value - first.value - netExternalFlows;
	const explained =
		income + localPrice + quoteFx - (recordedFees ?? 0) - (recordedTaxes ?? 0);
	const residual = investmentResult - explained;
	return {
		currency: request.reportingCurrency,
		openingWealth: first.value,
		closingWealth: last.value,
		securityFunding,
		distributedIncome: income,
		netExternalFlows,
		investmentResult,
		localPrice: hasMarketEvidence ? localPrice : null,
		quoteFx: hasMarketEvidence ? quoteFx : null,
		recordedFees,
		recordedTaxes,
		residual,
		reconciliationGap:
			last.value - (first.value + netExternalFlows + explained + residual),
		unvaluedIntervalCount: request.positions.length
			? unvaluedIntervalCount
			: history.dates.length - 1,
		fundExpensesEmbedded: true,
	};
}
