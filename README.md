# Investboard capabilities

## Build your own investing engine

Bring [Investboard](https://investboard.com) portfolio analysis into your own code. Use reusable TypeScript modules to explore market crises, compare ways to rebalance with new cash, and make the assumptions visible in your own investing tools.

Start with the **[portfolio stress-testing engine](packages/stress-test)** or **[contribution-aware rebalancing](packages/rebalancing)**. Run either module locally, connect your own data, and build the experience you want around it.

**[Run the examples](#try-it-with-your-own-code)** · **[Explore the modules](#available-modules)**

## Turn portfolio data into useful questions

A holdings list tells you what you own. Scenario analysis helps you explore how that mix responds when markets change.

| Build your own… | Add this capability |
| --- | --- |
| Personal portfolio dashboard | Show how today's holdings respond to a financial crisis, a pandemic crash or a rate shock |
| Portfolio comparison tool | Run different mixes through the same scenario and compare the drivers of the change |
| Investing research script | Supply your own price and FX history, inspect coverage, and save inputs for a reproducible replay |
| Contribution planner | Compare fresh-cash and cash-limited allocations with a sale plan you supply, including reserves and depot funding |

## Start with portfolio stress testing

The [stress-testing engine](packages/stress-test) gives you the calculation logic behind the analysis:

- **Explore 15 historical crisis scenarios.** Start with events such as the 2008 financial crisis, the 2020 pandemic crash and the 2022 rate shock, or supply your own scenario assumptions.
- **See what drives the result.** Inspect each holding's impact, the largest loss drivers, and the gains that offset them.
- **Keep currency assumptions visible.** Distinguish quote currency from economic exposure and surface the parts that remain unknown.
- **Bring your own data.** Use named scenario assumptions or supply dated price and FX inputs from sources you choose.
- **Revisit an analysis.** Save a JSON snapshot and reproduce the calculation from its original inputs.

The engine runs without an Investboard account, API key or runtime dependencies. Your application supplies the portfolio data and decides how to display and store the results.

Historical scenarios use sourced, rounded assumptions. The outputs are hypothetical illustrations of today's holdings, with explicit coverage and limitations.

## Add contribution-aware rebalancing

The [rebalancing module](packages/rebalancing) allocates new money against the portfolio's value after the contribution. Compare keeping current, investing fresh cash, making cash-limited progress and a sale plan you supply.

Inspect allocation corridors, retained cash, flat fees and any transfers needed between depots. Supply exact per-sale tax assumptions or keep tax unknown. Project recurring contributions with explicit return assumptions and trade limits, then save and replay the original comparison inputs. The module has no runtime dependencies or network calls.

**[Run the rebalancing example](packages/rebalancing/README.md#run-the-example)** · **[Explore its API and assumptions](packages/rebalancing/README.md)**

## Try it with your own code

Use Node 22 or newer and pnpm 9.15.0:

```sh
git clone https://github.com/Investboard/investboard-capabilities.git
cd investboard-capabilities
pnpm install --frozen-lockfile
pnpm example
```

The examples use synthetic holdings. Stress testing shows why two quote currencies do not automatically imply two economic exposures. Rebalancing shows how new cash can reach a target allocation, how per-depot tax changes funding, and why contributions below a trade minimum remain cash. Both examples replay the original comparison inputs.

Ready to add a capability to your own engine? **[Build the stress-testing module](packages/stress-test/README.md#use-it-in-your-project)** or **[build the rebalancing module](packages/rebalancing/README.md#use-it-in-your-project)**, then supply the data and assumptions that fit your workflow.

## Available modules

| Module | Package | Documentation |
| --- | --- | --- |
| Portfolio stress testing | `@investboard/stress-test` | [API, examples and assumptions](packages/stress-test/README.md) |
| Contribution-aware rebalancing | `@investboard/rebalancing` | [API, examples and assumptions](packages/rebalancing/README.md) |

[Browse the module catalogue](capabilities.json) · [Contribute a capability or improvement](CONTRIBUTING.md)

## More from Investboard

[Explore Investboard](https://investboard.com) for portfolio analysis and long-term investing tools. The [Investboard AI Toolkit](https://github.com/Investboard/ai-toolkit) connects investing workflows with skills and MCP integration.

## License

Use, adapt and extend these modules under [Apache License 2.0](LICENSE).
