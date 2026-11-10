import { LIMITS } from "../limits.js";

export class GoalCashInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GoalCashInputError";
	}
}

export function requireInput(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) throw new GoalCashInputError(message);
}

/** Inspect descriptors before reading values, so accessors never run. */
export function requireJson(input: unknown): void {
	const ancestors = new Set<object>();
	let nodes = 0;
	function visit(value: unknown, depth: number): void {
		requireInput(
			++nodes <= 20_000 && depth <= 16,
			"Input exceeds the JSON size/depth limit",
		);
		if (value === null || typeof value === "boolean") return;
		if (typeof value === "string") {
			requireInput(value.length <= 200, "Text exceeds 200 characters");
			return;
		}
		if (typeof value === "number") {
			requireInput(Number.isFinite(value), "Numbers must be finite");
			return;
		}
		requireInput(
			typeof value === "object",
			"Input must be plain JSON; omit undefined fields",
		);
		const array = Array.isArray(value);
		const prototype = Object.getPrototypeOf(value);
		requireInput(
			array
				? prototype === Array.prototype
				: prototype === Object.prototype || prototype === null,
			"Input must be plain JSON data",
		);
		requireInput(!ancestors.has(value), "Input must not contain cycles");
		const keys = Reflect.ownKeys(value);
		requireInput(
			keys.length <= 2001,
			"Input object/array exceeds its size limit",
		);
		if (array)
			requireInput(keys.length === value.length + 1, "Arrays must be dense");
		ancestors.add(value);
		for (const key of keys) {
			if (array && key === "length") continue;
			requireInput(typeof key === "string", "JSON keys must be strings");
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

export function text(value: unknown): asserts value is string {
	requireInput(
		typeof value === "string" && value.trim().length > 0 && value.length <= 128,
		"IDs must be nonempty text of at most 128 characters",
	);
}

export function date(value: unknown): asserts value is string {
	requireInput(
		typeof value === "string" &&
			/^\d{4}-\d{2}-\d{2}$/.test(value) &&
			value >= "1900-01-01" &&
			Number.isFinite(Date.parse(value)) &&
			new Date(value).toISOString().slice(0, 10) === value,
		"Dates must be real YYYY-MM-DD dates from 1900 onward",
	);
}

export function money(value: unknown, signed = false): asserts value is number {
	requireInput(
		typeof value === "number" &&
			Number.isFinite(value) &&
			value >= (signed ? -LIMITS.amount : 0) &&
			value <= LIMITS.amount &&
			Number(value.toFixed(2)) === value,
		"Money must have at most two decimals and lie within the supported range",
	);
}

export function array(value: unknown, max: number): asserts value is unknown[] {
	requireInput(
		Array.isArray(value) && value.length <= max,
		`Array must contain at most ${max} entries`,
	);
}
