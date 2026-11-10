// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
export interface PositionEffect {
	readonly id: string;
	readonly holdingId: string;
	readonly date: string;
	readonly type: string;
	readonly quantity: number;
	readonly splitRatio?: number | null;
	readonly order?: number;
}
export interface PositionSeed {
	readonly id: string;
	readonly label: string;
	readonly currentQuantity: number;
	readonly anchorDate: string;
}
export interface PositionQuantityPoint {
	readonly date: string;
	readonly quantity: number;
}
export type PositionHistorySource = "ledger" | "opening_balance";
export interface ReplayedPosition {
	readonly id: string;
	readonly label: string;
	readonly source: PositionHistorySource;
	readonly openingQuantity: number;
	readonly effectiveFrom: string;
	readonly points: ReadonlyArray<PositionQuantityPoint>;
	readonly finalQuantity: number;
	readonly minimumQuantity: number;
	readonly wentNegative: boolean;
	readonly reconcilesToCurrent: boolean;
}
export interface PositionReplayResult {
	readonly positions: ReadonlyArray<ReplayedPosition>;
	readonly unsupportedEffectIds: ReadonlyArray<string>;
	readonly unsupportedHoldingIds: ReadonlyArray<string>;
}
export interface EffectSimItem {
	readonly type: string;
	readonly quantity: number;
	readonly splitRatio?: number | null;
}
export interface EffectNet {
	readonly a: number;
	readonly b: number;
}
const QUANTITY_EPSILON = 1e-7;
function roundQuantity(quantity: number): number {
	const rounded = Number(quantity.toFixed(8));
	return rounded === 0 ? 0 : rounded;
}
function effectPriority(effect: PositionEffect): number {
	if (effect.type === "split") return 0;
	if (
		effect.type === "sell" ||
		(effect.type === "transfer" && effect.quantity < 0)
	) {
		return 2;
	}
	return 1;
}
function compareEffects(a: PositionEffect, b: PositionEffect): number {
	const dateOrder = a.date.localeCompare(b.date);
	if (dateOrder !== 0) return dateOrder;
	const priorityOrder = effectPriority(a) - effectPriority(b);
	if (a.type === "split" || b.type === "split") {
		if (priorityOrder !== 0) return priorityOrder;
	}
	const callerOrder = (a.order ?? 0) - (b.order ?? 0);
	if (callerOrder !== 0) return callerOrder;
	if (priorityOrder !== 0) return priorityOrder;
	return a.id.localeCompare(b.id);
}
export function simulateEffectNet(
	items: ReadonlyArray<EffectSimItem>,
): EffectNet {
	let a = 1;
	let b = 0;
	for (const item of items) {
		switch (item.type) {
			case "buy":
				b += Math.abs(item.quantity);
				break;
			case "sell":
				b -= Math.abs(item.quantity);
				break;
			case "transfer":
				b += item.quantity;
				break;
			case "split": {
				const ratio = Number(item.splitRatio);
				if (Number.isFinite(ratio) && ratio > 0 && ratio !== 1) {
					a *= ratio;
					b *= ratio;
				}
				break;
			}
			default:
				break;
		}
	}
	return { a, b };
}
export function solveOpeningQuantity(
	currentQuantity: number,
	net: EffectNet,
): number {
	if (net.a === 0) return roundQuantity(currentQuantity);
	return roundQuantity((currentQuantity - net.b) / net.a);
}
function applyEffect(quantity: number, effect: PositionEffect): number {
	switch (effect.type) {
		case "buy":
			return roundQuantity(quantity + Math.abs(effect.quantity));
		case "sell":
			return roundQuantity(quantity - Math.abs(effect.quantity));
		case "transfer":
			return roundQuantity(quantity + effect.quantity);
		case "split": {
			const ratio = Number(effect.splitRatio);
			return Number.isFinite(ratio) && ratio > 0
				? roundQuantity(quantity * ratio)
				: quantity;
		}
		default:
			return quantity;
	}
}
function quantityPointsFor(input: {
	effects: ReadonlyArray<PositionEffect>;
	valuationDates: ReadonlyArray<string>;
	openingQuantity: number;
	source: PositionHistorySource;
	effectiveFrom: string;
}): PositionQuantityPoint[] {
	let quantity = input.source === "opening_balance" ? 0 : input.openingQuantity;
	let effectIndex = 0;
	let openingApplied = input.source === "ledger";
	const points: PositionQuantityPoint[] = [];
	for (const date of input.valuationDates) {
		if (!openingApplied && date >= input.effectiveFrom) {
			quantity = input.openingQuantity;
			openingApplied = true;
		}
		while (effectIndex < input.effects.length) {
			const effect = input.effects[effectIndex];
			if (!effect || effect.date > date) break;
			if (!openingApplied) {
				quantity = input.openingQuantity;
				openingApplied = true;
			}
			quantity = applyEffect(quantity, effect);
			effectIndex += 1;
		}
		points.push({ date, quantity });
	}
	return points;
}
function replayOnePosition(
	position: PositionSeed,
	effects: ReadonlyArray<PositionEffect>,
	valuationDates: ReadonlyArray<string>,
): ReplayedPosition {
	const net = simulateEffectNet(effects);
	const openingQuantity = solveOpeningQuantity(position.currentQuantity, net);
	const source: PositionHistorySource =
		Math.abs(openingQuantity) <= QUANTITY_EPSILON
			? "ledger"
			: "opening_balance";
	const effectiveFrom =
		source === "opening_balance"
			? position.anchorDate
			: (valuationDates[0] ?? position.anchorDate);
	const points = quantityPointsFor({
		effects,
		valuationDates,
		openingQuantity,
		source,
		effectiveFrom,
	});
	let finalQuantity = openingQuantity;
	let minimumQuantity = openingQuantity;
	for (const effect of effects) {
		finalQuantity = applyEffect(finalQuantity, effect);
		minimumQuantity = Math.min(minimumQuantity, finalQuantity);
	}
	return {
		id: position.id,
		label: position.label,
		source,
		openingQuantity,
		effectiveFrom,
		points,
		finalQuantity,
		minimumQuantity,
		wentNegative: minimumQuantity < -QUANTITY_EPSILON,
		reconcilesToCurrent:
			Math.abs(finalQuantity - position.currentQuantity) <= QUANTITY_EPSILON,
	};
}
export function replayPositionHistory(input: {
	readonly positions: ReadonlyArray<PositionSeed>;
	readonly effects: ReadonlyArray<PositionEffect>;
	readonly valuationDates: ReadonlyArray<string>;
}): PositionReplayResult {
	const valuationDates = [...new Set(input.valuationDates)].sort();
	const effectsByHolding = new Map<string, PositionEffect[]>();
	const unsupportedEffectIds: string[] = [];
	const unsupportedHoldingIds = new Set<string>();
	for (const effect of input.effects) {
		if (effect.type === "merger") {
			unsupportedEffectIds.push(effect.id);
			unsupportedHoldingIds.add(effect.holdingId);
			continue;
		}
		const bucket = effectsByHolding.get(effect.holdingId) ?? [];
		bucket.push(effect);
		effectsByHolding.set(effect.holdingId, bucket);
	}
	const positions = input.positions.map((position) =>
		replayOnePosition(
			position,
			(effectsByHolding.get(position.id) ?? []).sort(compareEffects),
			valuationDates,
		),
	);
	return {
		positions,
		unsupportedEffectIds,
		unsupportedHoldingIds: [...unsupportedHoldingIds],
	};
}
