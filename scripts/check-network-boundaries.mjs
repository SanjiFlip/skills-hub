import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RULES = [
  {
    rule: 'direct-http-client',
    pattern: /(?:reqwest::blocking::)?Client::(?:builder|new)\s*\(/,
  },
  {
    rule: 'remote-git-transport',
    pattern: /(?:FetchOptions|PushOptions)::new\s*\(|Repository::clone\s*\(/,
  },
  {
    rule: 'proxy-environment',
    pattern: /std::env::var\s*\(\s*"(?:HTTP|HTTPS|ALL|NO)_PROXY"/i,
  },
]

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
    const lines = (await readFile(file, 'utf8')).split('\n')
    const inlineTestsStart = lines.findIndex(
      (line, index) =>
        line.trim() === '#[cfg(test)]' &&
        lines.slice(index + 1, index + 4).some((next) => /^mod tests\b/.test(next.trim())),
    )
    for (let index = 0; index < lines.length; index += 1) {
      if (inlineTestsStart >= 0 && index >= inlineTestsStart) continue
      for (const { rule, pattern } of RULES) {
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
