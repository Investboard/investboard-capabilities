import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { METHOD_CONSTANTS } from "../../../packages/portfolio-intelligence/src/index.js";

const text = readFileSync(join(import.meta.dirname, "methods.md"), "utf8");

/** The `| constant | value |` rows of the table under "## Constants". */
function documented(): Map<string, number> {
	const section = text.split("## Constants")[1] ?? "";
	const rows = new Map<string, number>();
	for (const line of section.split("\n")) {
		const match = /^\|\s*`([A-Za-z0-9]+)`\s*\|\s*(-?[0-9.]+)\s*\|/.exec(line);
		if (match) rows.set(match[1]!, Number(match[2]));
	}
	return rows;
}

describe("methods.md stays in step with the engine", () => {
	it("documents every constant with the engine's value", () => {
		const rows = documented();
		for (const [key, value] of Object.entries(METHOD_CONSTANTS)) {
			expect(rows.has(key), `methods.md is missing ${key}`).toBe(true);
			expect(rows.get(key), key).toBe(value);
		}
	});

	it("documents no constant the engine does not have", () => {
		for (const key of documented().keys())
			expect(
				Object.hasOwn(METHOD_CONSTANTS, key),
				`unknown constant ${key}`,
			).toBe(true);
	});
});
