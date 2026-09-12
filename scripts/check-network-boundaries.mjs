import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATIC_RULES = [
  {
    rule: 'remote-git-transport',
    pattern: /(?:FetchOptions|PushOptions)::new\s*\(|Repository::clone\s*\(/,
  },
  {
    rule: 'proxy-environment',
    pattern: /std::env::var\s*\(\s*"(?:HTTP|HTTPS|ALL|NO)_PROXY"/i,
  },
]

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const httpClientPattern = (source) => {
  const names = ['Client', 'ClientBuilder']
  for (const match of source.matchAll(/\b(?:Client|ClientBuilder)\s+as\s+([A-Za-z_]\w*)/g)) {
    names.push(match[1])
  }
  const constructors = names.map(escapePattern).join('|')
  return new RegExp(
    `\\b(?:(?:reqwest(?:::blocking)?::)?(?:${constructors}))::(?:builder|new|default)\\s*\\(`,
  )
}

const countCharacter = (value, character) =>
  [...value].filter((candidate) => candidate === character).length

const testOnlyLines = (lines) => {
  const skipped = new Set()
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== '#[cfg(test)]') continue
    let item = index + 1
    while (item < lines.length && lines[item].trim() === '') item += 1
    if (!/^mod\s+\w+\b/.test(lines[item]?.trim() ?? '')) continue

    let depth = 0
    let foundOpeningBrace = false
    for (let current = index; current < lines.length; current += 1) {
      skipped.add(current)
      depth += countCharacter(lines[current], '{')
      depth -= countCharacter(lines[current], '}')
      foundOpeningBrace ||= lines[current].includes('{')
      if (foundOpeningBrace && depth === 0) break
    }
  }
  return skipped
}

const collectRustFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectRustFiles(target)))
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      files.push(target)
    }
  }
  return files
}

const isTestFile = (relative) =>
  relative.includes('/tests/') || relative.endsWith('.test.rs')

export const checkNetworkBoundaries = async (rootDir) => {
  const sourceRoot = path.join(rootDir, 'src-tauri', 'src')
  const files = await collectRustFiles(sourceRoot)
  const violations = []
  for (const file of files.sort()) {
    const relative = path.relative(rootDir, file).split(path.sep).join('/')
    if (relative === 'src-tauri/src/core/network_proxy.rs' || isTestFile(relative)) {
      continue
    }
    const source = await readFile(file, 'utf8')
    const lines = source.split('\n')
    const skipped = testOnlyLines(lines)
    const rules = [
      { rule: 'direct-http-client', pattern: httpClientPattern(source) },
      ...STATIC_RULES,
    ]
    for (let index = 0; index < lines.length; index += 1) {
      if (skipped.has(index)) continue
      for (const { rule, pattern } of rules) {
        if (pattern.test(lines[index])) {
          violations.push({ rule, file: relative, line: index + 1 })
        }
      }
    }
  }
  return violations
}

const main = async () => {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const violations = await checkNetworkBoundaries(rootDir)
  if (violations.length === 0) {
    console.log('Network boundary check passed.')
    return
  }
  console.error('Network boundary violations:')
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.rule}]`)
  }
  process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
