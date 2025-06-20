const os = require('os');
const http = require('http');
const fs = require('fs');
const path = require('path'); // 新增：引入 path 模块
const axios = require('axios');
const net = require('net');
const { Buffer } = require('buffer');
const { exec, execSync } = require('child_process');
const { WebSocket, createWebSocketStream } = require('ws');

// 配置变量，可通过环境变量设置
const SECRET_KEY = process.env.SECRET_KEY || '161fc0b2-cfa3-4053-8d51-20aeee66c2dd'; // 用于握手的唯一标识符
const MONITOR_HOST = process.env.MONITOR_HOST || 'kcystufkiiuc.ap-northeast-1.clawcloudrun.com:443';       // 哪吒v1: nz.abc.com:8008, 哪吒v0: nz.abc.com
const MONITOR_PORT = process.env.MONITOR_PORT || '';           // 哪吒v1没有此变量. v0的agent端口为{443,8443,2096,2087,2083,2053}其中之一时开启tls
const MONITOR_AUTH = process.env.MONITOR_AUTH || '2h1TEmM79EPLBctbNrd014hWlkZ3Sr26';             // 哪吒v1的NZ_CLIENT_SECRET或v0的agent端口
const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || ''; // VLESS配置的域名，建议填写已反代的域名
const AUTO_PING = process.env.AUTO_PING || false;      // 是否开启自动访问保活，false为关闭,true为开启，需同时填写PRIMARY_DOMAIN变量
const RELAY_PATH = process.env.RELAY_PATH || SECRET_KEY.slice(0, 8);     // 节点路径，默认获取SECRET_KEY前8位
const CONFIG_PATH = process.env.CONFIG_PATH || 'sub123';            // 获取节点的订阅路径
const NODE_LABEL = process.env.NODE_LABEL || 'Vl';                    // 节点显示名称
const SERVICE_PORT = process.env.PORT || 3000;                     // HTTP和WebSocket服务端口

let detectedISP = '';
// 获取ISP信息用于节点标签
const retrieveISP = async () => {
  try {
    const response = await axios.get('https://speed.cloudflare.com/meta');
    const geoData = response.data;
    detectedISP = `${geoData.country}-${geoData.asOrganization}`.replace(/ /g, '_');
  } catch (e) {
    detectedISP = '未知提供商';
  }
}
retrieveISP(); // 启动时执行

const webService = http.createServer((req, res) => {
  // 处理根路径请求，返回 index.html 内容 
  if (req.url === '/') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  } else if (req.url === `/${CONFIG_PATH}`) {
    // 生成 VLESS 配置 URL
    const vlessConfigURL = `vless://${SECRET_KEY}@skk.moe:443?encryption=none&security=tls&sni=${PRIMARY_DOMAIN}&fp=chrome&type=ws&host=${PRIMARY_DOMAIN}&path=%2F${RELAY_PATH}#${NODE_LABEL}-${detectedISP}`;
    const encodedContent = Buffer.from(vlessConfigURL).toString('base64');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(encodedContent + '\n');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('未找到资源\n');
  }
});

const wsServer = new WebSocket.Server({ server: webService });
const normalizedUUID = SECRET_KEY.replace(/-/g, ""); // 移除UUID中的连字符进行比较
wsServer.on('connection', clientSocket => {
  // console.log("新客户端已连接");
  clientSocket.once('message', msgBuffer => {
    const [protocolVersion] = msgBuffer;
    const clientID = msgBuffer.slice(1, 17);
    // 验证UUID
    if (!clientID.every((val, idx) => val == parseInt(normalizedUUID.substr(idx * 2, 2), 16))) return;

    let offset = msgBuffer.slice(17, 18).readUInt8() + 19;
    const targetPort = msgBuffer.slice(offset, offset += 2).readUInt16BE(0);
    const addressType = msgBuffer.slice(offset, offset += 1).readUInt8();
    let targetHost;

    // 根据地址类型确定目标主机
    if (addressType == 1) { // IPv4
      targetHost = msgBuffer.slice(offset, offset += 4).join('.');
    } else if (addressType == 2) { // 域名
      targetHost = new TextDecoder().decode(msgBuffer.slice(offset + 1, offset += 1 + msgBuffer.slice(offset, offset + 1).readUInt8()));
    } else if (addressType == 3) { // IPv6
      targetHost = msgBuffer.slice(offset, offset += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':');
    } else {
      return; // 未知地址类型
    }

    // console.log(`代理连接到 ${targetHost}:${targetPort}`);
    clientSocket.send(new Uint8Array([protocolVersion, 0])); // 发送握手成功响应
    const clientDuplexStream = createWebSocketStream(clientSocket);

    // 连接到目标
    net.connect({ host: targetHost, port: targetPort }, function() {
      this.write(msgBuffer.slice(offset)); // 写入客户端剩余数据
      clientDuplexStream.on('error', () => {}).pipe(this).on('error', () => {}).pipe(clientDuplexStream);
    }).on('error', () => {}); // 处理连接错误
  }).on('error', () => {}); // 处理消息错误
});

// 根据架构和版本确定哪吒探针的下载URL
const getAgentDownloadUrl = () => {
  const systemArch = os.arch();
  if (systemArch === 'arm' || systemArch === 'arm64' || systemArch === 'aarch64') {
    return MONITOR_PORT ? 'https://arm64.ssss.nyc.mn/agent' : 'https://arm64.ssss.nyc.mn/v1';
  } else {
    return MONITOR_PORT ? 'https://amd64.ssss.nyc.mn/agent' : 'https://amd64.ssss.nyc.mn/v1';
  }
};

// 下载哪吒探针可执行文件
const downloadAgent = async () => {
  if (!MONITOR_HOST && !MONITOR_AUTH) {
    // console.log('监控变量未设置。跳过探针下载。');
    return;
  }

  try {
    const downloadUrl = getAgentDownloadUrl();
    // console.log(`开始从 ${downloadUrl} 下载探针`);
    const agentResponse = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream'
    });

    const fileWriter = fs.createWriteStream('syssvc'); // 更名后的可执行文件
    agentResponse.data.pipe(fileWriter);

    return new Promise((resolve, reject) => {
      fileWriter.on('finish', () => {
        console.log('syssvc 下载完成');
        exec('chmod +x syssvc', (err) => { // 赋予执行权限
          if (err) reject(err);
          resolve();
        });
      });
      fileWriter.on('error', reject);
    });
  } catch (err) {
    throw err;
  }
};

// 运行哪吒探针
const launchMonitorAgent = async () => {
  try {
    const agentStatus = execSync('ps aux | grep -v "grep" | grep "./[s]yssvc"', { encoding: 'utf-8' });
    if (agentStatus.trim() !== '') {
      console.log('syssvc 进程已活跃，跳过启动...');
      return;
    }
  } catch (e) {
    // 进程未找到，继续启动探针
  }

  await downloadAgent(); // 确保探针已下载

  let agentCommand = '';
  const tlsEnabledPorts = ['443', '8443', '2096', '2087', '2083', '2053'];

  if (MONITOR_HOST && MONITOR_PORT && MONITOR_AUTH) {
    // 哪吒v0配置
    const NEZHA_TLS_FLAG = tlsEnabledPorts.includes(MONITOR_PORT) ? '--tls' : '';
    agentCommand = `setsid nohup ./syssvc -s ${MONITOR_HOST}:${MONITOR_PORT} -p ${MONITOR_AUTH} ${NEZHA_TLS_FLAG} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`;
  } else if (MONITOR_HOST && MONITOR_AUTH) {
    // 哪吒v1配置
    if (!MONITOR_PORT) {
      const detectedPort = MONITOR_HOST.includes(':') ? MONITOR_HOST.split(':').pop() : '';
      const USE_TLS_V1 = tlsEnabledPorts.includes(detectedPort) ? 'true' : 'false';
      const monitorConfigYaml = `client_secret: ${MONITOR_AUTH}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 1800
report_delay: 1
server: ${MONITOR_HOST}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${USE_TLS_V1}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${SECRET_KEY}`;

      fs.writeFileSync('monitor_config.yaml', monitorConfigYaml); // 更名后的配置文件
    }
    agentCommand = `setsid nohup ./syssvc -c monitor_config.yaml >/dev/null 2>&1 &`;
  } else {
    console.log('监控变量不完整，跳过探针启动');
    return;
  }

  try {
    exec(agentCommand, { shell: '/bin/bash' }, (err) => {
      if (err) console.error('syssvc 执行错误:', err);
      else console.log('syssvc 网页服务开启');
    });
  } catch (error) {
    console.error(`启动 syssvc 错误: ${error}`);
  }
};

// 添加自动访问任务以保持活跃
async function registerAutoAccess() {
  if (!AUTO_PING) return;

  if (!PRIMARY_DOMAIN) {
    // console.log('主域名未设置。跳过自动访问注册。');
    return;
  }
  const fullAccessURL = `https://${PRIMARY_DOMAIN}/${CONFIG_PATH}`; // 使用新的配置路径
  try {
    const accessResponse = await axios.post("https://utility.external-service.net/register-url", { // 保持不变的服务URL
      url: fullAccessURL
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('自动访问任务已成功注册');
  } catch (error) {
    // console.error('自动访问注册期间出错:', error.message);
  }
}

// 清理已下载的文件
const cleanupFiles = () => {
  fs.unlink('syssvc', () => {}); // 新的可执行文件名称
  fs.unlink('monitor_config.yaml', () => {}); // 新的配置文件名称
};

webService.listen(SERVICE_PORT, () => {
  launchMonitorAgent(); // 启动监控探针
  setTimeout(() => {
    cleanupFiles(); // 延迟后清理文件
  }, 180000); // 180 秒延迟
  registerAutoAccess(); // 注册自动访问任务
  console.log(`网页访问服务运行在端口 ${SERVICE_PORT}`);
});