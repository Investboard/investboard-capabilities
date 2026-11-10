# Investboard capabilities

## Build your own investing engine

Bring [Investboard](https://investboard.com) portfolio analysis into your own code. Use reusable TypeScript modules to explore market crises, explain historical performance, and make the assumptions visible in your own investing tools.

Start with the **[portfolio stress-testing engine](packages/stress-test)** or **[performance engine](packages/performance)**. Run them locally, connect your own data, and build the experience you want around them.

**[Run the example](#try-it-with-your-own-code)** · **[Explore the API](packages/stress-test/README.md)**

## Turn portfolio data into useful questions

A holdings list tells you what you own. Scenario analysis helps you explore how that mix responds when markets change.

| Build your own… | Add this capability |
| --- | --- |
| Personal portfolio dashboard | Show how today's holdings respond to a financial crisis, a pandemic crash or a rate shock |
| Portfolio comparison tool | Run different mixes through the same scenario and compare the drivers of the change |
| Investing research script | Supply your own price and FX history, inspect coverage, and save inputs for a reproducible replay |
| Historical performance dashboard | Separate funding from gains, explain holding contributions and quote FX, and estimate embedded fund expenses |

## Start with portfolio stress testing

The [stress-testing engine](packages/stress-test) gives you the calculation logic behind the analysis:

- **Explore 15 historical crisis scenarios.** Start with events such as the 2008 financial crisis, the 2020 pandemic crash and the 2022 rate shock, or supply your own scenario assumptions.
- **See what drives the result.** Inspect each holding's impact, the largest loss drivers, and the gains that offset them.
- **Keep currency assumptions visible.** Distinguish quote currency from economic exposure and surface the parts that remain unknown.
- **Bring your own data.** Use named scenario assumptions or supply dated price and FX inputs from sources you choose.
- **Revisit an analysis.** Save a JSON snapshot and reproduce the calculation from its original inputs.

The engine runs without an Investboard account, API key or runtime dependencies. Your application supplies the portfolio data and decides how to display and store the results.

Historical scenarios use sourced, rounded assumptions. The outputs are hypothetical illustrations of today's holdings, with explicit coverage and limitations.

## Explain historical performance

The [performance engine](packages/performance) reconstructs the positions actually held, calculates cash-flow-adjusted returns, and preserves unexplained effects as an explicit residual. Supply your own NAV, ledger, prices and dated FX evidence. It supports historical basket selection, custody transfer valuation, capital-weighted coverage and JSON replay. Current recorded fund rates produce a labeled expense estimate without a second deduction from observed returns.

Run its synthetic price/FX example with `pnpm example:performance`. See the [API and accounting conventions](packages/performance/README.md) before connecting real history.

## Try it with your own code

Use Node 22 or newer and pnpm 9.15.0:

```sh
git clone https://github.com/Investboard/investboard-capabilities.git
cd investboard-capabilities
pnpm install --frozen-lockfile
pnpm example
```

The examples use synthetic holdings to demonstrate stress assumptions, separate historical price/FX effects, and replay original inputs.

Ready to add it to your own engine? **[Build and use the module](packages/stress-test/README.md#use-it-in-your-project)**, then choose the scenarios and data sources that fit your workflow.

## Available modules

| Module | Package | Documentation |
| --- | --- | --- |
| Portfolio stress testing | `@investboard/stress-test` | [API, examples and assumptions](packages/stress-test/README.md) |
| Historical portfolio performance | `@investboard/performance` | [API, accounting conventions and replay](packages/performance/README.md) |

[Browse the module catalogue](capabilities.json) · [Contribute a capability or improvement](CONTRIBUTING.md)

## More from Investboard

[Explore Investboard](https://investboard.com) for portfolio analysis and long-term investing tools. The [Investboard AI Toolkit](https://github.com/Investboard/ai-toolkit) connects investing workflows with skills and MCP integration.

## License

Use, adapt and extend these modules under [Apache License 2.0](LICENSE).
