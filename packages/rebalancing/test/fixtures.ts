import {
	compareRebalance as compare,
	allocateContribution as allocate,
	projectContributions as project,
} from "../src/index.js";
import type {
	AllocationPolicy,
	AllocationRequest,
	ProjectionRequest,
	RebalanceRequest as PublicRequest,
	RebalancingConfiguration,
	SalePlan,
} from "../src/index.js";
import { requireInput, requireJson } from "../src/internal/input-guards.js";

// Explicit historical test assumptions preserve 0.2 regression parity. This is
// neither an exported library preset nor an app configuration dependency.
export const configuration: RebalancingConfiguration = {
	money: { decimalPlaces: 2, maximumAmount: 1_000_000_000 },
	limits: {
		holdings: 200,
		assetClasses: 32,
		accounts: 100,
		orders: 100,
		projectionMonths: 600,
		scenarios: 100,
		jsonNodes: 10_000,
		jsonDepth: 16,
		collectionEntries: 2_000,
		textLength: 128,
	},
	cashAssetClass: "cash",
	allowedCurrencies: ["EUR", "USD"],
	annualReturnRange: { minimum: -1, maximum: 10 },
};
export type RebalanceRequest = Omit<
	PublicRequest,
	"configuration" | "scenarios"
> & {
	contribution: number;
	cashLimit: number;
	salePlan?: SalePlan;
};
export const MAX_SUPPORTED_WEALTH = configuration.money.maximumAmount;
export function compareRebalance(input: RebalanceRequest) {
	requireJson(input, configuration.limits);
	const { contribution, cashLimit, salePlan, ...rest } = input;
	requireInput(
		cashLimit <= contribution,
		"cashLimit cannot exceed contribution",
	);
	return compare({
		...rest,
		configuration,
		scenarios: [
			{ kind: "keep", mode: "keep" },
			{ kind: "fresh_cash", mode: "contribution", externalCash: contribution },
			{ kind: "partial_cash", mode: "contribution", externalCash: cashLimit },
			salePlan
				? { kind: "sales", mode: "plan", externalCash: 0, plan: salePlan }
				: {
						kind: "sales",
						mode: "unavailable",
						reasonCodes: ["sale_plan_required"],
					},
		],
	});
}
export const allocateContribution = (
	input: Omit<AllocationRequest, "configuration">,
) => allocate({ configuration, ...input });
export const projectContributions = (
	input: Omit<ProjectionRequest, "configuration">,
) => project({ configuration, ...input });

export const policy: AllocationPolicy = {
	equities: { min: 0.55, target: 0.6, max: 0.65 },
	bonds: { min: 0.35, target: 0.4, max: 0.45 },
};
export function request(): RebalanceRequest {
	return {
		baseCurrency: "EUR",
		holdings: [
			{
				holdingId: "synthetic-equity",
				depotId: "A",
				assetClass: "equities",
				value: 70000,
				currency: "EUR",
			},
			{
				holdingId: "synthetic-bond",
				depotId: "A",
				assetClass: "bonds",
				value: 30000,
				currency: "EUR",
			},
		],
		policy: structuredClone(policy),
		contribution: 100000,
		cashLimit: 1000,
		fundingDepotId: "A",
		accounts: [
			{ depotId: "A", feePerTrade: 0, minimum: 0, maximum: 0, increment: 0.01 },
		],
	};
}
export function salesRequest(): RebalanceRequest {
	const input = request();
	input.contribution = 0;
	input.cashLimit = 0;
	input.holdings = [
		{
			holdingId: "sale-A",
			depotId: "A",
			assetClass: "equities",
			value: 200,
			currency: "EUR",
		},
		{
			holdingId: "buy-A",
			depotId: "A",
			assetClass: "bonds",
			value: 10,
			currency: "EUR",
		},
		{
			holdingId: "sale-B",
			depotId: "B",
			assetClass: "gold",
			value: 200,
			currency: "EUR",
		},
		{
			holdingId: "buy-B",
			depotId: "B",
			assetClass: "crypto",
			value: 10,
			currency: "EUR",
		},
	];
	input.policy = Object.fromEntries(
		["equities", "bonds", "gold", "crypto"].map((key) => [
			key,
			{ min: 0, target: 0.25, max: 1 },
		]),
	);
	input.accounts!.push({ ...input.accounts![0]!, depotId: "B" });
	input.salePlan = {
		sales: [
			{
				holdingId: "sale-A",
				amount: 100,
				tax: {
					amount: 26.38,
					source: "Synthetic external estimate for this exact sale",
				},
			},
			{
				holdingId: "sale-B",
				amount: 100,
				tax: {
					amount: 0,
					source: "Synthetic zero-tax estimate for this exact sale",
				},
			},
		],
		purchases: [
			{ holdingId: "buy-A", depotId: "A", assetClass: "bonds", amount: 86.81 },
			{ holdingId: "buy-B", depotId: "B", assetClass: "crypto", amount: 86.81 },
		],
	};
	return input;
}
