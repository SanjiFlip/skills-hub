import { describe, expect, it } from 'vitest'
import { resolveOAuthClientIds } from './build-desktop.mjs'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const githubKey = 'SKILLS_HUB_GITHUB_CLIENT_ID'
const gitlabKey = 'SKILLS_HUB_GITLAB_CLIENT_ID'
const githubId = 'Ov23liPublicTest12345'
const gitlabId = 'a1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'

function withoutOAuthClientIds(env = process.env) {
  const clean = { ...env }
  delete clean[githubKey]
  delete clean[gitlabKey]
  return clean
}

describe('desktop OAuth build configuration', () => {
  it('requires both public client IDs and reports configured without printing their values', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-hub-build-'))
    const scripts = path.join(root, 'scripts')
    const copied = path.join(scripts, 'build-desktop.mjs')
    try {
      mkdirSync(scripts)
      copyFileSync(fileURLToPath(new URL('./build-desktop.mjs', import.meta.url)), copied)
      const env = withoutOAuthClientIds()
      const run = value => spawnSync(process.execPath, [realpathSync(copied), '--check-oauth-only'], { env: value, encoding: 'utf8' })
      expect(run(env).status).toBe(1)
      expect(run({ ...env, [githubKey]: githubId }).stderr).toContain(gitlabKey)
      const configured = run({ ...env, [githubKey]: githubId, [gitlabKey]: gitlabId })
      expect(configured.status).toBe(0)
      expect(configured.stdout).toContain('GitHub and GitLab OAuth public Client IDs: configured')
      expect(configured.stdout + configured.stderr).not.toContain(githubId)
      expect(configured.stdout + configured.stderr).not.toContain(gitlabId)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('stops before launch when either public client ID is unusable', () => {
    for (const key of [githubKey, gitlabKey]) {
      for (const value of [undefined, '', '  ', 'ghp_this_is_a_user_token', '${SECRET}', 'secret value']) {
        const env = { [githubKey]: githubId, [gitlabKey]: gitlabId, [key]: value }
        expect(() => resolveOAuthClientIds(env)).toThrow(key)
      }
    }
  })

  it('reads only the two allowlisted public keys without expanding other fields', () => {
    const contents = [
      'USER_TOKEN=private',
      'SKILLS_HUB_GITHUB_CLIENT_SECRET=private',
      `export ${githubKey}="${githubId}" # public`,
      `${gitlabKey}='${gitlabId}'`,
    ].join('\n')
    expect(resolveOAuthClientIds({}, contents)).toEqual({
      [githubKey]: githubId,
      [gitlabKey]: gitlabId,
    })
  })

  it('uses build environment per key and falls back to the file only for a missing key', () => {
    const fromFileGithub = 'Ov23liFromFile12345'
    const fromFileGitlab = 'b1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'
    expect(resolveOAuthClientIds(
      { [githubKey]: githubId },
      `${githubKey}=${fromFileGithub}\n${gitlabKey}=${fromFileGitlab}`,
    )).toEqual({ [githubKey]: githubId, [gitlabKey]: fromFileGitlab })
  })

  it('does not read an explicit fallback file when both environment values are configured', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-hub-build-'))
    const scripts = path.join(root, 'scripts')
    const copied = path.join(scripts, 'build-desktop.mjs')
    try {
      mkdirSync(scripts)
      copyFileSync(fileURLToPath(new URL('./build-desktop.mjs', import.meta.url)), copied)
      const result = spawnSync(process.execPath, [
        realpathSync(copied),
        '--check-oauth-only',
        '--oauth-env-file',
        path.join(root, 'missing.env'),
      ], {
        env: { ...withoutOAuthClientIds(), [githubKey]: githubId, [gitlabKey]: gitlabId },
        encoding: 'utf8',
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('configured')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uses an explicit fallback file only for an environment value that is missing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-hub-build-'))
    const scripts = path.join(root, 'scripts')
    const copied = path.join(scripts, 'build-desktop.mjs')
    const oauthFile = path.join(root, 'oauth.env')
    try {
      mkdirSync(scripts)
      copyFileSync(fileURLToPath(new URL('./build-desktop.mjs', import.meta.url)), copied)
      writeFileSync(oauthFile, `${gitlabKey}=${gitlabId}\n`)
      const result = spawnSync(process.execPath, [
        realpathSync(copied),
        '--check-oauth-only',
        '--oauth-env-file',
        oauthFile,
      ], {
        env: { ...withoutOAuthClientIds(), [githubKey]: githubId },
        encoding: 'utf8',
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('configured')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uses the repository .env when no build environment or explicit file is provided', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-hub-build-'))
    const scripts = path.join(root, 'scripts')
    const source = fileURLToPath(new URL('./build-desktop.mjs', import.meta.url))
    const copied = path.join(scripts, 'build-desktop.mjs')
    try {
      mkdirSync(scripts)
      copyFileSync(source, copied)
      writeFileSync(path.join(root, '.env'), `${githubKey}=${githubId}\n${gitlabKey}=${gitlabId}\n`)
      const result = spawnSync(process.execPath, [realpathSync(copied), '--check-oauth-only'], {
        env: withoutOAuthClientIds(),
        encoding: 'utf8',
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('configured')
      expect(result.stdout + result.stderr).not.toContain(githubId)
      expect(result.stdout + result.stderr).not.toContain(gitlabId)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects duplicate or malformed allowlisted keys without echoing input', () => {
    for (const key of [githubKey, gitlabKey]) {
      const otherKey = key === githubKey ? gitlabKey : githubKey
      const otherValue = key === githubKey ? gitlabId : githubId
      for (const file of [
        `${key}=first\n${key}=second\n${otherKey}=${otherValue}`,
        `${key}=$(echo private-secret)\n${otherKey}=${otherValue}`,
        `${key}="unterminated-private-secret\n${otherKey}=${otherValue}`,
      ]) {
        try { resolveOAuthClientIds({}, file); throw new Error('should fail') } catch (error) {
          expect(error.message).toContain(key)
          expect(error.message).not.toContain('private-secret')
        }
      }
    }
  })

  it.each([
    ['build', []],
    ['dev', ['--dev']],
  ])('passes both IDs and the %s subcommand to Tauri without importing file secrets', (_, modeArgs) => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-hub-build-'))
    const scripts = path.join(root, 'scripts')
    const cliDir = path.join(root, 'node_modules', '@tauri-apps', 'cli')
    const copied = path.join(scripts, 'build-desktop.mjs')
    try {
      mkdirSync(scripts, { recursive: true })
      mkdirSync(cliDir, { recursive: true })
      copyFileSync(fileURLToPath(new URL('./build-desktop.mjs', import.meta.url)), copied)
      writeFileSync(path.join(root, '.env'), [
        `${githubKey}=${githubId}`,
        `${gitlabKey}=${gitlabId}`,
        'SKILLS_HUB_GITHUB_CLIENT_SECRET=must-not-be-imported',
        'USER_TOKEN=must-not-be-imported',
      ].join('\n'))
      writeFileSync(path.join(cliDir, 'package.json'), '{"name":"@tauri-apps/cli","version":"0.0.0"}')
      writeFileSync(path.join(cliDir, 'tauri.js'), [
        'const picked = {',
        '  args: process.argv.slice(2),',
        `  github: process.env.${githubKey},`,
        `  gitlab: process.env.${gitlabKey},`,
        '  githubSecret: process.env.SKILLS_HUB_GITHUB_CLIENT_SECRET,',
        '  userToken: process.env.USER_TOKEN,',
        '}',
        'console.log(JSON.stringify(picked))',
      ].join('\n'))
      const result = spawnSync(process.execPath, [realpathSync(copied), ...modeArgs, '--config', 'test.json'], {
        env: withoutOAuthClientIds({ PATH: process.env.PATH }),
        encoding: 'utf8',
      })
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout.trim())).toEqual({
        args: [modeArgs.length ? 'dev' : 'build', '--config', 'test.json'],
        github: githubId,
        gitlab: gitlabId,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
