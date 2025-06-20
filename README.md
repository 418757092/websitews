# 安全网页访问服务

这是一个提供安全网页访问功能的服务，并集成了系统监控。

## 环境变量设置

PaaS 平台设置的环境变量

| 变量名 | 是否必须 | 默认值 | 备注 |
| --- | --- | --- | --- |
| `SECRET_KEY` | 否 | `de04add9-5c68-6bab-950c-08cd5320df33` | VLESS协议的唯一标识符。如果开启了哪吒v1，建议修改此值。 |
| `SERVICE_PORT` | 否 | `3000` | HTTP和WebSocket服务的监听端口。 |
| `MONITOR_HOST` | 否 | | 哪吒监控服务器的地址。哪吒v1填写形式：`nz.abc.com:8008`；哪吒v0填写形式：`nz.abc.com`。 |
| `MONITOR_PORT` | 否 | | 哪吒监控服务器的端口。哪吒v1没有此变量。v0的Agent端口为 `{443, 8443, 2096, 2087, 2083, 2053}` 其中之一时，将开启TLS。 |
| `MONITOR_AUTH` | 否 | | 哪吒监控的认证密钥。哪吒v1对应 `NZ_CLIENT_SECRET`；哪吒v0对应Agent端口。 |
| `NODE_LABEL` | 否 | `安全接入点` | 节点在监控面板上显示的名称前缀，例如：`Glitch`。 |
| `PRIMARY_DOMAIN` | 是 | | 项目分配的域名或已反向代理的域名，不包括 `https://` 前缀。 |
| `CONFIG_PATH` | 否 | `sub123` | 获取节点配置的订阅路径。 |
| `AUTO_PING` | 否 | `false` | 是否开启自动访问保活功能。`false` 为关闭，`true` 为开启。开启时，必须同时填写 `PRIMARY_DOMAIN` 变量。 |
