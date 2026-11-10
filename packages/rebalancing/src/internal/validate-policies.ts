import type {
	CashFundingPolicy,
	Holding,
	PurchasePlacement,
} from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { requireInput, requireShape } from "./input-guards.js";
import { text } from "./validate-inputs.js";

export function validateCashDeployment(
	value: unknown,
): asserts value is "preserve" | "deploy_excess" {
	requireInput(
		value === "preserve" || value === "deploy_excess",
		"Choose preserve or deploy_excess cash deployment",
	);
}
export function validateCashFunding(
	value: unknown,
	holdings: Holding[],
	ctx: CalculationContext,
): asserts value is CashFundingPolicy {
	requireShape(value, ["mode", "holdingIds"], "Cash funding policy");
	if (value.mode === "preserve") {
		requireShape(value, ["mode"], "Preserved cash policy");
		return;
	}
	requireInput(value.mode === "deploy_excess", "Unsupported cash funding mode");
	requireInput(
		Array.isArray(value.holdingIds),
		"Cash funding requires an ordered list of source holding IDs",
	);
	const ids = new Set<string>();
	const byId = new Map(holdings.map((h) => [h.holdingId, h]));
	for (const id of value.holdingIds) {
		text(id, "Cash source holding ID", ctx);
		const h = byId.get(id);
		requireInput(
			!ids.has(id) && h?.assetClass === ctx.configuration.cashAssetClass,
			"Cash sources must be unique cash holdings",
		);
		ids.add(id);
	}
}
export function validatePlacement(
	value: unknown,
	holdings: Holding[],
	ctx: CalculationContext,
): asserts value is PurchasePlacement {
	requireShape(value, ["mode", "routes"], "Purchase placement");
	if (value.mode === "largest_holding") {
		requireShape(value, ["mode"], "Largest holding placement");
		return;
	}
	requireInput(
		value.mode === "ordered_routes" && Array.isArray(value.routes),
		"Choose largest_holding or ordered_routes placement",
	);
	const identities = new Set<string>();
	const byId = new Map(holdings.map((h) => [h.holdingId, h]));
	for (const route of value.routes) {
		requireShape(
			route,
			["assetClass", "holdingId", "depotId"],
			"Purchase route",
		);
		text(route.assetClass, "Route class", ctx);
		text(route.depotId, "Route depot", ctx);
		requireInput(
			route.assetClass !== ctx.configuration.cashAssetClass,
			"Purchase routes must name security classes",
		);
		if (route.holdingId !== null) {
			text(route.holdingId, "Route holding ID", ctx);
			const h = byId.get(route.holdingId);
			requireInput(
				h && h.assetClass === route.assetClass && h.depotId === route.depotId,
				"Route holding must match its class and depot",
			);
		}
		const key = JSON.stringify([
			route.assetClass,
			route.depotId,
			route.holdingId,
		]);
		requireInput(!identities.has(key), "Purchase routes must be unique");
		identities.add(key);
	}
}
