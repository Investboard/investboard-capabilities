import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePortfolio, measureCorrelations } from "../src/index.js";
import type { CorrelationRequest, PortfolioRequest } from "../src/index.js";

interface Book {
	name: string;
	description: string;
	basisParity: boolean;
	request: PortfolioRequest;
	correlation?: CorrelationRequest;
}

const DIR = join(import.meta.dirname, "..", "parity");
const books: Book[] = readdirSync(DIR)
	.filter((f) => f.endsWith(".json"))
	.sort()
	.map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Book);

describe("parity corpus", () => {
	it("holds the seven sample portfolios", () => {
		expect(books.map((b) => b.name)).toEqual([
			"issuers",
			"partial",
			"read-through",
			"reported-class",
			"sealed",
			"shared-reit",
			"world-pair",
		]);
	});

	for (const book of books) {
		it(`${book.name}: analyzes with conserved weights and no NaN`, () => {
			const result = analyzePortfolio(book.request);
			expect(JSON.stringify(result)).not.toContain("NaN");
			const positions = result.positions.reduce((s, p) => s + p.weight, 0);
			const basis = result.basis.reduce((s, b) => s + b.weight, 0);
			expect(positions).toBeCloseTo(1, 6);
			expect(basis).toBeCloseTo(1, 10);
			expect(result.status).not.toBe("unavailable");
		});
	}

	it("world-pair: correlations read the 1, 3 and 5 year windows", () => {
		const book = books.find((b) => b.name === "world-pair")!;
		const result = measureCorrelations(book.correlation!);
		expect(result.windows.map((w) => w.status)).toEqual([
			"available",
			"available",
			"available",
			"insufficient_history",
		]);
	});

	it("sealed: no company is read from a bond, money market or futures fund", () => {
		const result = analyzePortfolio(
			books.find((b) => b.name === "sealed")!.request,
		);
		const sealed = new Set(["bond", "overnight", "futures"]);
		expect(
			result.positions.filter(
				(p) => !p.residual && p.viaFunds.some((v) => sealed.has(v.holdingId)),
			),
		).toEqual([]);
	});
});
