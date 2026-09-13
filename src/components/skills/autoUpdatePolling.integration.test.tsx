// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../App'
import type { AutoUpdateConfigDto } from './types'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/plugin-updater', () => ({ check: async () => null }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '0.10.1' }))

const autoUpdateConfig: AutoUpdateConfigDto = {
  enabled: false,
  interval_hours: 24,
  schedule_type: 'interval',
  interval_value: 24,
  interval_unit: 'hours',
  daily_time: '03:00',
  local_skill_count: 0,
  protected_local_skill_count: 0,
  task_registered: false,
  task_status_detail: '',
  last_run_at: null,
  last_started_at: null,
  last_finished_at: null,
  last_status: null,
  last_error: null,
  last_checked: 0,
  last_unchanged: 0,
  last_updated: 0,
  last_failed: 0,
  progress: {
    total: 0,
    succeeded: [],
    failed: [],
    running: null,
    pending: [],
  },
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  Object.assign(window, { __TAURI_INTERNALS__: { invoke } })
  invoke.mockReset()
  invoke.mockImplementation(async (command: string) => {
    if (command === 'get_auto_update_config') return autoUpdateConfig
    if (command === 'get_auto_update_runtime') return autoUpdateConfig
    if (command === 'get_managed_skills') return []
    if (command === 'get_tags') return []
    if (command === 'get_tool_status') {
      return { tools: [], installed: [], newly_installed: [] }
    }
    if (command === 'get_onboarding_plan') {
      return { groups: [], total_skills_found: 0 }
    }
    if (command === 'get_recent_projects') return []
    if (command === 'get_recycle_bin_items') return []
    throw new Error(`Unavailable in test: ${command}`)
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
})

it('keeps recurring progress polling off the system task configuration command', async () => {
  render(<App />)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(invoke.mock.calls.filter(([command]) => command === 'get_auto_update_config')).toHaveLength(1)
  expect(invoke.mock.calls.filter(([command]) => command === 'get_auto_update_runtime')).toHaveLength(1)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })

  expect(invoke.mock.calls.filter(([command]) => command === 'get_auto_update_config')).toHaveLength(1)
  expect(invoke.mock.calls.filter(([command]) => command === 'get_auto_update_runtime')).toHaveLength(2)

  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })

  expect(invoke.mock.calls.filter(([command]) => command === 'get_auto_update_config')).toHaveLength(1)
  expect(invoke.mock.calls.filter(([command]) => command === 'get_auto_update_runtime')).toHaveLength(3)
})
