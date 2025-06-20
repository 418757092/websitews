环境变量	说明
SECRET_KEY	用于VLESS协议握手的唯一标识符。如果未设置，默认为 '5efabea4-f6d4-91fd-b8f0-17e004c89c60'。
MONITOR_HOST	哪吒探针服务器的地址。对于哪吒v1，形式为 nz.abc.com:8008；对于哪吒v0，形式为 nz.abc.com。如果未设置，默认为空字符串。
MONITOR_PORT	哪吒探针服务器的端口。哪吒v1没有此变量。对于哪吒v0，当端口为 443, 8443, 2096, 2087, 2083, 2053 其中之一时会开启TLS。如果未设置，默认为空字符串。
MONITOR_AUTH	哪吒探针的认证密钥。对于哪吒v1，这是 NZ_CLIENT_SECRET；对于哪吒v0，这是agent端口。如果未设置，默认为空字符串。
PRIMARY_DOMAIN	用于VLESS配置的域名，建议填写已反向代理的域名。如果未设置，默认为 'example.com'。
AUTO_PING	是否开启自动访问保活功能。false 为关闭，true 为开启。开启时，PRIMARY_DOMAIN 变量必须设置。如果未设置，默认为 false。
RELAY_PATH	节点路径，默认获取 SECRET_KEY 的前8位。如果未设置，默认为 SECRET_KEY 的前8位。
CONFIG_PATH	获取节点的订阅路径。如果未设置，默认为 'sub123'。
NODE_LABEL	节点显示名称。如果未设置，默认为 '安全接入点'。
SERVICE_PORT	HTTP和WebSocket服务监听的端口。如果未设置，默认为 3000。
