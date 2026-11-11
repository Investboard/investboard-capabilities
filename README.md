# Investboard capabilities

## Build your own investing engine

Bring [Investboard](https://investboard.com) portfolio analysis into your own code. Use reusable TypeScript modules to see what your funds really hold, explore market crises, explain historical performance, compare ways to rebalance with new cash, research individual instruments, and make the assumptions visible in your own investing tools.

Start with **[portfolio look-through](packages/portfolio-intelligence)**, **[portfolio stress testing](packages/stress-test)**, **[contribution-aware rebalancing](packages/rebalancing)**, **[historical performance](packages/performance)**, **[goal cash scheduling](packages/goal-planning)** or **[instrument research](packages/instrument-research)**. Run the modules locally, connect your own data, and build the experience you want around them.

**[Run the examples](#try-it-with-your-own-code)** · **[Explore the modules](#available-modules)**

## Methodology and evidence

Read [how Investboard measures portfolios](https://investboard.com/knowledge/methodology): valuation scope, returns, concentration, risk, mandate scores, costs, German tax assumptions, projections, stress scenarios and the boundary between calculations and AI explanations. The reference includes formulas, labeled examples, data limitations and primary sources.

The website explains the platform's approach. Each module's own documentation below defines the inputs, units, configurable assumptions and behavior of that standalone library. A product default is not automatically a default of an exported module.

Choose your reading language: [English](https://investboard.com/knowledge/methodology) · [Deutsch](https://investboard.com/de/wissen/methodik) · [Español](https://investboard.com/es/knowledge/methodology) · [Italiano](https://investboard.com/it/knowledge/methodology) · [Français](https://investboard.com/fr/knowledge/methodology) · [Nederlands](https://investboard.com/nl/knowledge/methodology) · [Čeština](https://investboard.com/cs/knowledge/methodology) · [Polski](https://investboard.com/pl/knowledge/methodology) · [Русский](https://investboard.com/ru/knowledge/methodology) · [Українська](https://investboard.com/uk/knowledge/methodology).

## Turn portfolio data into useful questions

A holdings list tells you what you own. Scenario analysis helps you explore how that mix responds when markets change.

| Build your own… | Add this capability |
| --- | --- |
| Personal portfolio dashboard | Show how today's holdings respond to a financial crisis, a pandemic crash or a rate shock |
| Portfolio comparison tool | Run different mixes through the same scenario and compare the drivers of the change |
| Investing research script | Supply your own price and FX history, inspect coverage, and save inputs for a reproducible replay |
| Contribution planner | Compare fresh-cash and cash-limited allocations with a sale plan you supply, including reserves and depot funding |
| Historical performance dashboard | Separate funding from gains, explain holding contributions and quote FX, and estimate embedded fund expenses |
| Goal cash planner | Share cash across goals while protecting reserves, funding dated expenses and identifying deadline shortfalls |
| Instrument research dossier | Inspect exact-listing history, reported statement ratios and common-week comparisons with your own dated sources |
| Portfolio X-ray | Look through funds to the companies inside, compare fund overlap, and measure concentration and historical correlations |

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

The [rebalancing module](packages/rebalancing) allocates new money against the portfolio's value after the contribution. Choose your own scenarios: keep current, invest new cash, or assess an explicit plan with sales and contributions. Choose purchase routes, existing-cash deployment, projection cash sweeps, currency precision and calculation limits for your application.

Inspect allocation corridors, retained cash, declared fee schedules and any transfers needed between depots. Supply exact per-sale tax assumptions or keep tax unknown. Project recurring contributions with explicit return assumptions and trade limits, then save and replay the original comparison inputs. The module has no runtime dependencies or network calls.

**[Run the rebalancing example](packages/rebalancing/README.md#run-the-example)** · **[Explore its API and assumptions](packages/rebalancing/README.md)**

## Explain historical performance

The [performance engine](packages/performance) reconstructs the positions actually held, calculates cash-flow-adjusted returns, and preserves unexplained effects as an explicit residual. Supply your own NAV, ledger, prices and dated FX evidence. It supports historical basket selection, custody transfer valuation, capital-weighted coverage and JSON replay. Current recorded fund rates produce a labeled expense estimate without a second deduction from observed returns.

Run its synthetic price/FX example with `pnpm example:performance`. See the [API and accounting conventions](packages/performance/README.md) before connecting real history.

## Schedule goals against available cash

The [goal-planning module](packages/goal-planning) checks whether declared cash can fund competing goal contributions and dated obligations. Its deadline-aware buffer allows later capacity to cover later expenses without locking away their full face value today. Inspect the exact-cent ledger, due-time shortfalls, reserve and unallocated cash, then save and replay the inputs. Account and provider access belong to your application.

Run the synthetic timing example with `pnpm example:goals`. The package returns funded contribution streams and no-growth target gaps; your application can supply a separate investment-return model.

## Research instruments from your own sources

The [instrument-research module](packages/instrument-research) keeps exact listing identities, reported currencies, dated FX and return basis visible. Calculate historical returns and contribution illustrations, combine only matching statement periods for valuation ratios, and compare two listings on common observed weeks. Missing history and original-public-vintage requests remain explicit; the module supplies no provider datasets or account integration.

Run the synthetic GBP/CHF example with `pnpm example:research`. See the [API, evidence conventions and replay](packages/instrument-research/README.md) before connecting your own sources.

## See what your portfolio really owns

The [portfolio look-through module](packages/portfolio-intelligence) is the calculation behind Investboard's X-Ray and Diversification view. Supply your holdings and the constituent lists of your funds to see each company's share of your whole portfolio, held directly and through each fund. Measure exposures by asset class, sector, country, region and currency, the overlap between funds, and concentration in single companies with explicit bounds. Supply price history to read how your holdings moved together over 1, 3, 5 and 10 years.

Only equity funds are looked through: cash, bond, gold and crypto funds stay whole in their class. Funds without a list, unvalued holdings and unclassified companies remain visible as missing data. A parity check holds the module's figures equal to Investboard's own engine on seven synthetic portfolios.

Run the synthetic example with `pnpm example:intelligence`. See the [API, look-through rules and replay](packages/portfolio-intelligence/README.md), or let an AI agent run it with the [Portfolio Intelligence engine skill](skills/portfolio-intelligence-engine).

## Try it with your own code

Use Node 22 or newer and pnpm 9.15.0:

```sh
git clone https://github.com/Investboard/investboard-capabilities.git
cd investboard-capabilities
pnpm install --frozen-lockfile
pnpm example
```

The examples use synthetic data. Stress testing shows why two quote currencies do not automatically imply two economic exposures. Rebalancing shows how new cash can reach a target allocation, how per-depot tax changes funding, and why contributions below a trade minimum remain cash. Performance separates historical price and quote-FX effects. Goal scheduling shows how payment timing changes the required cash buffer and contribution funding. Instrument research retains exact listing identity and reported currency while comparing supplied price and FX histories. Portfolio look-through shows one company held directly and through two overlapping funds, and keeps a fund without a list visible as missing data. All six examples replay their original inputs.

Ready to add a capability to your own engine? **[Build the stress-testing module](packages/stress-test/README.md#use-it-in-your-project)**, **[build the rebalancing module](packages/rebalancing/README.md#use-it-in-your-project)**, **[build the performance module](packages/performance/README.md#use-it-in-your-project)**, **[build the goal-planning module](packages/goal-planning/README.md#use-it-in-your-project)** **[build the research module](packages/instrument-research/README.md#use-it-in-your-project)** or **[build the look-through module](packages/portfolio-intelligence/README.md#use-it-in-your-project)**, then supply the data and assumptions that fit your workflow.

## Available modules

| Module | Package | Documentation |
| --- | --- | --- |
| Portfolio stress testing | `@investboard/stress-test` | [API, examples and assumptions](packages/stress-test/README.md) |
| Contribution-aware rebalancing | `@investboard/rebalancing` | [API, examples and assumptions](packages/rebalancing/README.md) |
| Historical portfolio performance | `@investboard/performance` | [API, accounting conventions and replay](packages/performance/README.md) |
| Deadline-aware goal cash scheduling | `@investboard/goal-planning` | [API, timing conventions and replay](packages/goal-planning/README.md) |
| Source-aware instrument research | `@investboard/instrument-research` | [API, evidence conventions and replay](packages/instrument-research/README.md) |
| Portfolio look-through and diversification | `@investboard/portfolio-intelligence` | [API, look-through rules and replay](packages/portfolio-intelligence/README.md) |

[Browse the module catalogue](capabilities.json) · [Contribute a capability or improvement](CONTRIBUTING.md)

## More from Investboard

[Explore Investboard](https://investboard.com) for portfolio analysis and long-term investing tools. The [Investboard AI Toolkit](https://github.com/Investboard/ai-toolkit) connects investing workflows with skills and MCP integration.

## License

Use, adapt and extend these modules under [Apache License 2.0](LICENSE).
