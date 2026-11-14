# HTTP 接口

Host 半边注册一个精确路由，浏览器半边的管理面板和输入框选择器都通过它读写提示词库。

## 路由

| 方法 | 路径 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| `GET` | `/dsh-prompt-hub/data` | — | `{ ok: true, data, rev }` |
| `POST` | `/dsh-prompt-hub/data` | `{ data, expectedRev? }` 或直接传文档 | `{ ok: true, data, rev }` |

`GET` 返回当前文档和 `rev`。`POST` 归一化、递增 `rev`、写盘后返回新文档。

## 状态码

| 状态 | `code` | 场景 |
| --- | --- | --- |
| 200 | — | 读取或写入成功 |
| 400 | `invalid_data` | 文档结构非法、正文超限、请求体不是合法 JSON 或超过 2 MB；读取时无法解析且没有可用备份 |
| 403 | `untrusted_origin` | `Origin` 既不是同源，也不是 `dsh-app://app` |
| 405 | — | 方法不是 `GET`/`POST`；响应带 `Allow: GET, POST` |
| 409 | `conflict` | `expectedRev` 与当前 `rev` 不一致；响应带最新 `data` 和 `rev` |

JSON 错误响应形状：`{ ok: false, code, error }`；冲突响应额外带 `data` 和 `rev`。

## 来源校验

- 没有 `Origin` 头（非浏览器调用）视为可信。
- `Origin: dsh-app://app` 视为可信。
- 其他情况下，`Origin` 的 host 必须与请求的 `Host` 相同。

不满足时返回 403，不读取也不写入。

## 请求体

- 最大 2 MB；超过时返回 400。
- 空请求体按 `{}` 处理。注意：`{}` 会被归一化为空库并写回，调用方应始终传完整文档。
- 若请求体是对象且含对象类型的 `data`，取 `data` 作为文档；否则整个请求体当作文档。
- `expectedRev` 仅在为有限数字时生效。

## 并发语义

`POST` 在 Host 内串行执行。带 `expectedRev` 的写入是 compare-and-swap：读到的版本已被别人改过时返回 409，调用方应重新读取后再写，而不是重试同一份旧文档。

## 安全与缓存

- JSON 响应带 `cache-control: no-store`，响应类型为 `application/json; charset=utf-8`。
- 路由只接受同源或桌面文档来源，防止其他网页跨站改写提示词库。

## 相关文档

- [提示词库数据格式](data-format.md)
- [prompt_hub 工具参考](agent-tool.md)
