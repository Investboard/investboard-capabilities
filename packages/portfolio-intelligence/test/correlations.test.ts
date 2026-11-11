import { describe, expect, it } from "vitest";
import {
	CORRELATION_METHODOLOGY_VERSION,
	measureCorrelations,
	PortfolioInputError,
	replayCorrelations,
} from "../src/index.js";
import type { CorrelationRequest } from "../src/index.js";
import { generator } from "./support/property.js";

function weekdays(from: string, to: string): string[] {
	const out: string[] = [];
	for (
		let t = Date.parse(`${from}T00:00:00Z`);
		t <= Date.parse(`${to}T00:00:00Z`);
		t += 86_400_000
	) {
		const day = new Date(t).getUTCDay();
		if (day !== 0 && day !== 6)
			out.push(new Date(t).toISOString().slice(0, 10));
	}
	return out;
}

const DATES = weekdays("2025-06-02", "2026-10-29");

function walk(seed: number): number[] {
	const g = generator(seed);
	let price = 100;
	return DATES.map(() => {
		price *= 1 + g.double(-0.02, 0.02);
		return price;
	});
}

function request(
	overrides: Partial<CorrelationRequest> = {},
): CorrelationRequest {
	const a = walk(1);
	const c = walk(2);
	const d = walk(3);
	return {
		asOf: "2026-10-30",
		baseCurrency: "EUR",
		holdings: [
			{ id: "A", value: 300, priceCurrency: "EUR" },
			{ id: "B", value: 300, priceCurrency: "EUR" },
			{ id: "C", value: 200, priceCurrency: "EUR" },
			{ id: "D", value: 200, priceCurrency: "EUR" },
		],
		closes: DATES.flatMap((date, i) => [
			{ id: "A", date, close: a[i]! },
			{ id: "B", date, close: a[i]! * 2 },
			{ id: "C", date, close: c[i]! },
			{ id: "D", date, close: d[i]! },
		]),
		...overrides,
	};
}

describe("measureCorrelations", () => {
	it("reads the app's four windows in order", () => {
		const result = measureCorrelations(request());
		expect(result.windows.map((w) => w.window)).toEqual([
			"1y",
			"3y",
			"5y",
			"10y",
		]);
		expect(result.windows.map((w) => w.status)).toEqual([
			"available",
			"insufficient_history",
			"insufficient_history",
			"insufficient_history",
		]);
		const one = result.windows[0]!;
		if (one.status !== "available") throw new Error("expected a reading");
		expect(one.weeks).toBe(52);
		expect(result.anchor).toBe("2026-10-23");
		expect(result.methodologyVersion).toBe(CORRELATION_METHODOLOGY_VERSION);
	});

	it("finds two series that move together close and near-duplicate", () => {
		const one = measureCorrelations(request()).windows[0]!;
		if (one.status !== "available") throw new Error("expected a reading");
		const pair = one.pairs.find((p) => [p.a, p.b].sort().join() === "A,B");
		expect(pair?.correlation).toBeCloseTo(1, 10);
		expect(pair?.band).toBe("close");
		expect(one.nearDuplicates.map((p) => [p.a, p.b].sort().join())).toContain(
			"A,B",
		);
	});

	it("sorts closes given out of date order", () => {
		const sorted = request();
		const shuffled = { ...sorted, closes: [...sorted.closes].reverse() };
		expect(measureCorrelations(shuffled).windows).toEqual(
			measureCorrelations(sorted).windows,
		);
	});

	it("rejects a duplicate date for one holding", () => {
		const base = request();
		const dup = { ...base, closes: [...base.closes, { ...base.closes[0]! }] };
		expect(() => measureCorrelations(dup)).toThrow(PortfolioInputError);
		expect(() => measureCorrelations(dup)).toThrow(/duplicate/i);
	});

	it("converts a series in another currency to the base currency", () => {
		const base = request();
		const converted: CorrelationRequest = {
			...base,
			holdings: base.holdings.map((h) =>
				h.id === "C" ? { ...h, priceCurrency: "USD" } : h,
			),
			closes: base.closes.map((c) =>
				c.id === "C" ? { ...c, close: c.close / 0.9 } : c,
			),
			fx: DATES.map((date) => ({ currency: "USD", date, rateToBase: 0.9 })),
		};
		const a = measureCorrelations(base).windows[0]!;
		const b = measureCorrelations(converted).windows[0]!;
		if (a.status !== "available" || b.status !== "available")
			throw new Error("expected readings");
		for (const pair of a.pairs) {
			const twin = b.pairs.find((p) => p.a === pair.a && p.b === pair.b);
			expect(twin?.correlation).toBeCloseTo(pair.correlation, 9);
		}
	});

	it("excludes a foreign series without FX as no_fx", () => {
		const base = request();
		const result = measureCorrelations({
			...base,
			holdings: base.holdings.map((h) =>
				h.id === "D" ? { ...h, priceCurrency: "USD" } : h,
			),
		});
		const one = result.windows[0]!;
		if (one.status !== "available") throw new Error("expected a reading");
		expect(one.coverage.exclusions.map((e) => [e.id, e.reason])).toContainEqual(
			["D", "no_fx"],
		);
	});

	it("excludes a holding without closes or value", () => {
		const base = request();
		const result = measureCorrelations({
			...base,
			holdings: [
				...base.holdings,
				{ id: "E", value: 50, priceCurrency: "EUR" },
				{ id: "F", value: null, priceCurrency: "EUR" },
			],
		});
		const one = result.windows[0]!;
		if (one.status !== "available") throw new Error("expected a reading");
		const reasons = Object.fromEntries(
			one.coverage.exclusions.map((e) => [e.id, e.reason]),
		);
		expect(reasons.E).toBe("no_market_series");
		expect(reasons.F).toBe("no_value");
	});

	it("replays a saved snapshot to the same result", () => {
		const result = measureCorrelations(request());
		expect(
			replayCorrelations(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
	});
});
