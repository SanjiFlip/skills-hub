# 设备同步的数据丢失修复与单向操作

## 问题

同步不仅没有把仓库里的技能带到本地，还**把仓库里的技能删掉了**。观测到的运行记录：

```
20:03:49  success  add=12     首次同步，从仓库下载 12 个
20:18:24  success  del=12     把 12 个从仓库与本地一起删除并推送
20:20:12  success  add=2
20:34:34  success  del=2
```

结果是 `~/.skillshub`、应用回收站、技能库与同步仓库工作区全部为空；只有同步仓库的 git 历史还留有完整内容。

## 根因

`manifest.rs` 的 `export_library` 在导出本地库时跳过了中央库目录缺失的记录：

```rust
for skill in store.list_skills()? {
    let source = Path::new(&skill.central_path);
    if !source.is_dir() {
        continue;          // 静默跳过，于是它不在本地清单里
    }
```

而三方合并把"本地清单里没有"读成"本机删除了它"（`merge.rs`）：

```rust
(Some(base), None, Some(remote)) => {
    if remote.content_hash == base.content_hash {
        plan.delete_remote.insert(id);   // 删除仓库中的副本并推送
    }
```

随后远端删除又通过 `apply_remote_deletions` 清掉本地记录。于是**任何导致本地内容缺失的原因，都会连锁清空仓库**——包括数据库被清空、内容未落盘、以及记录成了空壳。

## 修复

**一、内容不可用不再被当作删除。** 新增 `manifest::unreadable_local_skill_ids`，列出"库中仍有记录但中央库目录不存在"的技能；`plan_merge_with_unreadable` 在 `(base 有, 本地无, 远端有)` 这一分支上优先判断该集合，命中时改为 `take_remote`——**从仓库恢复该技能**，而不是删除仓库副本。生产路径一律传入该集合，三参数版本仅作为测试便利（以 `#[cfg(test)]` 标注）。

**二、导出时留下可诊断的日志。** `export_library` 跳过记录时记录一条 warn，便于以后定位。

**三、新增两个显式单向操作。**

- 「从仓库拉取到本地」：读取仓库清单并调用现有的 `apply_repository_to_library`，把仓库中的技能全部写入本地库；**只新增与更新**，本地有而仓库没有的技能保持不动，因此拉取绝不会删除内容。
- 「推送本地到仓库」：把本地库逐个 `export_skill` 写入仓库并合并清单，提交后推送；**只新增与更新**，仓库有而本地没有的技能保持不动。

两者都会记录 `last_synced_commit`，因此后续自动同步不会因此产生多余变更。自动合并仍是唯一会处理删除的路径。

## 最终行为

本地内容缺失的技能在同步时会被**从仓库恢复**，而不是把仓库里的副本删掉。需要明确控制方向时，可以直接使用「从仓库拉取到本地」或「推送本地到仓库」：两者都只做新增与更新，任何时候都不会移除内容。
