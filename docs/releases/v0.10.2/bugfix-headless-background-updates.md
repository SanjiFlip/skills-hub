# 后台自动更新改为完全无窗口

## 问题

在 Windows 上，自动更新期间会弹出一个可见窗口，并且在更新结束前完全无法操作。该窗口还会在计划任务到点时自行出现。

根因是一条完整的调用链：

1. 界面上的「立即更新」调用 `trigger_auto_update_task_now_cmd`，该命令通过 `system_scheduler::trigger_auto_update_task_now()` 执行 `schtasks /Run`。
2. 注册的计划任务动作是 `"<exe>" --background-task update-skills --force`，因此这一步会启动**第二个完整的图形界面实例**。
3. 该实例的窗口来自 `tauri.conf.json` 中声明的配置窗口。Tauri 在 `setup` 之前就创建这些窗口（`tauri-2.9.5/src/app.rs`：`app.config().app.windows.iter().filter(|w| w.create)`），而 `lib.rs` 只对 macOS 调用了 `ActivationPolicy::Accessory`，Windows 没有任何等价处理。
4. 同一个 `setup` 随后**同步**执行整个更新，阻塞自身事件循环。结果是窗口已经显示、却无法绘制也无法响应输入，直到更新结束进程退出。

计划任务按同样的方式启动，所以即使没有人点击「立即更新」，也会定时出现同样的窗口。

另外，「立即更新」会无条件调用 `install_auto_update_task`，因此即使用户已经关闭自动更新，该计划任务仍会被重新注册并继续每天强制更新。

## 修复

- 在 `runtime_context()` 中，当进程参数为后台任务时，把配置中声明的窗口标记为不创建（`WindowConfig::create = false`）。这是唯一能阻止窗口创建的位置：在 `setup` 中隐藏已经太晚，窗口仍会闪现。副作用是后台运行不再启动 WebView2 与前端页面。
- 「立即更新」改为在当前进程内执行 `run_auto_update_now`，并以分离任务的方式运行，调用方立即返回，界面继续像以前一样从数据库轮询逐项进度。
- 「立即更新」不再注册操作系统计划任务。计划任务的安装与移除统一由自动更新开关（`set_auto_update_config`）负责。
- `SkillStore` 的每个连接增加 5 秒 `busy_timeout`。此前只有 `PRAGMA foreign_keys = ON`，rusqlite 默认不等待，应用与后台更新同时写入时会直接返回 `SQLITE_BUSY`。
- 不再被调用的调度器触发函数按项目既有约定标注 `#[allow(dead_code)]`，不删除 macOS 与 Linux 分支。

## 最终行为

后台更新不再创建任何窗口，也不再启动 WebView2，因此不会出现弹窗、卡死窗口或资源占用。界面上的「立即更新」在本进程内执行，界面保持可交互并实时显示逐项进度。自动更新开关是决定操作系统计划任务存在与否的唯一入口。
