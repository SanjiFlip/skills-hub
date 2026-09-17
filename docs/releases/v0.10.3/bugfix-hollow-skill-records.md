# 空壳技能记录

## 问题

库中存在 `central_path` 指向不存在目录的技能记录。观测到的实例：12 条记录中有 10 条的中央库目录缺失，其中 7 条显示 `error`（原因是 `central path not found`，且因 `skill_issues::safe_code` 没有对应分类而被记为 `unknown`），另外 3 条**显示为正常**。

这 10 条记录由设备同步的一次下载创建（`device_sync_runs` 记录该次运行 `added=12`、状态 `success`）。因为本地中央库中已有同名目录，下载目标按 `unique_skill_path_reserved` 选择了 `<名称>-<短id>` 形式的新名称。

## 未确证的根因

目录为何最终不存在，**没有确证**。可以排除的是"从未创建"：`materialize` 流程先对每个目标调用 `PreparedDirReplacement::activate()`（内部执行 `rename(staging, target)`，必然创建目录），**之后**才在 `mod.rs:991` 提交记录。既然记录存在，目录在提交时必然存在。

事后也没有留下痕迹：中央库、应用回收站、Windows 回收站中都没有这些目录，`device_sync_tombstones` 与 `device_sync_conflicts` 均为空——这与"删除后又清空了回收站"的情形一致，但无法据此断定是哪一步。

因此本次修复不针对未经证实的删除路径，而是针对**可以确证的两个缺陷**。

## 修复

**一、空壳技能不再显示为正常。** `commands/mod.rs` 的 `managed_skill_status` 此前对"没有外部来源的本地技能"直接返回 `ok`，从不检查 `central_path` 是否存在——于是内容已经丢失的技能仍显示为可用，用户既看不到问题也没有可操作的入口。现在：

- 新增 `central_path_missing` 判定，对所有本地技能生效，不再被"无来源"短路；
- 缺失时状态为 `error`，并把 `source_error` 置为 `centralMissing`，让界面能给出确切原因；
- `skill_issues::safe_code` 新增 `centralMissing` 分类（此前 `central path not found` 落到 `unknown`），界面新增该原因的三语言文案。

**二、采纳时修复空壳记录，而不是创建重复项。** 若采纳的目录名称已存在一条 `central_path` 缺失的记录，`adopt_existing_central_skill` 会**修复该记录**：重新指向实际存在的目录、重算内容哈希、状态恢复为 `ok`，并保留其 id、标签、启用状态与同步目标。此前会新建一条同名记录，导致同一个技能出现两条记录。

## 最终行为

中央库目录缺失的技能会明确显示为异常并给出原因（中央技能库中的该技能目录不存在），不再默默显示为正常。通过发现横幅采纳同名目录时，对应的空壳记录会被修复而不是复制成第二份，标签与同步目标得以保留。
