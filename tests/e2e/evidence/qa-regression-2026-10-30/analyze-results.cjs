const fs = require('node:fs')
const path = require('node:path')

const runDir = path.resolve(process.argv[2])
const report = JSON.parse(fs.readFileSync(path.join(runDir, 'results.json'), 'utf8'))
const rows = new Map()
const failures = []
const skips = []
const stripAnsi = (value) => String(value ?? '').replace(/\u001b\[[0-9;]*m/g, '')
const clean = (value) => stripAnsi(value).replace(/\r/g, '').split('\n').filter(Boolean).slice(0, 5).join(' | ').replace(/\|/g, '\\|')

function visit(suite, titles = []) {
  const file = path.basename(suite.file || '')
  const prefix = [...titles, suite.title].filter(Boolean)
  for (const spec of suite.specs || []) {
    const specFile = path.basename(spec.file || file)
    const row = rows.get(specFile) || { pass: 0, fail: 0, skip: 0, flaky: 0 }
    for (const test of spec.tests || []) {
      const title = [...prefix.slice(1), spec.title].filter(Boolean).join(' › ')
      const state = test.status
      if (state === 'expected') row.pass++
      else if (state === 'unexpected') row.fail++
      else if (state === 'skipped') row.skip++
      else if (state === 'flaky') row.flaky++
      else throw new Error(`Unknown test status: ${state}`)
      if (state === 'unexpected' || state === 'flaky') {
        const last = test.results.at(-1) || {}
        const errors = (last.errors || []).map((error) => clean(error.message || error.value)).filter(Boolean)
        const shots = (last.attachments || []).filter((attachment) => attachment.contentType === 'image/png').map((attachment) => {
          const source = attachment.path || ''
          const inResults = source.replace(/\\/g, '/').includes('/tests/e2e/.results/')
          const full = inResults ? path.join(runDir, 'failures', path.basename(path.dirname(source)), path.basename(source)) : source
          return full.replace(/\\/g, '/')
        })
        failures.push({ file: specFile, title, state, errors, shots })
      }
      if (state === 'skipped') {
        const annotations = [...(test.annotations || []), ...((test.results[0] || {}).annotations || [])]
        const reason = annotations.map((a) => a.description || a.type).filter(Boolean).join('; ')
        skips.push({ file: specFile, title, reason })
      }
    }
    rows.set(specFile, row)
  }
  for (const child of suite.suites || []) visit(child, prefix)
}
for (const suite of report.suites) visit(suite)

const lines = [
  `# Playwright ${path.basename(runDir)}`,
  '',
  `Stats: ${report.stats.expected} passed, ${report.stats.unexpected} failed, ${report.stats.skipped} skipped, ${report.stats.flaky} flaky; ${report.stats.duration} ms.`,
  '',
  '| Spec file | Pass | Fail | Skip | Flaky |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...[...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, row]) => `| ${file} | ${row.pass} | ${row.fail} | ${row.skip} | ${row.flaky} |`),
  '',
  '## Failures and flakes',
  '',
  ...failures.flatMap((item) => [
    `- **${item.file}: ${item.title}** (${item.state})`,
    `  - Error: ${item.errors.join(' / ') || 'No error in JSON'}`,
    `  - Screenshot: ${item.shots.join(', ') || 'No screenshot attachment'}`,
  ]),
  '',
  '## Skips',
  '',
  ...skips.map((item) => {
    const prior = failures.find((failure) => failure.file === item.file)
    const reason = item.reason || (prior ? `Serial suite stopped after failure: ${prior.title}` : 'No skip annotation in JSON')
    return `- **${item.file}: ${item.title}** — ${reason}`
  }),
  '',
]
fs.writeFileSync(path.join(runDir, 'summary.md'), lines.join('\n').replace(/\n+$/, '\n'))
console.log(JSON.stringify({ files: rows.size, counted: [...rows.values()].reduce((sum, row) => sum + row.pass + row.fail + row.skip + row.flaky, 0), failures: failures.length, skips: skips.length, stats: report.stats }, null, 2))
