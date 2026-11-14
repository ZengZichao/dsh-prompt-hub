# 提示词库数据格式

dsh-prompt-hub 把整个库存在一个 JSON 文档里，面板、输入框选择器和 AI 工具共用。本页面向维护者和集成方。

## 文件位置

`$DSH_HOME/prompt-hub/data.json`

`$DSH_HOME` 的解析顺序：`dshHomePath` 服务 → `DSH_HOME` 环境变量 → `~/.dsh`。

## 结构

```json
{
  "version": 1,
  "rev": 12,
  "categories": [{ "id": "c_xxx", "name": "通用", "order": 0 }],
  "prompts": [{
    "id": "p_xxx",
    "categoryId": "c_xxx",
    "title": "标题",
    "content": "内容…",
    "tags": ["review"],
    "pinned": false,
    "createdAt": 0,
    "updatedAt": 0
  }]
}
```

## 字段

### 顶层

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | number | 文档版本，缺失时按 `1` |
| `rev` | number | 修订号，缺失时按 `0`；每次成功写入加一 |
| `categories` | array | 分类列表，最多 500 个 |
| `prompts` | array | 提示词列表，最多 5,000 条 |

### 分类

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 必填，最长 128 字符 |
| `name` | string | 必填，最长 200 字符 |
| `order` | number | 排序位置，缺失时按当前数组下标 |

### 提示词

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 必填，最长 128 字符 |
| `categoryId` | string | 所属分类 id；空字符串表示未分类 |
| `title` | string | 必填，最长 200 字符 |
| `content` | string | 正文，最多 100,000 字符 |
| `tags` | string[] | 最多 20 个，每个最长 40 字符 |
| `pinned` | boolean | 仅 `true` 视为置顶 |
| `createdAt` | number | 创建时间，毫秒时间戳 |
| `updatedAt` | number | 更新时间，毫秒时间戳 |

## 校验与归一化

每次写入前，Host 会校验并归一化整份文档：

- 顶层必须是对象；`categories`、`prompts` 必须是数组，否则整份文档被拒绝。
- 分类超过 500 个、提示词超过 5,000 条，整份文档被拒绝。
- 单条正文超过 100,000 字符，整份文档被拒绝。
- 单条格式错误（缺 `id`、缺 `name`、缺 `title`、`id` 重复）会被丢弃，不影响其余条目。
- 标签会去掉首尾空格；空标签和非字符串被忽略；超过 40 字符的标签被丢弃；只有大小写不同的标签视为重复；最多保留 20 个。
- 标题、分类名和 id 会被截断到各自上限。
- 未知字段在顶层、分类和提示词三层都原样保留，旧版本打开新版本写入的库不会丢字段。
- `createdAt`、`updatedAt` 缺失时，分别补当前时间和 `createdAt`。

## 写入

- 写入按顺序串行执行，后一次保存不会越过前一次。
- 调用方可以带 `expectedRev`：与文件当前 `rev` 不一致时拒绝写入，返回冲突和当前文档。
- 新 `rev` 取 `max(当前 rev, 提交文档的 rev) + 1`。
- 写入前尝试把当前文件复制到 `backups/`，然后写临时文件并重命名覆盖目标文件。

## 备份

- 目录：`$DSH_HOME/prompt-hub/backups/`
- 文件名：`data.<时间戳>.<随机后缀>.json`
- 只保留最新 10 份，按文件名排序裁剪。
- 读取时若主文件解析失败，从最新到最旧尝试备份，第一份可读的会归一化后写回主文件。

## 相关文档

- [理解提示词库的存储与备份](../storage-and-backups.md)
- [HTTP 接口](http-api.md)
- [prompt_hub 工具参考](agent-tool.md)
