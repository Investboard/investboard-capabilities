import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const tscVersion = readJson(join(tsc, "..", "..", "package.json")).version;
const artifactDir = process.argv[2] ? resolve(process.argv[2]) : null;
assert(
	process.argv.length <= 3,
	"Usage: pnpm release:check [new-artifact-directory]",
);
assert(
	!artifactDir || !existsSync(artifactDir),
	"Choose a new artifact directory",
);

function run(command, args, cwd = root) {
	execFileSync(command, args, { cwd, stdio: "inherit" });
}

function readCatalogue() {
	const { schemaVersion, capabilities } = readJson(
		join(root, "capabilities.json"),
	);
	assert.equal(schemaVersion, 1);
	assert.deepEqual(
		capabilities.map(({ id }) => id).sort(),
		readdirSync(join(root, "packages"), { withFileTypes: true })
			.filter((dir) => dir.isDirectory())
			.map(({ name }) => name)
			.sort(),
	);
	for (const capability of capabilities) {
		const {
			id,
			path,
			package: name,
			version,
			license,
			documentation,
		} = capability;
		assert.equal(path, "packages/" + id);
		assert.equal(documentation, path + "/README.md");
		assert(existsSync(join(root, documentation)), "Missing " + documentation);
		const pkg = readJson(join(root, path, "package.json"));
		assert.deepEqual(
			[pkg.name, pkg.version, pkg.license],
			[name, version, license],
		);
	}
	return capabilities;
}

function readReleaseIndex(catalogue) {
	const { schemaVersion, artifacts } = readJson(join(root, "releases.json"));
	assert.equal(schemaVersion, 1);
	const versions = new Set();
	const methods = new Set();
	for (const artifact of artifacts) {
		const {
			package: name,
			version,
			tag,
			sourceCommit,
			methodologies,
		} = artifact;
		assert(
			catalogue.some((item) => item.package === name),
			"Unknown release package " + name,
		);
		assert(
			/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version),
			"Invalid package version " + version,
		);
		assert(/^[a-z0-9][a-z0-9.-]+$/.test(tag), "Invalid release tag " + tag);
		if (sourceCommit !== undefined)
			assert(
				/^[0-9a-f]{40}$/.test(sourceCommit),
				"Pin the full archived source commit",
			);
		else
			assert(
				catalogue.some(
					(item) => item.package === name && item.version === version,
				),
				"Unpinned previous version of " + name,
			);
		const key = name + "@" + version;
		assert(!versions.has(key), "Duplicate release artifact " + key);
		versions.add(key);
		assert(
			Array.isArray(methodologies) && methodologies.length > 0,
			"Missing methodologies for " + key,
		);
		for (const method of methodologies) {
			assert(
				typeof method === "string" && /-v[0-9]+$/.test(method),
				"Invalid methodology " + method,
			);
			assert(!methods.has(method), "Duplicate replay methodology " + method);
			methods.add(method);
		}
	}
	return artifacts;
}

function pack(artifact, packagePath, destination) {
	const pkg = readJson(join(packagePath, "package.json"));
	assert.deepEqual(
		[pkg.name, pkg.version],
		[artifact.package, artifact.version],
	);
	assert.deepEqual(
		pkg.dependencies ?? {},
		{},
		pkg.name + " should have no runtime dependencies",
	);
	run(
		"npm",
		[
			"pack",
			"--ignore-scripts",
			"--loglevel=error",
			"--cache",
			join(destination, "..", "npm-cache"),
			"--pack-destination",
			destination,
		],
		packagePath,
	);
	const file = join(
		destination,
		artifact.package.replace(/^@/, "").replace("/", "-") +
			"-" +
			pkg.version +
			".tgz",
	);
	assert(existsSync(file), "Missing package archive " + file);
	return { ...artifact, file };
}

function checkInstall(packages, cwd) {
	mkdirSync(cwd);
	writeFileSync(
		join(cwd, "package.json"),
		'{"name":"capabilities-release-smoke","private":true,"type":"module"}\n',
	);
	run(
		"npm",
		[
			"install",
			"--offline",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--cache",
			join(cwd, "..", "npm-cache"),
			...packages.map(({ file }) => file),
		],
		cwd,
	);
	const imports = packages.map(
		({ package: name }, index) =>
			"import * as module" + index + " from " + JSON.stringify(name) + ";",
	);
	const checks = packages.map((artifact, index) => {
		const binding = "module" + index;
		const methods = JSON.stringify(artifact.methodologies);
		const checks = [
			"assert(" + methods + ".includes(" + binding + ".METHODOLOGY_VERSION));",
		];
		if (
			artifact.methodologies.some((method) =>
				method.startsWith("weekly-common-sample-correlation-"),
			)
		) {
			checks.push(
				"assert(" +
					methods +
					".includes(" +
					binding +
					".CORRELATION_METHODOLOGY_VERSION));",
			);
		}
		return checks.join("\n");
	});
	writeFileSync(
		join(cwd, "consumer.ts"),
		imports.join("\n") +
			"\n" +
			packages
				.map(
					(_, i) =>
						"const version" +
						i +
						": string = module" +
						i +
						".METHODOLOGY_VERSION;",
				)
				.join("\n"),
	);
	writeFileSync(
		join(cwd, "consumer.mjs"),
		'import assert from "node:assert/strict";\n' +
			imports.concat(checks).join("\n"),
	);
	run(
		process.execPath,
		[
			tsc,
			"--noEmit",
			"--strict",
			"--module",
			"NodeNext",
			"--target",
			"ES2022",
			"consumer.ts",
		],
		cwd,
	);
	run(process.execPath, ["consumer.mjs"], cwd);
}

function archivePackage(artifact, packagePath, destination) {
	const manifest = execFileSync(
		"git",
		["show", artifact.sourceCommit + ":package.json"],
		{ cwd: root, encoding: "utf8" },
	);
	assert.equal(
		JSON.parse(manifest).devDependencies.typescript,
		tscVersion,
		"Use the TypeScript version pinned by " + artifact.sourceCommit,
	);
	const archive = execFileSync(
		"git",
		["archive", artifact.sourceCommit, packagePath],
		{ cwd: root, maxBuffer: 32 * 1024 * 1024 },
	);
	mkdirSync(destination);
	execFileSync("tar", ["-xf", "-", "-C", destination], { input: archive });
	const checkout = join(destination, packagePath);
	run(process.execPath, [tsc, "-p", "tsconfig.json"], checkout);
	return checkout;
}

const catalogue = readCatalogue();
const artifacts = readReleaseIndex(catalogue);

for (const check of ["test", "typecheck", "example", "format:check"])
	run("pnpm", [check]);

for (const item of catalogue) {
	const engine = await import(
		new URL(item.path + "/dist/index.js", new URL("..", import.meta.url))
	);
	assert.equal(
		engine.METHODOLOGY_VERSION,
		item.methodologyVersion,
		item.package,
	);
	assert.equal(
		engine.CORRELATION_METHODOLOGY_VERSION,
		item.correlationMethodologyVersion,
		item.package,
	);
}

const temp = mkdtempSync(join(tmpdir(), "investboard-release-check-"));
try {
	const dist = join(temp, "archives");
	mkdirSync(dist);
	const current = catalogue.map((item) => {
		const artifact = artifacts.find(
			({ package: name, version, sourceCommit }) =>
				name === item.package &&
				version === item.version &&
				sourceCommit === undefined,
		);
		assert(artifact, "Missing current release entry for " + item.package);
		assert(artifact.methodologies.includes(item.methodologyVersion));
		if (item.correlationMethodologyVersion)
			assert(
				artifact.methodologies.includes(item.correlationMethodologyVersion),
			);
		return pack(artifact, join(root, item.path), dist);
	});
	checkInstall(current, join(temp, "current-consumer"));

	const archived = artifacts
		.filter(({ sourceCommit }) => sourceCommit)
		.map((artifact, index) => {
			const item = catalogue.find(
				({ package: name }) => name === artifact.package,
			);
			const checkout = archivePackage(
				artifact,
				item.path,
				join(temp, "source-" + index),
			);
			const packed = pack(artifact, checkout, dist);
			checkInstall([packed], join(temp, "archive-consumer-" + index));
			return packed;
		});

	if (artifactDir) {
		mkdirSync(artifactDir, { recursive: false });
		for (const { file } of current.concat(archived))
			copyFileSync(file, join(artifactDir, basename(file)));
		console.log("Archives written to " + relative(process.cwd(), artifactDir));
	}
	console.log(
		"Verified " +
			current.length +
			" current packages and " +
			archived.length +
			" historical packages.",
	);
} finally {
	rmSync(temp, { recursive: true, force: true });
}
