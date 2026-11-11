import { describe, expect, it } from "vitest";
import {
	evaluateInstrumentPair,
	evaluateInstrumentResearch,
	LIMITS,
	METHODOLOGY_VERSION,
	replayInstrumentPair,
	replayInstrumentResearch,
	ResearchInputError,
} from "../src/index.js";
import type { PairRequest, ResearchRequest, Snapshot } from "../src/index.js";
import { pair, research, statement } from "./fixtures.js";

describe("public JSON boundary and retained replay", () => {
	it("replays exact JSON snapshots and isolates source, result and snapshot edits", () => {
		const input = research();
		input.statements = [statement("income", { revenue: 100, netIncome: 10 })];
		const output = evaluateInstrumentResearch(input);
		const saved = JSON.parse(JSON.stringify(output.snapshot));
		expect(replayInstrumentResearch(saved)).toEqual(output);
		input.history!.points[0]!.value = 500;
		input.statements[0]!.source.id = "edited-input";
		expect(output.snapshot).toEqual(saved);
		output.fundamentals.periods[0]!.statements[0]!.source.id = "edited-result";
		expect(output.snapshot).toEqual(saved);
		const comparison = evaluateInstrumentPair(pair());
		expect(
			replayInstrumentPair(JSON.parse(JSON.stringify(comparison.snapshot))),
		).toEqual(comparison);
	});
	it("refuses original-public-vintage requests instead of turning observation time into a filing archive", () => {
		const input = research();
		input.vintage = "original_public";
		const output = evaluateInstrumentResearch(input);
		expect(output.history.metrics).toBeNull();
		expect(output.fundamentals.periods).toEqual([]);
		expect(output.history.reasons).toEqual([
			"original_public_vintages_unavailable",
		]);
		const comparison = pair();
		comparison.vintage = "original_public";
		expect(evaluateInstrumentPair(comparison).correlations).toEqual([]);
	});
	it.each([
		"future-source",
		"future-price",
		"impossible-date",
		"future-filing",
		"wrong-listing",
		"missing-currency",
		"unknown-field",
		"non-finite",
		"negative-investment",
		"oversized-history",
		"duplicate-statement",
		"wrong-values-kind",
		"window",
		"malformed-timestamp",
		"unsafe-url",
	])("refuses %s", (mode) => {
		const input = research();
		if (mode === "future-source")
			input.history!.source.observedAt = "2027-01-01T00:00:00Z";
		if (mode === "future-price") input.history!.points[0]!.date = "2027-01-01";
		if (mode === "impossible-date")
			input.history!.points[0]!.date = "2024-02-30";
		if (mode === "future-filing") {
			input.statements = [statement("income", {})];
			input.statements[0]!.filingDate = "2027-01-01";
		}
		if (mode === "wrong-listing") input.history!.listing.currency = "USD";
		if (mode === "missing-currency")
			Reflect.deleteProperty(input, "reportingCurrency");
		if (mode === "unknown-field") Object.assign(input, { extra: "no" });
		if (mode === "non-finite")
			input.history!.points[0]!.value = Number.POSITIVE_INFINITY;
		if (mode === "negative-investment")
			input.investment = { lumpSum: -1, monthlyContribution: 0 };
		if (mode === "oversized-history")
			input.history!.points = Array.from(
				{ length: LIMITS.pointsPerSeries + 1 },
				() => ({ date: "2024-01-01", value: 100 }),
			);
		if (mode === "duplicate-statement")
			input.statements = [statement("income", {}), statement("income", {})];
		if (mode === "wrong-values-kind")
			input.statements = [statement("income", { equity: 100 })];
		if (mode === "window") input.to = input.from;
		if (mode === "malformed-timestamp") input.asOf = "2026-01-03T25:00:00Z";
		if (mode === "unsafe-url")
			input.history!.source.url = "javascript:alert(1)";
		expect(() => evaluateInstrumentResearch(input)).toThrow(ResearchInputError);
	});
	it("rejects accessors without invoking them, cycles, sparse arrays and non-JSON values", () => {
		let reads = 0;
		const input = research();
		Object.defineProperty(input.history!.source, "revision", {
			enumerable: true,
			get() {
				reads++;
				return "bad";
			},
		});
		expect(() => evaluateInstrumentResearch(input)).toThrow(ResearchInputError);
		expect(reads).toBe(0);
		const cyclic = research();
		Object.assign(cyclic, { cycle: cyclic });
		expect(() => evaluateInstrumentResearch(cyclic)).toThrow(
			ResearchInputError,
		);
		const sparse = research();
		delete sparse.history!.points[0];
		expect(() => evaluateInstrumentResearch(sparse)).toThrow(
			ResearchInputError,
		);
		const undefinedField = research();
		Object.assign(undefinedField, { history: undefined });
		expect(() => evaluateInstrumentResearch(undefinedField)).toThrow(
			ResearchInputError,
		);
	});
	it("replays instrument-research-v1 snapshots as they were saved", () => {
		const input = research();
		input.investment = { lumpSum: 0, monthlyContribution: 0 };
		const saved: Snapshot<ResearchRequest> = {
			methodologyVersion: "instrument-research-v1",
			request: input,
		};
		const replayed = replayInstrumentResearch(saved);
		expect(replayed.snapshot.methodologyVersion).toBe("instrument-research-v1");
		expect(replayed.history.investment?.contributionReturn).toBe(0);
		const current = evaluateInstrumentResearch(input);
		expect(current.snapshot.methodologyVersion).toBe(METHODOLOGY_VERSION);
		expect(current.history.investment?.contributionReturn).toBeNull();
		const mixed = pair();
		mixed.series[1].basis = "price";
		const savedPair: Snapshot<PairRequest> = {
			methodologyVersion: "instrument-research-v1",
			request: mixed,
		};
		const legacyPair = replayInstrumentPair(savedPair);
		expect(legacyPair.reasons).not.toContain("mixed_return_basis");
		expect(legacyPair.snapshot.methodologyVersion).toBe(
			"instrument-research-v1",
		);
		const currentPair = evaluateInstrumentPair(mixed);
		expect({
			...currentPair,
			snapshot: legacyPair.snapshot,
			reasons: legacyPair.reasons,
		}).toEqual(legacyPair);
	});
	it("rejects unsupported snapshot versions and tampered saved listing identities", () => {
		const output = evaluateInstrumentResearch(research());
		const bad = JSON.parse(JSON.stringify(output.snapshot));
		bad.methodologyVersion = "future-method";
		expect(() => replayInstrumentResearch(bad)).toThrow("methodology");
		const savedPair = JSON.parse(
			JSON.stringify(evaluateInstrumentPair(pair()).snapshot),
		);
		savedPair.request.series[0].listing.exchange = "OTHER";
		expect(() => replayInstrumentPair(savedPair)).toThrow("exact listing");
	});
});
