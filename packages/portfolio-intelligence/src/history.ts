/** Replaying saved analyses from their original inputs. */
import { analyzePortfolio, METHODOLOGY_VERSION } from "./analyze.js";
import type { PortfolioResult, PortfolioSnapshot } from "./types.js";
import { snapshotRequest } from "./input-data.js";

export function replayPortfolioAnalysis(
	snapshot: PortfolioSnapshot,
): PortfolioResult {
	return analyzePortfolio(
		snapshotRequest(snapshot, METHODOLOGY_VERSION, "analyzePortfolio"),
	);
}
