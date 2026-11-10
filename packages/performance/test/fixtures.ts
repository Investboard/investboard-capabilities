// Synthetic regression fixtures. Copyright 2026 Investboard GmbH. Apache-2.0
import type { CashFlow, Snapshot } from "../src/internal/performance/types.js";
export const SIMPLE_PORTFOLIO = {
	snapshots: [
		{ date: "2025-01-01", value: 1000 },
		{ date: "2025-01-02", value: 1025 },
		{ date: "2025-01-03", value: 1050 },
		{ date: "2025-01-04", value: 1075 },
		{ date: "2025-01-05", value: 1100 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2025-01-01", amount: 1000, type: "buy" as const },
	] satisfies CashFlow[],
};
export const MULTI_CASHFLOW_PORTFOLIO = {
	snapshots: [
		{ date: "2025-01-01", value: 1000 },
		{ date: "2025-01-02", value: 1020 },
		{ date: "2025-01-03", value: 1040 },
		{ date: "2025-01-04", value: 1060 },
		{ date: "2025-01-05", value: 1560 },
		{ date: "2025-01-06", value: 1590 },
		{ date: "2025-01-07", value: 1620 },
		{ date: "2025-01-08", value: 1430 },
		{ date: "2025-01-09", value: 1450 },
		{ date: "2025-01-10", value: 1470 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2025-01-01", amount: 1000, type: "buy" as const },
		{ date: "2025-01-05", amount: 500, type: "buy" as const },
		{ date: "2025-01-08", amount: 200, type: "sell" as const },
	] satisfies CashFlow[],
};
export const SPARSE_PORTFOLIO = {
	snapshots: [
		{ date: "2025-01-01", value: 1000 },
		{ date: "2025-01-02", value: 1010 },
		{ date: "2025-01-03", value: 1020 },
		{ date: "2025-01-04", value: 1030 },
		{ date: "2025-01-05", value: 1040 },
		{ date: "2025-01-06", value: 1050 },
		{ date: "2025-01-07", value: 1060 },
		{ date: "2025-01-08", value: 1070 },
		{ date: "2025-01-09", value: 1080 },
		{ date: "2025-01-21", value: 1150 },
		{ date: "2025-01-22", value: 1160 },
		{ date: "2025-01-23", value: 1170 },
		{ date: "2025-01-24", value: 1180 },
		{ date: "2025-01-25", value: 1190 },
		{ date: "2025-01-26", value: 1200 },
		{ date: "2025-01-27", value: 1210 },
		{ date: "2025-01-28", value: 1220 },
		{ date: "2025-01-29", value: 1230 },
		{ date: "2025-01-30", value: 1240 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2025-01-01", amount: 1000, type: "buy" as const },
	] satisfies CashFlow[],
};
export const EMPTY_PORTFOLIO = {
	snapshots: [] satisfies Snapshot[],
	cashFlows: [] satisfies CashFlow[],
};
export const SINGLE_SNAPSHOT = {
	snapshots: [{ date: "2025-01-01", value: 1000 }] satisfies Snapshot[],
	cashFlows: [
		{ date: "2025-01-01", amount: 1000, type: "buy" as const },
	] satisfies CashFlow[],
};
export const DRAWDOWN_PORTFOLIO = {
	snapshots: [
		{ date: "2025-01-01", value: 1000 },
		{ date: "2025-01-02", value: 1200 },
		{ date: "2025-01-03", value: 900 },
		{ date: "2025-01-04", value: 1100 },
		{ date: "2025-01-05", value: 800 },
		{ date: "2025-01-06", value: 1050 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2025-01-01", amount: 1000, type: "buy" as const },
	] satisfies CashFlow[],
};
export const SHORT_HISTORY = {
	snapshots: [
		{ date: "2025-01-01", value: 10000 },
		{ date: "2025-01-15", value: 10100 },
		{ date: "2025-01-30", value: 10200 },
		{ date: "2025-02-15", value: 10300 },
		{ date: "2025-02-28", value: 10400 },
		{ date: "2025-03-01", value: 10500 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2025-01-01", amount: 10000, type: "buy" as const },
	] satisfies CashFlow[],
};
export const NEGATIVE_RETURN_PORTFOLIO = {
	snapshots: [
		{ date: "2025-01-01", value: 1000 },
		{ date: "2025-01-02", value: 950 },
		{ date: "2025-01-03", value: 900 },
		{ date: "2025-01-04", value: 850 },
		{ date: "2025-01-05", value: 800 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2025-01-01", amount: 1000, type: "buy" as const },
	] satisfies CashFlow[],
};
export const DIVIDEND_FLAT_1Y = {
	snapshots: [
		{ date: "2024-01-01", value: 100 },
		{ date: "2024-07-01", value: 100 },
		{ date: "2025-02-01", value: 100 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2024-01-01", amount: 100, type: "buy" as const },
		{ date: "2024-07-01", amount: 5, type: "dividend" as const },
	] satisfies CashFlow[],
	cashFlowsNoDividend: [
		{ date: "2024-01-01", amount: 100, type: "buy" as const },
	] satisfies CashFlow[],
};
export const DIVIDEND_MARKET_GROWTH = {
	snapshots: [
		{ date: "2024-01-01", value: 100 },
		{ date: "2024-06-01", value: 110 },
		{ date: "2025-02-01", value: 110 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2024-01-01", amount: 100, type: "buy" as const },
		{ date: "2024-06-01", amount: 5, type: "dividend" as const },
	] satisfies CashFlow[],
};
export const DRIP_PORTFOLIO = {
	snapshots: [
		{ date: "2024-01-01", value: 100 },
		{ date: "2024-07-01", value: 105 },
		{ date: "2025-02-01", value: 105 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2024-01-01", amount: 100, type: "buy" as const },
		{ date: "2024-07-01", amount: 5, type: "dividend" as const },
		{ date: "2024-07-01", amount: 5, type: "buy" as const },
	] satisfies CashFlow[],
};
export const DIVIDEND_NO_SNAPSHOT_ON_DATE = {
	snapshots: [
		{ date: "2024-01-01", value: 100 },
		{ date: "2024-12-01", value: 120 },
		{ date: "2025-06-01", value: 120 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2024-01-01", amount: 100, type: "buy" as const },
		{ date: "2024-06-15", amount: 10, type: "dividend" as const },
	] satisfies CashFlow[],
};
export const DIVIDEND_SHORT = {
	snapshots: [
		{ date: "2025-01-01", value: 100 },
		{ date: "2025-03-01", value: 100 },
		{ date: "2025-04-01", value: 100 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2025-01-01", amount: 100, type: "buy" as const },
		{ date: "2025-03-01", amount: 5, type: "dividend" as const },
	] satisfies CashFlow[],
};
export const LONG_HISTORY = {
	snapshots: [
		{ date: "2023-01-01", value: 10000 },
		{ date: "2023-02-01", value: 10100 },
		{ date: "2023-03-01", value: 10250 },
		{ date: "2023-04-01", value: 10400 },
		{ date: "2023-05-01", value: 10500 },
		{ date: "2023-06-01", value: 10600 },
		{ date: "2023-07-01", value: 10750 },
		{ date: "2023-08-01", value: 10800 },
		{ date: "2023-09-01", value: 10900 },
		{ date: "2023-10-01", value: 11000 },
		{ date: "2023-11-01", value: 11100 },
		{ date: "2023-12-01", value: 11200 },
		{ date: "2024-01-01", value: 11350 },
		{ date: "2024-02-01", value: 11500 },
		{ date: "2024-03-01", value: 11600 },
		{ date: "2024-04-01", value: 11700 },
		{ date: "2024-05-01", value: 11800 },
		{ date: "2024-06-01", value: 11950 },
		{ date: "2024-07-01", value: 12000 },
		{ date: "2024-08-01", value: 12100 },
		{ date: "2024-09-01", value: 12200 },
		{ date: "2024-10-01", value: 12300 },
		{ date: "2024-11-01", value: 12400 },
		{ date: "2024-12-01", value: 12450 },
		{ date: "2025-01-01", value: 12500 },
	] satisfies Snapshot[],
	cashFlows: [
		{ date: "2023-01-01", amount: 10000, type: "buy" as const },
	] satisfies CashFlow[],
};
