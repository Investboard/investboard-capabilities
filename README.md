# Investboard capabilities

Reusable investing logic from [Investboard](https://investboard.de), with documented assumptions, synthetic examples and reproducible review evidence.

## Released capabilities

| Module | What it demonstrates | Review |
| --- | --- | --- |
| [Stress testing](packages/stress-test) · v0.1.0 | Historical scenarios, explicit currency uncertainty, supplied price/FX history, reconciled loss attribution and JSON snapshot replay | [9/10 engineering review](reviews/stress-test-0.1.0.md) |

The stress engine runs independently, without an Investboard account, network access or runtime dependencies. Its scenarios are sourced approximations; outputs are hypothetical replays, not forecasts or the investor's actual historical return. See the [module documentation](packages/stress-test/README.md) for units, supported scope and limits.

## Run locally

Use Node 22 or newer and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm example
```

To build a standalone tarball:

```sh
pnpm build
cd packages/stress-test
npm pack
```

The module is published as source in this repository. It has not been published to the npm registry.

## Release standard

Only capabilities with clean, independently usable code and a documented review of **at least 9/10** enter [capabilities.json](capabilities.json). Each entry pins its reviewed source, methodology, evidence and limitations. The [release policy](CONTRIBUTING.md) applies to future additions and changes.

The modules expose calculation logic. Hosted account access, data ingestion, subscriptions and operational infrastructure belong to the Investboard application. Package acceptance does not certify those integrations.

## Related projects

[Investboard AI Toolkit](https://github.com/Investboard/ai-toolkit) contains the investing skills and MCP integration.

## License

[Apache License 2.0](LICENSE).
