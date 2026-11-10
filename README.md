# Investboard capabilities

Open investing logic, worked examples, and versioned evidence from [Investboard](https://investboard.com).

This repository is the public home for independently usable Investboard capability modules. Each release will include its calculation logic, documented assumptions and limitations, synthetic examples, and the evidence needed to reproduce its results.

## Release standard

A capability enters the public catalogue only after a documented review scores it **at least 9/10** and its code is ready for public use. The [release policy](CONTRIBUTING.md) defines that gate. A useful interface or a passing test suite cannot compensate for incorrect financial logic.

The catalogue is currently empty while the first capability completes its acceptance review. No stress-testing module is released here yet. See [capabilities.json](capabilities.json) for the released catalogue.

## What a module will contain

- A small, documented API that runs without an Investboard account.
- Explicit units, supported inputs, financial assumptions and unknown states.
- Deterministic calculations, meaningful regression tests and reproducible examples.
- Versioned methodology, source provenance and a release-specific review record.

The modules expose calculation logic. Account access, hosted data ingestion, subscriptions and operational infrastructure belong to the Investboard application and are outside this repository.

## Related projects

[Investboard AI Toolkit](https://github.com/Investboard/ai-toolkit) contains the investing skills and MCP integration. This repository is for reusable investing logic and capability examples.

## License

[Apache License 2.0](LICENSE).
