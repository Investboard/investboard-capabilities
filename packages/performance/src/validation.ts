import { LIMITS } from "./limits.js";
import type {
	PerformanceMethodologyVersion,
	PerformanceRequest,
} from "./types.js";

export class PerformanceInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PerformanceInputError";
	}
}

export function requireInput(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) throw new PerformanceInputError(message);
}

/** Reject accessors, prototypes, cycles, sparse arrays and non-JSON metadata. */
export function requireJson(input: unknown, nodeLimit = 2_000_000): void {
	let count = 0;
	const ancestors = new Set<object>();
	function visit(value: unknown, depth: number): void {
		requireInput(
			++count <= nodeLimit && depth <= 12,
			"Input is too large or deeply nested",
		);
		if (value === null || typeof value === "boolean") return;
		if (typeof value === "string") {
			requireInput(value.length <= 2_000, "Text exceeds 2000 characters");
			return;
		}
		if (typeof value === "number") {
			requireInput(Number.isFinite(value), "Numbers must be finite");
			return;
		}
		requireInput(
			typeof value === "object" && value !== null,
			"Inputs must be plain JSON data",
		);
		const array = Array.isArray(value);
		const prototype = Object.getPrototypeOf(value);
		requireInput(
			array
				? prototype === Array.prototype
				: prototype === Object.prototype || prototype === null,
			"Inputs must be plain JSON data",
		);
		requireInput(!ancestors.has(value), "Inputs must not contain cycles");
		const keys = Reflect.ownKeys(value);
		if (array)
			requireInput(
				value.length <= LIMITS.historyPoints &&
					keys.length === value.length + 1,
				"Arrays must be dense and bounded",
			);
		ancestors.add(value);
		for (const key of keys) {
			if (array && key === "length") continue;
			requireInput(typeof key === "string", "Keys must be strings");
			if (array)
				requireInput(
					/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length,
					"Arrays must contain only indexed values",
				);
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			requireInput(
				descriptor &&
					Object.hasOwn(descriptor, "value") &&
					descriptor.enumerable,
				"Fields must be enumerable data properties",
			);
			visit(descriptor.value, depth + 1);
		}
		ancestors.delete(value);
	}
	visit(input, 0);
}

export function shape(
	value: unknown,
	keys: readonly string[],
	label: string,
): asserts value is Record<string, unknown> {
	requireInput(
		value !== null && typeof value === "object" && !Array.isArray(value),
		`${label} must be an object`,
	);
	requireInput(
		Object.keys(value).every((key) => keys.includes(key)),
		`${label} contains an unsupported field`,
	);
}

function text(value: unknown, label: string): asserts value is string {
	requireInput(
		typeof value === "string" && value.trim().length > 0 && value.length <= 200,
		`${label} must be nonempty text of at most 200 characters`,
	);
}
function date(value: unknown): asserts value is string {
	requireInput(
		typeof value === "string" &&
			/^\d{4}-\d{2}-\d{2}$/.test(value) &&
			value >= "1900-01-01" &&
			Number.isFinite(Date.parse(value)) &&
			new Date(value).toISOString().slice(0, 10) === value,
		"Dates must be real YYYY-MM-DD calendar dates from 1900 onward",
	);
}
function number(
	value: unknown,
	max: number,
	label: string,
	min = 0,
): asserts value is number {
	requireInput(
		typeof value === "number" &&
			Number.isFinite(value) &&
			value >= min &&
			value <= max,
		`${label} is outside the supported range`,
	);
}
function money(value: unknown): asserts value is number {
	number(value, LIMITS.wealth, "Reporting-currency amount");
	requireInput(
		Math.abs(value * 100 - Math.round(value * 100)) <= 1e-5,
		"Reporting-currency amounts must be rounded to two decimals",
	);
}
function currency(value: unknown): void {
	requireInput(
		typeof value === "string" && /^[A-Z]{3}$/.test(value),
		"Currency must be an uppercase three-letter code",
	);
}
function array(value: unknown, max: number): asserts value is unknown[] {
	requireInput(
		Array.isArray(value) && value.length <= max,
		"Array exceeds its supported limit",
	);
}

export function validateRequest(
	input: unknown,
	methodologyVersion: PerformanceMethodologyVersion = "actual-position-performance-v4",
): asserts input is PerformanceRequest {
	requireJson(input);
	shape(
		input,
		[
			"reportingCurrency",
			"asOfDate",
			"ledgerComplete",
			"snapshots",
			"positions",
			"effects",
			"cashFlows",
			"recordedCosts",
			"scopeHoldingIds",
		],
		"Request",
	);
	currency(input.reportingCurrency);
	date(input.asOfDate);
	requireInput(
		typeof input.ledgerComplete === "boolean",
		"ledgerComplete must be explicit",
	);
	array(input.snapshots, LIMITS.snapshots);
	array(input.positions, LIMITS.positions);
	array(input.effects, LIMITS.ledgerEntries);
	array(input.cashFlows, LIMITS.ledgerEntries);
	if (input.recordedCosts !== undefined)
		array(input.recordedCosts, LIMITS.ledgerEntries);
	requireInput(
		input.effects.length +
			input.cashFlows.length +
			(input.recordedCosts?.length ?? 0) <=
			LIMITS.ledgerEntries,
		"Combined ledger exceeds 10000 entries",
	);
	let previous = "";
	for (const point of input.snapshots) {
		shape(point, ["date", "value"], "Snapshot");
		date(point.date);
		money(point.value);
		requireInput(
			point.date > previous && point.date <= input.asOfDate,
			"Snapshot dates must be unique, ascending and no later than asOfDate",
		);
		previous = point.date;
	}
	const ids = new Set<string>();
	let historyPoints = 0;
	for (const position of input.positions) {
		shape(
			position,
			[
				"id",
				"label",
				"instrumentId",
				"quoteCurrency",
				"currentQuantity",
				"anchorDate",
				"prices",
				"priceSource",
				"fxRates",
				"fxSource",
				"annualExpenseRatio",
			],
			"Position",
		);
		text(position.id, "Position ID");
		text(position.label, "Position label");
		requireInput(!ids.has(position.id), "Position IDs must be unique");
		ids.add(position.id);
		if (position.instrumentId !== undefined)
			text(position.instrumentId, "Instrument ID");
		currency(position.quoteCurrency);
		date(position.anchorDate);
		requireInput(
			position.anchorDate <= input.asOfDate,
			"Anchor cannot follow asOfDate",
		);
		number(position.currentQuantity, LIMITS.quantity, "Quantity");
		text(position.priceSource, "Price source");
		if (position.annualExpenseRatio != null)
			number(position.annualExpenseRatio, 1, "Annual expense ratio");
		for (const key of ["prices", "fxRates"] as const) {
			if (key === "fxRates" && position[key] === undefined) continue;
			const points = position[key];
			array(points, LIMITS.historyPoints);
			historyPoints += points.length;
			let prior = "";
			for (const point of points) {
				shape(point, ["date", "value"], "History point");
				date(point.date);
				number(
					point.value,
					key === "prices" ? LIMITS.wealth : 1_000_000,
					"Price/rate",
					Number.MIN_VALUE,
				);
				requireInput(
					point.date > prior && point.date <= input.asOfDate,
					"History dates must be unique, ascending and no later than asOfDate",
				);
				prior = point.date;
			}
		}
		if (position.fxRates !== undefined) text(position.fxSource, "FX source");
		else
			requireInput(position.fxSource === undefined, "FX source requires rates");
		if (
			position.quoteCurrency === input.reportingCurrency &&
			Array.isArray(position.fxRates)
		)
			requireInput(
				position.fxRates.every(
					(point) => (point as Record<string, unknown>).value === 1,
				),
				"Identity FX rates must equal one",
			);
	}
	requireInput(
		historyPoints <= LIMITS.historyPoints,
		"Combined history exceeds 100000 points",
	);
	if (input.scopeHoldingIds !== undefined) {
		array(input.scopeHoldingIds, LIMITS.positions);
		requireInput(
			input.scopeHoldingIds.length > 0 &&
				new Set(input.scopeHoldingIds).size === input.scopeHoldingIds.length &&
				input.scopeHoldingIds.every(
					(id) => typeof id === "string" && ids.has(id),
				),
			"Scope IDs must be nonempty, unique and reference supplied positions",
		);
	}
	const effects = new Map<string, Record<string, unknown>>();
	const transfers = new Map<string, Record<string, unknown>[]>();
	for (const effect of input.effects) {
		shape(
			effect,
			[
				"id",
				"holdingId",
				"date",
				"type",
				"quantity",
				"splitRatio",
				"order",
				"transferGroup",
			],
			"Effect",
		);
		text(effect.id, "Effect ID");
		date(effect.date);
		requireInput(
			typeof effect.holdingId === "string" && ids.has(effect.holdingId),
			"Effect must reference a supplied position",
		);
		requireInput(
			!effects.has(effect.id) && effect.date <= input.asOfDate,
			"Effect IDs must be unique and dates cannot follow asOfDate",
		);
		effects.set(effect.id, effect);
		requireInput(
			["buy", "sell", "transfer", "split", "merger"].includes(
				String(effect.type),
			),
			"Unsupported effect type",
		);
		number(
			effect.quantity,
			LIMITS.quantity,
			"Effect quantity",
			effect.type === "transfer" ? -LIMITS.quantity : 0,
		);
		if (effect.type === "buy" || effect.type === "sell")
			requireInput(effect.quantity > 0, "Trade quantity must be positive");
		if (effect.type === "transfer")
			requireInput(effect.quantity !== 0, "Transfer quantity must be nonzero");
		if (effect.type === "split" || effect.type === "merger")
			requireInput(
				effect.quantity === 0,
				"Corporate-action quantity must be zero",
			);
		if (effect.type === "split")
			number(effect.splitRatio, 1_000_000, "Split ratio", Number.MIN_VALUE);
		else
			requireInput(
				effect.splitRatio === undefined,
				"Only splits have a split ratio",
			);
		if (effect.order !== undefined)
			requireInput(
				Number.isSafeInteger(effect.order),
				"Effect order must be a safe integer",
			);
		if (effect.transferGroup !== undefined) {
			text(effect.transferGroup, "Transfer group");
			requireInput(
				effect.type === "transfer",
				"Only transfers have a transfer group",
			);
			const group = transfers.get(effect.transferGroup) ?? [];
			group.push(effect);
			transfers.set(effect.transferGroup, group);
		}
	}
	for (const group of transfers.values()) {
		requireInput(
			group.length === 2,
			"Internal transfer groups require exactly two effects",
		);
		const [a, b] = group;
		requireInput(
			a &&
				b &&
				a.date === b.date &&
				a.holdingId !== b.holdingId &&
				Number(a.quantity) === -Number(b.quantity),
			"Internal transfers must be equal, opposite, same-day movements between distinct positions",
		);
		const source = input.positions.find(
			(p) => (p as Record<string, unknown>).id === a.holdingId,
		) as Record<string, unknown>;
		const target = input.positions.find(
			(p) => (p as Record<string, unknown>).id === b.holdingId,
		) as Record<string, unknown>;
		requireInput(
			source.instrumentId &&
				source.instrumentId === target.instrumentId &&
				source.quoteCurrency === target.quoteCurrency,
			"Internal transfers require matching instrument identity and quote currency",
		);
	}
	const flowIds = new Set<string>();
	for (const flow of input.cashFlows) {
		shape(flow, ["id", "holdingId", "date", "type", "amount"], "Cash flow");
		text(flow.id, "Cash-flow ID");
		date(flow.date);
		money(flow.amount);
		requireInput(
			!flowIds.has(flow.id) && flow.date <= input.asOfDate,
			"Cash-flow IDs must be unique and dates cannot follow asOfDate",
		);
		flowIds.add(flow.id);
		requireInput(
			flow.holdingId === null ||
				(typeof flow.holdingId === "string" && ids.has(flow.holdingId)),
			"Cash flow must reference a supplied position or explicit null",
		);
		requireInput(
			["buy", "sell", "dividend"].includes(String(flow.type)),
			"Unsupported cash-flow type",
		);
		const effect = effects.get(flow.id);
		if (effect)
			requireInput(
				effect.type === flow.type &&
					effect.date === flow.date &&
					effect.holdingId === flow.holdingId,
				"A flow sharing an effect ID must match its trade",
			);
	}
	const first = (input.snapshots[0] as Record<string, unknown> | undefined)
		?.date;
	const last = (input.snapshots.at(-1) as Record<string, unknown> | undefined)
		?.date;
	for (const effect of effects.values()) {
		if (
			(effect.type === "buy" || effect.type === "sell") &&
			typeof first === "string" &&
			typeof last === "string" &&
			String(effect.date) > first &&
			String(effect.date) <= last
		)
			requireInput(
				flowIds.has(String(effect.id)),
				"Each in-window trade needs a matching funding flow with the same ID",
			);
	}
	// Methodology v3 had no standalone fees, so its snapshots cannot declare one.
	const costFields =
		methodologyVersion === "actual-position-performance-v3"
			? ["date", "holdingId", "fees", "taxes"]
			: ["date", "holdingId", "fees", "taxes", "standalone"];
	for (const cost of input.recordedCosts ?? []) {
		shape(cost, costFields, "Recorded cost");
		requireInput(
			cost.standalone === undefined || typeof cost.standalone === "boolean",
			"standalone must be a boolean",
		);
		date(cost.date);
		money(cost.fees);
		requireInput(cost.date <= input.asOfDate, "Cost cannot follow asOfDate");
		requireInput(
			cost.holdingId === null ||
				(typeof cost.holdingId === "string" && ids.has(cost.holdingId)),
			"Cost must reference a position or null",
		);
		if (cost.taxes !== null) money(cost.taxes);
	}
}
