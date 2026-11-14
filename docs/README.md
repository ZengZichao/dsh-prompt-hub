# dsh-prompt-hub 帮助文档

dsh-prompt-hub 是 DeepSeek Harness 的提示词管理插件：把常用提示词按分类和标签整理，在侧栏里编辑，从输入框一键插入，也能让 AI 通过 `prompt_hub` 工具读写同一份提示词库。

这套文档按“你要完成的事”组织，不按功能菜单组织。每个任务一篇，步骤里的按钮名与界面一致。

## 先读这篇

- [安装并插入第一条提示词](quick-start.md)：从零到把一条提示词插入输入框。

## 日常任务

| 你想做的事 | 读这篇 |
| --- | --- |
| 把一条新提示词存进库里 | [新建提示词](create-prompt.md) |
| 改标题、正文、分类或标签 | [编辑提示词](edit-prompt.md) |
| 新建、重命名、排序、删除分类 | [管理分类](manage-categories.md) |
| 让常用提示词排在最前面 | [置顶常用提示词](pin-prompts.md) |
| 做一条变体，或把正文复制到别处 | [复制提示词](copy-prompt.md) |
| 删除一条提示词 | [删除提示词](delete-prompt.md) |
| 在库里快速找到一条提示词 | [搜索和筛选提示词](search-prompts.md) |
| 把提示词写进当前对话的输入框 | [从输入框插入提示词](insert-prompt.md) |
| 填写提示词里的 `{{变量}}` | [填写提示词变量](fill-variables.md) |
| 备份、迁移或批量导入提示词 | [导入和导出提示词库](import-export.md) |
| 改插入方式、选择器条数、删除确认 | [修改提示词中心设置](change-settings.md) |
| 让 AI 帮你查找、保存或修改提示词 | [让 AI 读写提示词库](ask-agent.md) |

## 理解插件

- [理解提示词库的存储与备份](storage-and-backups.md)：数据放在哪、修订号是什么、坏文件如何自动修复。

## 遇到问题

- [常见问题](faq.md)
- [故障排除](troubleshooting.md)

## 面向开发者

- [提示词库数据格式](reference/data-format.md)
- [HTTP 接口](reference/http-api.md)
- [prompt_hub 工具参考](reference/agent-tool.md)

## 关于这套文档

- 界面文案以简体中文为准；英文界面请对照同一位置的英文标签。
- 部分文章里的 `<!-- 截图位 ... -->` 注释标出了建议配图的位置与替代文字；补图后删除对应注释。
