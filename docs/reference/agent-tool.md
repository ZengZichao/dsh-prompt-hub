# prompt_hub 工具参考

Host 半边注册名为 `prompt_hub` 的 agent 工具，让模型读写与管理面板同一份提示词库。工具和 HTTP 路由共用 `readData` / `writeData` 和同一组操作，因此两边不会出现两套数据。

## 动作

| `action` | 参数 | 结果 |
| --- | --- | --- |
| `search` | `query?`、`category?`、`tag?`、`pinned?`、`limit?`、`offset?` | 匹配提示词的摘要，加分类列表和计数 |
| `list` | `category?`、`tag?`、`limit?`、`offset?` | 一页提示词摘要，带 `total`、`truncated` |
| `get` | `id` | 一条提示词的全文、标签、置顶状态和时间戳 |
| `create` | `title`、`content`、`category?`、`tags?`、`pinned?` | 新建提示词 |
| `update` | `id`、`title?`、`content?`、`category?`、`tags?`、`pinned?` | 只改传入的字段；`pinned` 可置顶或取消置顶 |
| `delete` | `id` | 删除提示词 |
| `create_category` | `name` | 新建分类 |
| `rename_category` | `id`、`name` | 重命名分类 |
| `delete_category` | `id` | 删除分类；其中的提示词移到未分类 |
| `reorder_category` | `id`、`direction`（`up` 或 `down`） | 移动分类并重排 `order` |

`action` 是必填参数；传入未知动作时返回 `{ ok: false, message }`，不抛错。

## 搜索与分页

- `search` 的 `query` 在标题、标签和正文里做不区分大小写的包含匹配。
- `search` 和 `list` 的 `tag` 过滤也是包含匹配，不区分大小写；面板里的标签筛选是精确匹配。
- `category` 可传分类 id 或精确分类名。作为过滤条件时，未知名称返回空结果；作为 `create` / `update` 的写入目标时，未知名称报错。
- `search` 默认返回 20 条，`list` 默认 50 条，上限都是 50 条；`offset` 跳过前面的匹配。
- 摘要含 `id`、`title`、`category`、`tags`、`pinned`、`updatedAt`，以及正文压平后的前 160 个字符。
- 返回带 `total` 和 `truncated`；结果被截断时，模型应缩小查询或增大 `limit` / `offset`。
- `search` 和 `list` 都返回分类列表，含每个分类的 `id`、`name`、`count`。

## 写入语义

- `create` 要求非空 `title` 和非空 `content`；`category` 可省略，省略时进未分类。
- `update` 只改传入字段；`title` 或 `content` 被改成空值会报错。
- 分类名重复不会被拒绝。按名称查找时取数组中第一个匹配的分类，建议调用方保持名称唯一。
- `delete_category` 不删除提示词，只把它们的 `categoryId` 清空。
- `reorder_category` 越界时报错（已在顶部或底部），成功后整组 `order` 重排为 0 到 n-1。
- 所有工具写入都在 Host 内串行执行，并带 `expectedRev` 提交；两条并发写入不会丢更新。
- 未知 id、未知分类等错误会以工具调用失败的形式返回原因，而不是静默无操作。

## 返回与渲染

工具输出是结构化对象（`ok`、`action`、`prompts`、`prompt`、`category`、`total` 等），同时提供文本渲染：

- `search` / `list`：分类计数行，加每条提示词的 `- 📌 标题 [分类] #标签 (id: …)` 与 160 字预览；有截断时追加剩余条数。
- `get`：`# 标题 [分类]`、`Tags: #标签` 和完整正文。
- `create` / `update`：`Saved prompt "标题" (id: …)`。
- `delete` / `create_category` / `rename_category` / `delete_category` / `reorder_category`：对应的保存、删除或移动说明。

## 边界

- 文档结构与数量限制与 [提示词库数据格式](data-format.md) 一致：5,000 条提示词、500 个分类、正文 100,000 字符、标题 200 字符、20 个标签、每个标签 40 字符。
- 超过限制时写入失败并返回原因。

## 相关文档

- [提示词库数据格式](data-format.md)
- [HTTP 接口](http-api.md)
- [让 AI 读写提示词库](../ask-agent.md)
