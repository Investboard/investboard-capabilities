# Portfolio Intelligence engine skill

An agent skill that runs [`@investboard/portfolio-intelligence`](../../packages/portfolio-intelligence) on files an investor supplies and explains the result: what the portfolio owns through its funds, exposures, fund overlap, company concentration, coverage and historical correlations.

It works from a checkout of this repository, because it runs the engine built there. It needs Node 22 or newer and an agent that can run commands.

## Set it up

```sh
git clone https://github.com/Investboard/investboard-capabilities.git
cd investboard-capabilities
pnpm install --frozen-lockfile
pnpm --filter @investboard/portfolio-intelligence build
```

Then make the skill available to your agent. For Claude Code, link it into your personal skills folder:

```sh
ln -s "$PWD/skills/portfolio-intelligence-engine" ~/.claude/skills/portfolio-intelligence-engine
```

For another agent, use its skills folder in the same way, or work inside the checkout and point the agent at [`SKILL.md`](SKILL.md).

## Try it

```sh
node skills/portfolio-intelligence-engine/scripts/run.mjs \
  --portfolio skills/portfolio-intelligence-engine/examples/portfolio.csv \
  --fund-holdings skills/portfolio-intelligence-engine/examples/fund-holdings.csv \
  --securities skills/portfolio-intelligence-engine/examples/securities.csv \
  --out /tmp/portfolio-intelligence-example
```

Every portfolio CSV row must state its reported `listing_currency`; base currency is not a substitute. Currency estimates carry machine-readable proxy qualification. Use JSON for dated source-backed currency evidence; see the package README.

The example files are synthetic. One fund has no constituent list, so the result is partial and says so.

## Related

The [Investboard AI toolkit](https://github.com/Investboard/ai-toolkit) has the conversational Portfolio Intelligence skill, which works with files in any chat client and with a connected Investboard account. This skill is its counterpart for agents that can run the open-source engine. [`references/methods.md`](references/methods.md) states what the engine calculates; a test keeps its constants equal to the code.
