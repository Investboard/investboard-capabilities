# Contributing

Help people build better personal investing tools. Contributions can improve an existing calculation, explain an assumption, add a useful example or introduce another reusable investing capability.

## Propose a change

Open an issue with the investing question you want to help someone answer. For a bug, include a small synthetic example, the result you expected and the result you received. For a new capability, describe its inputs, outputs and a practical way someone could use it in their own engine.

## Make it reusable

- Keep calculation modules independent of accounts, hosted services and data providers.
- State units, supported inputs and assumptions clearly. Preserve unknown or unsupported states in the result.
- Include sources for historical assumptions and identify synthetic example data.
- Cover meaningful calculation changes with a regression that checks the result a caller receives.
- Explain compatibility when a change affects saved calculations or the public API.

## Work locally

Use Node 22 or newer and pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm example
pnpm format:check
```

Use focused tests while working on a single module. A pull request should explain what someone can now do, why the calculation or behavior changed, and how to reproduce an example.

## License

Preserve the existing copyright notices and [Apache License 2.0](LICENSE).
