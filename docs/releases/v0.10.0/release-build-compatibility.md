# 发布构建与平台兼容性

本文汇总 v0.10.0 的发布构建检查和平台构建兼容性修复。

## 安装包 OAuth 配置检查

正式安装版仅使用编译期的 OAuth 配置，不读取用户机器上的 `.env`。开发版能授权不代表打包时配置已经注入。

所有 `npm run tauri:build*` 命令现在先检查 `SKILLS_HUB_GITHUB_CLIENT_ID`。CI 保持从已有构建环境注入；本地显式选择配置文件：

```bash
npm run tauri:build:mac:universal:dmg -- --oauth-env-file /absolute/path/to/.env
```

先只检查配置、不构建：

```bash
node scripts/build-desktop.mjs --oauth-env-file /absolute/path/to/.env --check-oauth-only
```

只提取精确命名的公开 Client ID，不执行文件内容、不展开变量、不导入 Client Secret 或用户 Token、不访问钥匙串；日志不打印配置值。已有显式环境变量优先。不要将 `.env` 复制进安装包。

直接运行 `tauri build` 或 `cargo build` 会绕过 npm 的前置检查；发布和分发包须使用上述受检查的入口。

验证包括缺失与无效值拒绝、重复声明拒绝、环境变量优先、无秘密值日志、实际命令退出码，以及生成包两种架构均包含对应的编译期 Client ID。Client ID 存在不能证明 GitHub 服务、网络或用户授权已成功，仍需在目标设备走一次登录流程。

## Windows/MSVC Rust 测试目标编译

[Issue #142](https://github.com/qufei1993/skills-hub/issues/142) 报告 Windows/MSVC 无法编译 Rust Clippy 和测试目标。[PR #143](https://github.com/qufei1993/skills-hub/pull/143) 作为社区贡献修复了三个平台差异：

- 将 `Cred::credtype()` 与 `CredentialType::bits()` 转换到共同的跨平台整数类型后比较，兼容 MSVC 与 GCC/Clang 的 C 枚举底层类型差异。
- 仅在 Unix 测试中导入 `PathBuf`，避免 Windows 上出现未使用导入。
- 移除 `try_link_dir` Windows 分支末尾多余的 `return`，通过启用 `-D warnings` 的 Clippy 检查。

修复后，`cargo clippy --all-targets --all-features -- -D warnings` 可在报告环境中通过，Rust 测试目标也可完成编译。该修改不改变 Unix 平台行为。

### 已知边界

报告环境中的 Rust 测试程序随后仍可能以 `0xc0000139 STATUS_ENTRYPOINT_NOT_FOUND` 启动失败。该现象与既有 Tauri 测试运行环境有关，不是上述三处编译错误，也未由 PR #143 修复；因此发布记录只声明 Windows 测试目标恢复编译，不声明所有 Windows Rust 测试已经成功运行。
