# dsh-prompt-hub

DeepSeek Harness 的提示词管理插件：把常用提示词按分类和标签整理，在侧栏里编辑，从输入框一键插入，也能让 AI 通过 `prompt_hub` 工具读写同一份提示词库。

提示词库保存在本机 `$DSH_HOME/prompt-hub/data.json`。每次写入自动留备份，并用修订号防止面板与 AI 互相覆盖。当前版本 1.2.0。

## 安装

要求：

- DeepSeek Harness `>=0.2.2-rc.3 <0.3.0`
- Node.js `>=24.9.0`

在 DeepSeek Harness 的插件管理器中从本目录安装 bundle（安装接口为 `install_bundle`）。插件不发布到 npm。安装完成后，左侧面板列表出现 **提示词中心**（英文界面 **Prompt hub**）。

第一次使用请按 [安装并插入第一条提示词](docs/quick-start.md) 走一遍。

## 文档

完整帮助文档见 [docs/](docs/README.md)。

| 你想做的事 | 文档 |
| --- | --- |
| 安装并完成第一次插入 | [安装并插入第一条提示词](docs/quick-start.md) |
| 新建、编辑、删除提示词 | [新建提示词](docs/create-prompt.md)、[编辑提示词](docs/edit-prompt.md)、[删除提示词](docs/delete-prompt.md) |
| 管理分类、置顶、复制 | [管理分类](docs/manage-categories.md)、[置顶常用提示词](docs/pin-prompts.md)、[复制提示词](docs/copy-prompt.md) |
| 搜索和筛选 | [搜索和筛选提示词](docs/search-prompts.md) |
| 插入到输入框、填写变量 | [从输入框插入提示词](docs/insert-prompt.md)、[填写提示词变量](docs/fill-variables.md) |
| 备份、迁移、批量导入 | [导入和导出提示词库](docs/import-export.md) |
| 调整设置 | [修改提示词中心设置](docs/change-settings.md) |
| 让 AI 读写提示词库 | [让 AI 读写提示词库](docs/ask-agent.md) |
| 数据存放与恢复 | [理解提示词库的存储与备份](docs/storage-and-backups.md) |
| 答疑与排障 | [常见问题](docs/faq.md)、[故障排除](docs/troubleshooting.md) |

开发者参考：[数据格式](docs/reference/data-format.md)、[HTTP 接口](docs/reference/http-api.md)、[prompt_hub 工具参考](docs/reference/agent-tool.md)。

## 兼容性

- **DSH 0.2.2-rc.3 至 0.2.x**：`package.json` 的 `engines.dsh` 声明为 `>=0.2.2-rc.3 <0.3.0`。
- **Node.js 24.9+**：与 DSH 0.2.2 的运行时要求一致。
- 浏览器半边在 `inject` 中声明 `layout`，用于选择器里 **管理提示词** 跳转到主面板；缺少该声明时点击会报 `cannot get property "layout" without inject`。
- Host 通过 0.2.2 的 `dshHomePath` 服务解析 `$DSH_HOME`；服务缺失时回退到环境变量 `DSH_HOME`，最后回退到 `~/.dsh`。

## 目录

| 文件 | 职责 |
| --- | --- |
| `index.js` | Host 半边：校验、原子写入、备份、`/dsh-prompt-hub/data` 路由、`prompt_hub` 工具 |
| `client.js` | 浏览器半边：侧栏入口、管理面板、输入框选择器、对话框与样式 |
| `cordis.patch.yml` | bundle patch：把本包的主入口挂成 Host 半边 |
| `locale/en.json`、`locale/zh.json` | 插件管理器里的标题与说明 |
| `icon.svg` | 插件管理器图标 |
| `test/host.test.mjs` | Host 半边测试 |
| `test/client.test.mjs` | 浏览器半边冒烟测试 |
| `docs/` | 帮助文档 |
| `CHANGELOG.md` | 版本变更记录 |
| `LICENSE` | MIT 许可证 |

## 开发

```bash
npm test
```

Host 半边测试为每个用例创建独立的临时 `$DSH_HOME`，不会碰到真实提示词库，跑完自动清理；浏览器半边为模块契约的冒烟测试，不需要 DOM。变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

MIT
