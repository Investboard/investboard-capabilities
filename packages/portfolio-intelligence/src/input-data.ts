import { LIMITS } from "./limits.js";

export class PortfolioInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PortfolioInputError";
	}
}

export function requireInput(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) throw new PortfolioInputError(message);
}

/** Check data properties without evaluating getters. Optional object fields may be undefined. */
export function validateJsonInput(input: unknown): void {
	const ancestors = new Set<object>();
	let nodes = 0;
	let textLength = 0;
	function checkText(text: string): void {
		textLength += text.length;
		requireInput(
			text.length <= LIMITS.textLength && textLength <= LIMITS.inputTextLength,
			"Input text exceeds the length limit",
		);
	}
	function visit(value: unknown, depth: number): void {
		requireInput(
			++nodes <= LIMITS.inputNodes && depth <= LIMITS.inputDepth,
			"Input exceeds the JSON size or depth limit",
		);
		if (value === null || value === undefined || typeof value === "boolean")
			return;
		if (typeof value === "number") {
			requireInput(Number.isFinite(value), "Input numbers must be finite");
			return;
		}
		if (typeof value === "string") {
			checkText(value);
			return;
		}
		requireInput(typeof value === "object", "Inputs must be plain JSON data");
		const array = Array.isArray(value);
		const prototype = Object.getPrototypeOf(value);
		requireInput(
			array
				? prototype === Array.prototype
				: prototype === Object.prototype || prototype === null,
			"Inputs must be plain JSON data",
		);
		requireInput(!ancestors.has(value), "Input contains a cycle");
		if (array)
			requireInput(
				value.length <= LIMITS.inputNodes - nodes,
				"Input exceeds the JSON size limit",
			);
		const keys = Reflect.ownKeys(value);
		requireInput(
			keys.length <= LIMITS.inputNodes - nodes + Number(array),
			"Input exceeds the JSON size limit",
		);
		if (array)
			requireInput(
				keys.length === value.length + 1,
				"Input arrays must be dense",
			);
		ancestors.add(value);
		for (const key of keys) {
			if (array && key === "length") continue;
			requireInput(
				typeof key === "string",
				"Input fields must have string keys",
			);
			if (!array) checkText(key);
			if (array)
				requireInput(
					/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length,
					"Input arrays may contain only indexed values",
				);
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			requireInput(
				descriptor?.enumerable && Object.hasOwn(descriptor, "value"),
				"Input fields must be enumerable data properties",
			);
			requireInput(
				!array || descriptor.value !== undefined,
				"Array elements must be JSON values",
			);
			visit(descriptor.value, depth + 1);
		}
		ancestors.delete(value);
	}
	visit(input, 0);
}

/** Only use after validation. Omit optional undefined fields and canonicalize signed zero. */
export function copyJsonInput<T>(input: T): T {
	return JSON.parse(JSON.stringify(input)) as T;
}

/** A successful result must preserve its numeric values when saved as JSON. */
export function requireFiniteResult(value: unknown): void {
	if (typeof value === "number")
		requireInput(
			Number.isFinite(value),
			"Calculation exceeds the supported numeric range",
		);
	if (value && typeof value === "object")
		for (const child of Object.values(value)) requireFiniteResult(child);
}

export function snapshotRequest<T>(
	snapshot: { methodologyVersion: string; request: T },
	expected: string,
	evaluator: string,
): T {
	requireInput(
		typeof snapshot === "object" &&
			snapshot !== null &&
			!Array.isArray(snapshot),
		"Snapshot must be a plain JSON object",
	);
	const prototype = Object.getPrototypeOf(snapshot);
	requireInput(
		prototype === Object.prototype || prototype === null,
		"Snapshot must be a plain JSON object",
	);
	const method = Object.getOwnPropertyDescriptor(
		snapshot,
		"methodologyVersion",
	);
	const request = Object.getOwnPropertyDescriptor(snapshot, "request");
	requireInput(
		method?.enumerable &&
			request?.enumerable &&
			Object.hasOwn(method, "value") &&
			Object.hasOwn(request, "value") &&
			Reflect.ownKeys(snapshot).length === 2,
		"Snapshot must contain its methodologyVersion and request",
	);
	const version = method.value;
	requireInput(
		typeof version === "string" && version.length <= LIMITS.textLength,
		"Snapshot methodologyVersion must be a string",
	);
	requireInput(
		version === expected,
		"This snapshot was saved with methodology " +
			version +
			"; this version replays " +
			expected +
			". Use the original package for historical replay, or explicitly call " +
			evaluator +
			"(snapshot.request) for a new evaluation. Keep the original snapshot.",
	);
	return request.value as T;
}
