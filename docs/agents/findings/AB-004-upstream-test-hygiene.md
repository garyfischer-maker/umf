# AB-004 — Upstream test hygiene write-up

Draft upstream issues for a human to file on `DocumentDrivenDX/umf`. Nothing here has
been filed. Observed on `agent-work` at `8d96b375`, Bun 1.4.4, Linux, Playwright 1.63.0
with Chromium 153.0.8010.12 (`/opt/pw-browsers/chromium`), a fresh clone with
`bun install --frozen-lockfile` and no `dist/`, no `protoc`, no `go`.

## Question

Which failures occur on any fresh checkout, why, and what is the smallest fix for each?

## Sources

Repo files cited below; test runs executed in this session (commands inline). No
external sources. Items I could not reproduce are marked.

## Findings

### 1. Chromium 148 pin versus Playwright 1.63's Chromium 153 — reproduced (scripts only)

- **Reproduce:** compare the pin with the installed browser. The scripts below assert
  the string, and the recorded `browser` fields in fixtures are `148.0.7778.0`
  (`grep -l 148.0.7778 fixtures/**/browser-results.json`). `package.json:94` pins
  `playwright` 1.63.0, whose bundled Chromium is 153.
- **Affected:** `tests/core-ideals/*conformance*` and `*evidence*` through
  `scripts/core-ideals/{relationship-evidence.ts:47, cardinality-conformance.ts:65,82,
  field-conformance.ts:94-95, facets-conformance.ts:20}`, which fall back to
  `'148.0.7778.0'`; and the `cardinality-{avro,postgresql,parquet,sqlserver}-browser.ts`
  scripts, which use `process.env.UMF_EXPECTED_CHROMIUM_VERSION??'148.0.7778.0'`.
- **Root cause:** the expected browser is a literal in each script instead of one
  shared constant or the value in the committed evidence. Two scripts already honour
  `UMF_EXPECTED_CHROMIUM_VERSION`; the others do not.
- **Fix:** one `expectedChromium()` helper (env override, else the version recorded in
  the evidence being verified), used by all of the scripts above. Recording a new
  browser version should be a deliberate evidence refresh, not a test edit.
- **Not verified:** I did not run `facets-conformance` to completion (it exceeded the
  tool timeout) or `facets-evidence`, so the exact failing assertion per test is
  unconfirmed.

### 2. `/home/erik/...` absolute paths in key evidence — reproduced in part

- **Evidence:** 97 files under `fixtures/validation/*.json` contain `/home/erik`.
  `tests/helpers/recorded-repository-path.ts` strips the `/home/erik/Projects/umf/`
  prefix for tests that use it, and `scripts/core-ideals/facets-evidence.ts:25` has
  its own `legacy` prefix handling. Scripts also default to `/home/erik/...` toolchains:
  `scripts/tablespec-sources.ts:4`, `scripts/core-ideals/key-tablespec-oracle.ts:13`,
  `cardinality-tablespec-oracle.ts:5,8` (`JAVA_HOME`), `relationship-tablespec-oracle.ts:17`.
- **Affected:** tests that verify recorded evidence without going through the helper;
  oracle scripts on any machine without `/home/erik`. I did not isolate one failing
  test caused only by the path, so treat the test list as unconfirmed.
- **Root cause:** evidence recorded absolute paths, and the relocation helper is
  opt-in per caller.
- **Fix:** apply `recordedRepositoryPath` at the single evidence-reader (`reader`) used
  by `field-conformance.ts` and `key-evidence.ts`, and require `UMF_TABLESPEC_PYTHON`,
  `JAVA_HOME` and the TableSpec source root with a clear error instead of defaulting to
  a home directory.

### 3. Stale tablespec loader hash — resolved, do not file

**Review note (2026-11-06):** this was a real failure on a pre-merge checkout. On
2026-10-21, `relationship-conformance` reported `Stale revalidated relationship source
native/tablespec/sources/tests/unit/test_umf_loader.py` (expected `88944e41…`, actual
`9f39055e…`) on `feat/dashboard-profile`, before upstream `main` was merged in. That
expected hash no longer appears anywhere on `agent-work`, so the evidence refresh on
`main` fixed it. Nothing to file. The agent's original notes follow.

- **Check:** `sha256sum native/tablespec/sources/tests/unit/test_umf_loader.py` is
  `9f39055e…0fc6`. The same value is in `native/tablespec/sources.json:93` and in all
  15 `fixtures/validation/*.json` entries that name the file. `git ls-files --eol`
  shows `i/lf w/lf attr/-text`, so the committed bytes are used unmodified.
- **Conclusion:** on this checkout the hash is current. The backlog and README claim
  it is stale; that may hold for a different checkout (for example a CRLF copy, since
  `.gitattributes` marks the path `-text` and a copy made outside git could differ) or
  a test I did not run. `[NEEDS CLARIFICATION]` which test reports it; do not file this
  upstream until it is reproduced.

### 4. Evidence that hashes `dist/*` bundles — reproduced

- **Reproduce:** `bun test tests/core-ideals/field-conformance.test.ts` →
  `historical native/browser evidence reports partial replay…` fails with
  `AssertionError: Only unrecovered historical build artifacts may be left unqualified`
  at `scripts/core-ideals/field-conformance.ts:48`. `bun test
  tests/core-ideals/key-evidence.test.ts` fails both tests; the first expects an error
  containing `stale` but gets `ENOENT: no such file or directory, open
  'dist/postgresql/libpg-query.wasm'`.
- **Affected:** `field-conformance`, `key-evidence`, and every script that puts
  `dist/umf.js` or similar in a `sha256` map (for example
  `scripts/binding/sqlserver-browser.ts:22`,
  `scripts/core-semantic-types-browser.ts:66`). `dist/` is gitignored (`.gitignore`),
  so a fresh clone has no bundles.
- **Root cause:** evidence maps hash build output that is not committed.
  `observedHash` (`field-conformance.ts:53-58`) and `key-evidence.ts:137` turn `ENOENT`
  into `MISSING` only when `allowUnqualifiedHistorical` is set, and
  `field-conformance.ts:48` / `key-evidence.ts:142` then require the path to be listed
  as unrecovered in the recovery record; a `dist/` path that is absent but not listed
  fails, and the non-historical path throws `ENOENT` rather than reporting a stale or
  unqualified proof.
- **Fix:** run `bun run build` in test setup, or have the verifiers report a missing
  `dist/*` as `unqualified: bundle not built` in both modes, and add the missing
  `dist/` paths to the recovery record only if they are truly unrecoverable.

### 5. CRLF checkout and `patches/jsonld@9.0.0.patch` — resolved, do not file

**Review note (2026-11-06):** this was a local install-order problem, not an upstream
bug. On one Windows clone, `node_modules/jsonld` was installed on 2026-10-09, before the
`.gitattributes` line-ending fix landed. The patch was applied from a CRLF checkout, so
its added lines carried `\r`. Reinstalling (`rm -rf node_modules/jsonld && bun install`)
fixed it. With the current `.gitattributes` it cannot recur through git, as the agent
found. Nothing to file. The agent's original notes follow.

- **Check:** the patch is LF in the repo (`grep -c $'\r'` → 0) and
  `git ls-files --eol` reports `attr/text=auto eol=lf`; `.gitattributes` begins with
  `* text=auto eol=lf`, so `core.autocrlf=true` does not rewrite it. The patch is
  referenced from `package.json:99-101` (`patchedDependencies`).
- **Conclusion:** the stated problem can only arise when the file bypasses git
  (archive download, copy from a Windows tree). I did not test a CRLF install.
  `[NEEDS CLARIFICATION]` whether anyone saw it with `.gitattributes` in place. If so,
  the likely fix is a `patches/** text eol=lf` line that survives archive export, plus
  a CI step that fails when `patches/*` contain `\r`.

## Mapping to umf.dashboard

Not applicable; this item concerns test infrastructure.

## Open questions

- `[NEEDS CLARIFICATION]` The failing assertions of `facets-conformance` and
  `facets-evidence` on Chromium 153.
- Resolved in review: the stale `test_umf_loader.py` hash (fixed on `main`) and the CRLF
  patch install (a local, pre-fix install). Only findings 1, 2 and 4 go upstream.

## Proposed next build item

A build item for the Chromium helper (finding 1) and the `dist/*` handling (finding 4)
in `scripts/core-ideals/`, following the upstream maintainers' preference on whether
tests should build first or report unqualified evidence.
