/** Replaying saved analyses from their original inputs. */
import { analyzePortfolio, METHODOLOGY_VERSION } from "./analyze.js";
import type { PortfolioResult, PortfolioSnapshot } from "./types.js";
import { PortfolioInputError } from "./validation.js";

export function replayPortfolioAnalysis(
	snapshot: PortfolioSnapshot,
): PortfolioResult {
	if (
		typeof snapshot !== "object" ||
		snapshot === null ||
		snapshot.methodologyVersion !== METHODOLOGY_VERSION
	)
		throw new PortfolioInputError(
			`This snapshot was saved with methodology ${String(snapshot?.methodologyVersion)}; this version replays ${METHODOLOGY_VERSION}`,
		);
	return analyzePortfolio(snapshot.request);
}
