#!/usr/bin/env node
// Turn portfolio and fund-holdings CSV files into a Portfolio Intelligence
// request, run the engine locally and print a summary. Columns other than the
// documented ones (a "note" column, for example) are ignored and never echoed.
//
//   node run.mjs --portfolio portfolio.csv [--fund-holdings fund-holdings.csv]
//                [--securities securities.csv] [--out output-directory]
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ASSET_CLASSES = new Set([
	"equities",
	"bonds",
	"gold",
	"crypto",
	"cash",
	"alternatives",
	"real_estate",
	"commodities",
	"unknown",
]);
const FUND_TYPES = new Set(["fund", "etf", "etp", "mutual_fund"]);
const CLASS_BY_TYPE = {
	cash: "cash",
	bond: "bonds",
	gold: "gold",
	crypto: "crypto",
	fund: "equities",
	etf: "equities",
	stock: "equities",
	share: "equities",
};

/** RFC 4180 style CSV: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else field += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ",") {
			row.push(field);
			field = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += ch;
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	const [header, ...body] = rows.filter((r) =>
		r.some((cell) => cell.trim() !== ""),
	);
	if (!header) return [];
	const keys = header.map((h) => h.trim().toLowerCase());
	return body.map((cells) =>
		Object.fromEntries(
			keys.map((key, index) => [key, (cells[index] ?? "").trim()]),
		),
	);
}

function number(value) {
	if (value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
	return value === undefined || value === "" ? null : value;
}

function one(rows, key, label) {
	const values = new Set(rows.map((r) => r[key]).filter(Boolean));
	if (values.size !== 1)
		throw new Error(
			`The portfolio file must state one ${label} on every row (found ${values.size})`,
		);
	return [...values][0];
}

/** Build a PortfolioRequest from CSV text. `fundHoldingsCsv` and `securitiesCsv` may be null. */
export function buildRequestFromCsv(
	portfolioCsv,
	fundHoldingsCsv,
	securitiesCsv,
) {
	const portfolio = parseCsv(portfolioCsv);
	if (portfolio.length === 0) throw new Error("The portfolio file has no rows");
	const asOf = one(portfolio, "as_of", "as_of date");
	const baseCurrency = one(
		portfolio,
		"base_currency",
		"base currency",
	).toUpperCase();

	const holdings = portfolio.map((r) => {
		const type = (r.holding_type ?? "").toLowerCase();
		const kind = FUND_TYPES.has(type)
			? "fund"
			: type === "cash"
				? "cash"
				: "security";
		const stated = (r.asset_class ?? "").toLowerCase();
		const reported = (r.reported_class ?? "").toLowerCase();
		if (
			kind === "fund" &&
			!ASSET_CLASSES.has(stated) &&
			!ASSET_CLASSES.has(reported)
		)
			throw new Error(
				`Fund ${r.holding_id} needs an asset_class or reported_class: a bond, cash, gold or crypto fund must never be looked through as equities`,
			);
		const assetClass = ASSET_CLASSES.has(stated)
			? stated
			: (CLASS_BY_TYPE[type] ?? "unknown");
		if (!r.listing_currency?.trim())
			throw new Error(`Holding ${r.holding_id} needs listing_currency: the portfolio base currency is a valuation unit, not evidence of denomination`);
		return {
			id: r.holding_id,
			kind,
			name: r.holding_name || r.holding_id,
			isin: text(r.isin),
			ticker: text(r.ticker),
			value: number(r.value) ?? number(r.portfolio_weight_pct),
			listingCurrency: r.listing_currency.toUpperCase(),
			assetClass,
		};
	});

	const profiles = new Map();
	for (const r of securitiesCsv ? parseCsv(securitiesCsv) : []) {
		if (!r.isin) continue;
		profiles.set(r.isin.toUpperCase(), {
			isin: r.isin.toUpperCase(),
			name: text(r.name),
			sector: text(r.sector),
			industry: text(r.industry),
			country: text(r.country),
			...(text(r.asset_class) !== null ? { assetClass: r.asset_class } : {}),
		});
	}

	const byFund = new Map();
	for (const r of fundHoldingsCsv ? parseCsv(fundHoldingsCsv) : []) {
		const list = byFund.get(r.fund_id) ?? [];
		list.push(r);
		byFund.set(r.fund_id, list);
		const isin = r.isin?.toUpperCase();
		if (isin && !profiles.has(isin) && (r.sector || r.country))
			profiles.set(isin, {
				isin,
				name: r.company_name || null,
				sector: text(r.sector),
				country: text(r.country),
			});
	}

	const fundIds = new Set(
		holdings.filter((h) => h.kind === "fund").map((h) => h.id),
	);
	const unknown = [...byFund.keys()].filter((id) => !fundIds.has(id));
	if (unknown.length > 0)
		throw new Error(
			`The fund-holdings file names funds that are not fund holdings in the portfolio: ${unknown.join(", ")}`,
		);
	const reportedOf = new Map(
		portfolio.map((r) => [
			r.holding_id,
			(r.reported_class ?? "").toLowerCase(),
		]),
	);
	const funds = holdings
		.filter((h) => h.kind === "fund")
		.map((h) => {
			const rows = byFund.get(h.id);
			const reported = reportedOf.get(h.id);
			const reportedClass =
				ASSET_CLASSES.has(reported) && reported !== "unknown"
					? { reportedClass: reported }
					: {};
			if (!rows || rows.length === 0)
				return {
					holdingId: h.id,
					...reportedClass,
					holdings: { status: "missing" },
				};
			return {
				holdingId: h.id,
				...reportedClass,
				holdings: {
					status: "listed",
					asOf: rows[0].as_of || asOf,
					constituents: rows.map((r) => ({
						id: r.company_id,
						isin: text(r.isin),
						name: r.company_name || r.company_id,
						weight: weightOf(r),
					})),
				},
			};
		});

	return {
		asOf,
		baseCurrency,
		holdings,
		funds,
		securities: [...profiles.values()],
	};
}

function weightOf(row) {
	const pctValue = number(row.fund_weight_pct);
	if (pctValue === null)
		throw new Error(
			`Fund ${row.fund_id}: constituent ${row.company_id} has no fund_weight_pct weight`,
		);
	return pctValue / 100;
}

const pct = (weight) => `${(weight * 100).toFixed(1)}%`;

/** A plain-text summary of a PortfolioResult. Every line states its basis. */
export function summarize(result) {
	const lines = [];
	lines.push(
		`Status: ${result.status}${result.reasonCodes.length ? ` (${result.reasonCodes.join(", ")})` : ""}`,
	);
	lines.push(
		`Basis by holding, share of the whole portfolio: ${result.basis.map((b) => `${b.key} ${pct(b.weight)}`).join(", ")}`,
	);
	lines.push("Largest companies, share of the whole portfolio:");
	for (const p of result.positions
		.filter((p) => !p.residual && p.assetClass !== "cash")
		.sort((a, b) => b.weight - a.weight)
		.slice(0, 10)) {
		const parts = [];
		if (p.direct > 0) parts.push(`direct ${pct(p.direct)}`);
		for (const v of p.viaFunds)
			parts.push(`via ${v.holdingId} ${pct(v.weight)}`);
		lines.push(`  ${p.name}: ${pct(p.weight)} (${parts.join(", ")})`);
	}
	for (const pair of result.overlap)
		lines.push(
			`Fund overlap ${pair.fundA} and ${pair.fundB}: ${pct(pair.overlap)} of weight matched security by security between the two funds, ${pair.sharedCount} shared companies`,
		);
	const c = result.concentration;
	lines.push(
		c.status === "available"
			? `Concentration over ${pct(c.attributedCoverage)} of the equity part: index ${c.hhi.value.toFixed(3)} (${c.hhi.bound}), ${c.effectiveIssuers ? `about ${c.effectiveIssuers.value.toFixed(1)} effective companies (${c.effectiveIssuers.bound})` : "no effective number"}, largest ${c.largestIssuer?.name ?? "none"} ${c.largestIssuer ? pct(c.largestIssuer.weight) : ""} of the equity part`
			: `Concentration withheld (${c.refusal}): only ${pct(c.attributedCoverage)} of the equity part could be attributed to companies`,
	);
	lines.push(
		`Coverage of the whole portfolio: seen through ${pct(result.coverage.transparent)}, held whole ${pct(result.coverage.opaqueInherent)}, pending ${pct(result.coverage.opaquePending)}`,
	);
	const pending = result.funds
		.filter((f) => f.treatment === "pending")
		.map((f) => f.holdingId);
	if (pending.length)
		lines.push(
			`Pending funds without a constituent list: ${pending.join(", ")}`,
		);
	const held = result.funds
		.filter((f) => f.treatment === "held_whole")
		.map((f) => f.holdingId);
	if (held.length)
		lines.push(`Funds held whole in their class: ${held.join(", ")}`);
	lines.push("Currency exposure is a country/name estimate, not verified corporate exposure or hedge policy. Name hints do not establish hedge ratios; verified stress handoff is ineligible.");
	const sector = result.dimensions.sector;
	lines.push(
		`Sectors, share of the whole portfolio (classified ${pct(sector.coverage)} of the equity part): ${sector.buckets.map((b) => `${b.key} ${pct(b.weight)}`).join(", ")}`,
	);
	if (result.valuation.unvalued.length)
		lines.push(
			`Not valued, outside every figure: ${result.valuation.unvalued.map((u) => u.id).join(", ")}`,
		);
	return lines.join("\n");
}

function args(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const key = argv[i];
		if (key?.startsWith("--")) out[key.slice(2)] = argv[++i];
	}
	return out;
}

async function main() {
	const options = args(process.argv.slice(2));
	if (!options.portfolio) {
		console.error(
			"Usage: node run.mjs --portfolio <csv> [--fund-holdings <csv>] [--securities <csv>] [--out <dir>]",
		);
		process.exit(2);
	}
	const read = (path) => (path ? readFileSync(resolve(path), "utf8") : null);
	const request = buildRequestFromCsv(
		read(options.portfolio),
		read(options["fund-holdings"]),
		read(options.securities),
	);
	const engine = fileURLToPath(
		new URL(
			"../../../packages/portfolio-intelligence/dist/index.js",
			import.meta.url,
		),
	);
	if (!existsSync(engine)) {
		console.error(
			"Build the engine first: pnpm --filter @investboard/portfolio-intelligence build",
		);
		process.exit(1);
	}
	const { analyzePortfolio } = await import(pathToFileURL(engine).href);
	const result = analyzePortfolio(request);
	const out = resolve(options.out ?? "portfolio-intelligence-output");
	mkdirSync(out, { recursive: true });
	writeFileSync(
		join(out, "result.json"),
		`${JSON.stringify(result, null, 2)}\n`,
	);
	writeFileSync(
		join(out, "snapshot.json"),
		`${JSON.stringify(result.snapshot, null, 2)}\n`,
	);
	console.log(summarize(result));
	console.log(
		`\nSaved ${join(out, "result.json")} and ${join(out, "snapshot.json")}`,
	);
}

/** True when `argv1` (the path Node was asked to run) is this module, symlinks resolved. */
export function isEntry(argv1, moduleUrl) {
	if (!argv1) return false;
	try {
		return pathToFileURL(realpathSync(resolve(argv1))).href === moduleUrl;
	} catch {
		return false;
	}
}

if (isEntry(process.argv[1], import.meta.url)) await main();
