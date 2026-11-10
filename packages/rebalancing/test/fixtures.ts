import type { AllocationPolicy, RebalanceRequest } from "../src/index.js";

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
