# 从中央技能库恢复库内容

## 问题

应用数据被清空或数据库丢失后，库中只剩少量技能，而中央技能库 `~/.skillshub` 下的目录仍然完好，却再也无法被应用读取。

两个缺陷叠加造成这一结果。

**一、技能发现刻意排除中央库。** `onboarding.rs` 的 `filter_detected` 会过滤掉两类条目：

```rust
if let Some(exclude_root) = exclude_root {          // 生产调用传入中央库路径
    if is_under(&skill.path, exclude_root) { return false; }
    if let Some(target) = &skill.link_target {
        if is_under(target, exclude_root) { return false; }
    }
}
```

正常运行时这是必要的：工具目录里的技能条目都是指向中央库的 junction，若不排除，每次扫描都会把已管理的技能再导入一次。代价是数据库清空后，所有工具镜像都被排除，而中央库自身从不作为扫描来源，于是候选项为空、发现横幅也不会出现。

**二、本地安装拒绝就地采纳。** `installer.rs` 的 `install_local_skill_with_existing_policy` 在目标目录已存在时直接失败：

```rust
if central_path.exists() {
    if reuse_identical_existing { /* 查找已有记录——数据库已清空，找不到 */ }
    anyhow::bail!("skill already exists in central repo: {:?}", central_path);
}
```

因此用户没有任何途径把它找回来：按文件夹添加会报错，换名字添加则会复制出第二份内容。

## 修复

- `installer.rs`：当目标目录已存在、其内容与所选来源**逐字节一致**、且库中没有任何记录指向它时，就地采纳该目录——写入记录、不复制文件，`source_ref` 置空表示本地自持（界面据此正确置灰更新按钮）。内容不一致时保持原有拒绝行为，避免误采纳中央库副本而丢弃用户实际选择的内容。
- `onboarding.rs`：新增中央库扫描，列出含 `SKILL.md` 但库中无记录的目录，作为发现候选并入同一份计划；该来源有意绕过上述排除规则。候选的 `name` 使用目录名，因为安装路径按 `<中央库>/<名称>` 解析。
- `onboarding.rs`：中央技能库作为一条发现来源列出，可通过现有的发现开关关闭。
- `central_repo.rs`：新增 `central_repo_path_without_app`，供没有应用句柄的调用点解析中央库位置（仅用于描述来源）。
- 前端：导入弹窗中把该来源显示为「已存在于中央技能库」，而不是渲染原始来源键。现成的发现横幅与导入流程因此可以直接复用，无需新增界面。

## 最终行为

数据库清空或丢失后，中央技能库中仍然存在的技能会重新出现在「发现可导入的技能」中，选择后即可恢复为受管理的技能——内容原地保留，不复制、不重复。标签与同步目标随数据一并丢失，需要重新设置。若某目录与中央库中已有内容不一致，仍然会被拒绝，不会静默覆盖。
