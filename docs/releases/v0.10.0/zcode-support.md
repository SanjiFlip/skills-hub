# ZCode Support

## Summary

Skills Hub now includes ZCode as a built-in AI coding tool. Managed Skills can be synchronized to ZCode at both user and project scope.

## Path Rules

- Tool key: `zcode`
- Display name: `ZCode`
- Global Skills directory: `~/.zcode/skills`
- Project Skills directory: `.zcode/skills`
- Installation detection directory: `~/.zcode`

These locations follow the current ZCode documentation for user-level and workspace-level Skills.

## User Experience

- ZCode appears in tool management, installation, and Skill synchronization flows.
- Existing Skills under `~/.zcode/skills` can be discovered and imported.
- ZCode uses the Z.ai product icon in the interface.

## Validation

- Added an adapter regression test covering the global path, project path, detection path, and project-scope capability.
- Updated the documented built-in tool count from 47 to 48.

## Related Issue

- [#144](https://github.com/qufei1993/skills-hub/issues/144)
