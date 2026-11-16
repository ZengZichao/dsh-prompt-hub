# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-14

### Added

- 侧栏 **提示词中心** 面板：按分类和标签整理提示词，支持搜索、置顶、
  创建副本、复制正文、导入导出。
- 输入框 **插入提示词** 选择器：按分类筛选、按 `显示条数` 分页，含
  `{{变量}}` 填写对话框与追加/替换两种插入方式。
- `prompt_hub` agent 工具：`search` / `list` / `get` / `create` / `update` /
  `delete` 与分类的建、改名、删除、排序，与面板读写同一份库。
- 单文档存储 `$DSH_HOME/prompt-hub/data.json`：原子写入、写入前自动备份
  （保留最新 10 份）、损坏时从备份自动修复、`rev` 乐观并发防覆盖。
- 中英文 locale 元数据与插件管理器图标。
- Host 半边单元测试与浏览器半边冒烟测试，以及语法、清单、打包的 CI 检查。
