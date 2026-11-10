import type {
	FundamentalPeriod,
	ResearchRequest,
	Statement,
	StatementValues,
} from "../types.js";

function samePeriod(a: Statement, b: Statement) {
	return (
		a.periodEnd === b.periodEnd &&
		a.fiscalYear === b.fiscalYear &&
		a.period === b.period &&
		a.currency === b.currency
	);
}
/** Match all dimensions before combining amounts. Never synthesize FCF or signs. */
export function fundamentals(request: ResearchRequest): FundamentalPeriod[] {
	const groups: Statement[][] = [];
	for (const row of request.statements.filter(
		(s) => s.periodEnd <= request.to,
	)) {
		const existing = groups.find((g) => samePeriod(g[0]!, row));
		if (existing) existing.push(row);
		else groups.push([row]);
	}
	return groups
		.sort(
			(a, b) =>
				b[0]!.periodEnd.localeCompare(a[0]!.periodEnd) ||
				a[0]!.currency.localeCompare(b[0]!.currency) ||
				a[0]!.period.localeCompare(b[0]!.period),
		)
		.map((statements) => {
			const anchor = statements[0]!;
			const income = statements.find((s) => s.kind === "income");
			const balance = statements.find((s) => s.kind === "balance");
			const cash = statements.find((s) => s.kind === "cash_flow");
			const values: StatementValues = {
				revenue: income?.values.revenue ?? null,
				netIncome: income?.values.netIncome ?? null,
				operatingIncome: income?.values.operatingIncome ?? null,
				dilutedEps: income?.values.dilutedEps ?? null,
				totalAssets: balance?.values.totalAssets ?? null,
				totalDebt: balance?.values.totalDebt ?? null,
				equity: balance?.values.equity ?? null,
				operatingCashFlow: cash?.values.operatingCashFlow ?? null,
				capitalExpenditure: cash?.values.capitalExpenditure ?? null,
				freeCashFlow: cash?.values.freeCashFlow ?? null,
			};
			const cap = request.capitalizations.find(
				(c) =>
					c.periodEnd === anchor.periodEnd &&
					c.fiscalYear === anchor.fiscalYear &&
					c.currency === anchor.currency,
			);
			const marketCap = cap?.value && cap.value > 0 ? cap.value : null;
			const reasons = ["original_publication_vintage_unverified"];
			for (const kind of ["income", "balance", "cash_flow"] as const)
				if (!statements.some((s) => s.kind === kind))
					reasons.push(`matching_${kind}_statement_unavailable`);
			if (statements.some((s) => s.filingDate === null))
				reasons.push("filing_date_unknown");
			if (statements.some((s) => s.acceptedAt === null))
				reasons.push("acceptance_date_unknown");
			if (!marketCap) reasons.push("positive_period_market_cap_unavailable");
			if (values.netIncome === null || values.netIncome <= 0)
				reasons.push("positive_net_income_unavailable");
			if (values.equity === null || values.equity <= 0)
				reasons.push("positive_equity_unavailable");
			if (values.freeCashFlow === null)
				reasons.push("free_cash_flow_unavailable");
			if (anchor.period !== "FY")
				reasons.push("annual_valuation_flows_unavailable");
			return {
				periodEnd: anchor.periodEnd,
				fiscalYear: anchor.fiscalYear,
				period: anchor.period,
				currency: anchor.currency,
				values,
				statements,
				netMargin:
					values.netIncome !== null &&
					values.revenue !== null &&
					values.revenue > 0
						? values.netIncome / values.revenue
						: null,
				debtToEquity:
					values.totalDebt !== null &&
					values.equity !== null &&
					values.equity > 0
						? values.totalDebt / values.equity
						: null,
				valuation: {
					marketCap,
					priceToEarnings:
						anchor.period === "FY" &&
						marketCap &&
						values.netIncome !== null &&
						values.netIncome > 0
							? marketCap / values.netIncome
							: null,
					priceToBook:
						marketCap && values.equity !== null && values.equity > 0
							? marketCap / values.equity
							: null,
					freeCashFlowYield:
						anchor.period === "FY" && marketCap && values.freeCashFlow !== null
							? values.freeCashFlow / marketCap
							: null,
				},
				reasons,
			};
		});
}
