# 理解提示词库的存储与备份

理解 dsh-prompt-hub 把数据放在哪、怎么写、坏了怎么办，再决定如何备份和迁移。

## 数据文件

- 位置：`$DSH_HOME/prompt-hub/data.json`。
- `$DSH_HOME` 的解析顺序：Harness 的 `dshHomePath` 服务 → 环境变量 `DSH_HOME` → `~/.dsh`。
- 内容：一个 JSON 文档，包含 `version`、`rev`、`categories`、`prompts`。
- 面板、输入框选择器和 AI 工具读写同一个文件，没有第二份副本。

## 修订号与并发

- 每次成功写入，`rev` 加一。
- 写入方带上读取时的 `expectedRev`。文件已被别人改过时，请求被拒绝（HTTP 409），面板显示“提示词库已在其他窗口更新，你的修改未保存。”，并载入对方的最新版本。
- 面板和 AI 的写入在 Host 内串行执行，不会交叉覆盖。

## 备份与自动修复

- 每次成功写入前，会先尝试把当前文件复制到 `$DSH_HOME/prompt-hub/backups/`，文件名形如 `data.<时间戳>.<随机后缀>.json`。
- 只保留最新的 10 份备份，更旧的自动删除。
- 写入是原子的：先写临时文件，再重命名覆盖，避免留下写了一半的文件。
- 读取时若 `data.json` 损坏或无法解析，会用最新一份可读备份自动修复并写回。没有可用备份时，面板显示读取失败和 **重试**。

## 手动恢复一份旧备份

1. 退出 DeepSeek Harness。
2. 打开 `$DSH_HOME/prompt-hub/`，把当前 `data.json` 复制一份留底。
3. 在 `backups/` 里挑一份时间合适的 `data.*.json`，复制到 `$DSH_HOME/prompt-hub/data.json`，覆盖当前文件。
4. 重新启动 Harness，打开 **提示词中心** 确认内容。

> 备份按文件名排序取最新 10 份。手动恢复前先留底，避免用更旧的版本覆盖唯一可用的数据。

## 备份策略

- 日常迁移用 **导出 JSON**。它导出完整库，可在另一台机器用 **导入 JSON** 还原。
- 自动备份只防写入损坏，不替代异地备份。

## 相关文章

- [导入和导出提示词库](import-export.md)
- [提示词库数据格式](reference/data-format.md)
- [故障排除](troubleshooting.md)
