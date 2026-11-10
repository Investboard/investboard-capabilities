import type { RebalancingConfiguration } from "../types.js";

export class RebalanceInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RebalanceInputError";
	}
}
export function requireInput(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) throw new RebalanceInputError(message);
}
export function requireShape(
	value: unknown,
	keys: readonly string[],
	label: string,
): asserts value is Record<string, unknown> {
	requireInput(
		value !== null && typeof value === "object" && !Array.isArray(value),
		`${label} must be an object`,
	);
	requireInput(
		Object.getPrototypeOf(value) === Object.prototype ||
			Object.getPrototypeOf(value) === null,
		`${label} must be plain data`,
	);
	requireInput(
		Reflect.ownKeys(value).every(
			(key) => typeof key === "string" && keys.includes(key),
		),
		`${label} contains an unsupported field`,
	);
	for (const d of Object.values(Object.getOwnPropertyDescriptors(value)))
		requireInput(
			Object.hasOwn(d, "value") && d.enumerable,
			`${label} must contain enumerable data properties`,
		);
}
export function requireText(
	value: unknown,
	label: string,
	maximumLength: number,
): asserts value is string {
	requireInput(
		typeof value === "string" &&
			value.trim().length > 0 &&
			value.length <= maximumLength,
		`${label} must be a nonempty string within the configured text limit`,
	);
}
/** Reject lossy snapshots and accessors before a calculation reads their values. */
export function requireJson(
	value: unknown,
	limits: RebalancingConfiguration["limits"],
	ancestors = new Set<object>(),
	depth = 0,
	budget = { nodes: 0 },
): void {
	requireInput(
		++budget.nodes <= limits.jsonNodes,
		"Snapshot exceeds the supported data size",
	);
	requireInput(
		depth <= limits.jsonDepth,
		"Snapshot nesting exceeds the supported depth",
	);
	if (value === null || typeof value === "string" || typeof value === "boolean")
		return;
	if (typeof value === "number") {
		requireInput(Number.isFinite(value), "Snapshot numbers must be finite");
		return;
	}
	requireInput(
		typeof value === "object",
		"Snapshot fields must be JSON data; omit optional fields instead of supplying undefined",
	);
	const array = Array.isArray(value);
	if (array)
		requireInput(
			value.length <= limits.collectionEntries,
			"Snapshot arrays exceed the supported size",
		);
	requireInput(
		Object.keys(value).length <= limits.collectionEntries,
		"Snapshot objects exceed the supported size",
	);
	const prototype = Object.getPrototypeOf(value);
	requireInput(
		array
			? prototype === Array.prototype
			: prototype === Object.prototype || prototype === null,
		"Snapshot fields must be plain JSON data",
	);
	requireInput(
		!ancestors.has(value),
		"Snapshot fields must not contain cycles",
	);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(value)) {
		requireInput(typeof key === "string", "Snapshot keys must be strings");
		if (array && key === "length") continue;
		const descriptor = descriptors[key];
		requireInput(
			descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable,
			"Snapshot fields must be enumerable data properties",
		);
	}
	if (array)
		requireInput(
			Object.keys(value).length === value.length &&
				Array.from({ length: value.length }, (_, i) =>
					Object.hasOwn(value, i),
				).every(Boolean),
			"Snapshot arrays must contain only dense indexed values",
		);
	ancestors.add(value);
	for (const child of Object.values(value))
		requireJson(child, limits, ancestors, depth + 1, budget);
	ancestors.delete(value);
}
