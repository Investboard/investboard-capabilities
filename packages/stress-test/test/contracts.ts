import { z } from "zod";

/** Additive explanation of a hypothetical scenario, in the result's base currency. */
export const stressAttributionSchema = z
	.object({
		preStressValueCents: z.number().int().positive(),
		postStressValueCents: z.number().int(),
		netImpactCents: z.number().int(),
		historicalValueFraction: z.number().min(0).max(1),
		lossDrivers: z
			.array(
				z.object({
					/** Representative source holding when same-security rows combine. */
					holdingId: z.string(),
					holdingCount: z.number().int().positive().optional(),
					name: z.string(),
					impactCents: z.number().int().negative(),
					/** Contribution to the whole portfolio's change, not share of net loss. */
					portfolioImpactFraction: z.number().negative(),
					shockSource: z.enum([
						"historical_price",
						"sector_proxy",
						"asset_class_default",
					]),
				}),
			)
			.max(3),
		/** Includes offsets, remaining losses and cent rounding; reconciles exactly. */
		otherImpactCents: z.number().int(),
	})
	.refine(
		(value) =>
			value.postStressValueCents - value.preStressValueCents ===
				value.netImpactCents &&
			value.lossDrivers.reduce(
				(sum, row) => sum + row.impactCents,
				value.otherImpactCents,
			) === value.netImpactCents,
		"Stress drivers must reconcile to the scenario change",
	);
export type StressAttribution = z.infer<typeof stressAttributionSchema>;
