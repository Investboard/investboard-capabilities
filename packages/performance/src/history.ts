import { replayPositionHistory } from "./internal/performance/position-replay.js";
import type {
	HoldingValueSeries,
	AttributedCashFlow,
} from "./internal/performance/holding-attribution.js";
import { LIMITS } from "./limits.js";
import type {
	PerformanceRequest,
	PerformancePosition,
	PositionEvidence,
	DatedValue,
	TransferValuation,
	PerformanceEffect,
} from "./types.js";
import { requireInput } from "./validation.js";
import { roundMoney } from "./internal/money/cents.js";
import { allocateTransferRounding } from "./internal/transfer-rounding.js";

/** Positive dated evidence only; no forward lookups or spot-rate fallback. */
export function datedValue(
	points: readonly DatedValue[],
	date: string,
): number | null {
	let low = 0;
	let high = points.length - 1;
	let point: DatedValue | undefined;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const candidate = points[middle];
		if (candidate && candidate.date <= date) {
			point = candidate;
			low = middle + 1;
		} else high = middle - 1;
	}
	return point &&
		(Date.parse(date) - Date.parse(point.date)) / 86_400_000 <=
			LIMITS.maxCarryDays
		? point.value
		: null;
}

function rate(
	position: PerformancePosition,
	date: string,
	currency: string,
): number | null {
	return position.quoteCurrency === currency
		? 1
		: datedValue(position.fxRates ?? [], date);
}

export function prepareHistory(request: PerformanceRequest) {
	const first = request.snapshots[0]!.date;
	const last = request.snapshots.at(-1)!.date;
	const inside = (date: string) => date >= first && date <= last;
	const dates = [
		...new Set([
			...request.snapshots.map((p) => p.date),
			...request.effects.filter((e) => inside(e.date)).map((e) => e.date),
			...request.cashFlows.filter((f) => inside(f.date)).map((f) => f.date),
		]),
	].sort();
	requireInput(
		dates.length * request.positions.length <= LIMITS.valuationCells,
		"Valuation grid exceeds one million cells",
	);
	const replay = replayPositionHistory({
		positions: request.positions.map((p) => ({
			id: p.id,
			label: p.label,
			currentQuantity: p.currentQuantity,
			anchorDate: p.anchorDate,
		})),
		effects: request.effects.map((effect, index) => ({
			...effect,
			order: effect.order ?? index,
		})),
		valuationDates: dates,
	});
	const unsupported = new Set(replay.unsupportedHoldingIds);
	const evidence: PositionEvidence[] = [];
	const series: HoldingValueSeries[] = [];
	const unknownDates = new Set<string>();
	const paths = new Map<string, Map<string, number>>();
	for (const position of replay.positions) {
		const input = request.positions.find((p) => p.id === position.id)!;
		const quantities = new Map(
			position.points.map((p) => [p.date, p.quantity]),
		);
		paths.set(position.id, quantities);
		const reason = unsupported.has(position.id)
			? "unsupported_position_effect"
			: position.wentNegative
				? "negative_position_history"
				: !position.reconcilesToCurrent ||
						position.points.some(
							(p) =>
								!Number.isFinite(p.quantity) || p.quantity > LIMITS.quantity,
						)
					? "position_reconciliation_failed"
					: null;
		const held = position.points.some((p) => Math.abs(p.quantity) > 1e-10);
		if (reason)
			for (const point of position.points)
				if (point.quantity !== 0 || unsupported.has(position.id))
					unknownDates.add(point.date);
		let misses = 0;
		if (!reason && held) {
			const fxRates = dates.map((date) => ({
				date,
				value: rate(input, date, request.reportingCurrency),
			}));
			const values = dates.map((date, index) => {
				const units = quantities.get(date) ?? 0;
				if (Math.abs(units) <= 1e-10) return { date, value: 0 };
				const price = datedValue(input.prices, date);
				const fx = fxRates[index]?.value;
				if (price === null || fx == null) {
					misses++;
					return { date, value: null };
				}
				const value = units * price * fx;
				requireInput(
					Number.isFinite(value) && value <= LIMITS.wealth,
					"Calculated position value exceeds supported wealth",
				);
				return { date, value };
			});
			series.push({
				id: input.id,
				label: input.label,
				currency: input.quoteCurrency,
				fxRates,
				values,
			});
		}
		evidence.push({
			id: input.id,
			source: position.source,
			status: reason ? "excluded" : held ? "included" : "not_held",
			reason,
			missingValuationCount: misses,
		});
	}
	for (let index = 0; index < dates.length; index++) {
		const total = series.reduce(
			(sum, s) => sum + (s.values[index]?.value ?? 0),
			0,
		);
		requireInput(
			total <= LIMITS.wealth,
			"Calculated portfolio value exceeds supported wealth",
		);
	}
	return {
		dates,
		replay: replay.positions,
		evidence,
		series,
		unknownDates,
		paths,
	};
}

export type PreparedHistory = ReturnType<typeof prepareHistory>;

/** Require observed boundaries and independent dated evidence on both sides. */
export function valueTransfers(
	request: PerformanceRequest,
	history: PreparedHistory,
) {
	const first = request.snapshots[0]!.date;
	const last = request.snapshots.at(-1)!.date;
	const flows: AttributedCashFlow[] = [];
	const valuations: TransferValuation[] = [];
	const rows: {
		effects: readonly PerformanceEffect[];
		rawAmount: number;
		evidence: TransferValuation;
	}[] = [];
	const processed = new Set<string>();
	for (const effect of request.effects) {
		if (
			effect.type !== "transfer" ||
			effect.date <= first ||
			effect.date > last ||
			processed.has(effect.id)
		)
			continue;
		const group = effect.transferGroup
			? request.effects.filter((e) => e.transferGroup === effect.transferGroup)
			: [effect];
		if (!request.snapshots.some((p) => p.date === effect.date)) return null;
		let value: number | undefined;
		let sourcePrice = 0;
		let sourceFx = 0;
		let quoteCurrency = "";
		let sourceAmount = 0;
		for (const leg of group) {
			if (
				!history.evidence.some(
					(p) => p.id === leg.holdingId && p.status === "included",
				)
			)
				return null;
			const input = request.positions.find((p) => p.id === leg.holdingId)!;
			const price = datedValue(input.prices, leg.date);
			const fx = rate(input, leg.date, request.reportingCurrency);
			if (price === null || fx === null) return null;
			const rawAmount = Math.abs(leg.quantity) * price * fx;
			requireInput(
				Number.isFinite(rawAmount) && rawAmount <= LIMITS.wealth,
				"Transfer valuation exceeds supported wealth",
			);
			const amount = roundMoney(rawAmount);
			if (value !== undefined && value !== amount) return null;
			value = amount;
			if (leg.quantity < 0 || group.length === 1) {
				sourcePrice = price;
				sourceFx = fx;
				quoteCurrency = input.quoteCurrency;
				sourceAmount = rawAmount;
			}
			processed.add(leg.id);
		}
		if (value === undefined) return null;
		rows.push({
			effects: group,
			rawAmount: sourceAmount,
			evidence: {
				effectIds: group.map((e) => e.id),
				date: effect.date,
				internal: group.length === 2,
				value,
				roundingAdjustment: 0,
				price: sourcePrice,
				fxRate: sourceFx,
				quoteCurrency,
			},
		});
	}
	const externalByDate = new Map<string, typeof rows>();
	for (const row of rows) {
		if (row.evidence.internal) continue;
		const day = externalByDate.get(row.evidence.date) ?? [];
		day.push(row);
		externalByDate.set(row.evidence.date, day);
	}
	for (const day of externalByDate.values()) {
		day.sort((a, b) =>
			a.effects[0]!.id < b.effects[0]!.id
				? -1
				: a.effects[0]!.id > b.effects[0]!.id
					? 1
					: 0,
		);
		const amounts = allocateTransferRounding(
			day.map((row) => row.rawAmount * Math.sign(row.effects[0]!.quantity)),
		);
		day.forEach((row, index) => {
			const value = Math.abs(amounts[index]!);
			row.evidence = {
				...row.evidence,
				value,
				roundingAdjustment: roundMoney(value - row.evidence.value),
			};
		});
	}
	for (const row of rows) {
		for (const leg of row.effects)
			flows.push({
				date: leg.date,
				holdingId: leg.holdingId,
				type: leg.quantity < 0 ? "sell" : "buy",
				amount: leg.quantity < 0 ? -row.evidence.value : row.evidence.value,
			});
		valuations.push(row.evidence);
	}
	return { flows, valuations };
}
