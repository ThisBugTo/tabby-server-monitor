# tabby-server-monitor

Tabby 终端服务器状态监控插件：在 Tabby 中实时查看所有已打开 **SSH 连接**的公网 IP、CPU、内存（含交换分区）、磁盘（全挂载点）、负载与进程 Top5，支持阈值告警与展示项自定义。

![icon](https://img.shields.io/badge/Tabby-%3E%3D1.0.200-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## 功能

- **左分屏监控面板**：以 Tabby 原生分屏插入到 SSH 会话**左侧**，不遮挡终端（可拖中线调宽窄）；打开/恢复 SSH 标签时自动出现，工具栏按钮或快捷键可开关，无 SSH 会话时退回独立监控标签页
- **监控卡片**：数据未就绪时先显示骨架屏，磁盘等快数据约 1 秒内回填，其余分段补齐
  - 公网 IP（IPv4 优先，低频采集，约 15 分钟一次）
  - CPU 利用率（颜色进度条：<70% 绿 / 70~90% 橙 / ≥90% 红，可在设置中改为自定义颜色）
  - 内存 已用/总量、交换分区
  - 磁盘 全部挂载点的已用/总量与使用率（df -h 式，独立虚线分区）
  - 磁盘总体容量行（虚线上方，合计真实挂载点，排除 tmpfs 等易失分区并按设备去重）
  - 进程 Top5：CPU / 内存占用倒序各 5 条（约 30 秒采集一次）
  - 1/5/15 分钟负载、主机名、开机时长、CPU 核数
- **展示设置**：各区块可在设置中勾选显示/隐藏，占用条颜色可自定义
- **SSH 自动发现**：自动监控当前打开的所有 SSH 标签页（按 `用户@主机:端口` 去重，复用同一会话的多个标签只计一次）
- **本机监控**：基于 Node `os` 模块 + `df`（可选开关，默认关闭）
- **阈值告警**：CPU / 内存 / 磁盘任一超过阈值时弹出通知，带冷却时间
- **配置页**：设置 → 服务器监控；可绑定快捷键「打开服务器状态监控」

## 工作原理

- 远程采集通过 russh 的 **exec 通道**分三阶段执行只读命令（不占用、不干扰你的终端交互会话），先查到的先回填：

  ```
  阶段1 快数据：uname/hostname//proc（stat1）/meminfo/loadavg/uptime + df -kP   # 磁盘等立即展示
  阶段2 CPU：本地等待采样窗口后读第二次 /proc/stat（macOS 用远端 top -l 2）      # 补齐 CPU 占用
  阶段3 低频：公网 IP（IPv4 优先）+ ps 进程 Top5                                # 仅 TTL 到期执行
  ```

- 任一阶段失败不影响其它阶段已回填的数据；公网 IP 约 15 分钟采集一次、进程 Top5 约 30 秒一次，均不随刷新间隔频繁执行，且在后台执行不阻塞数据回填，避免影响系统性能。
- 调度：每轮刷新结束按最新状态重排下一轮（连接中 1s、等待首采 0.5s、其余按刷新间隔），标签恢复/连接就绪会立即重排，避免重启后首填等待长间隔；SSH 通道打开/激活/执行全链路有超时兜底，避免刷新循环挂起。
- Tabby 重启恢复分屏后自动校正比例（修复恢复数据错位导致的终端被挤压/留白）。

- 全部为只读操作，无任何写入；默认每 5 秒执行一次（可配置）。
- CPU 采用 `/proc/stat` 两次采样差值计算，不依赖 `top` 输出格式，不受 locale 影响。
- 输出用 `#SM#XXX` 标记分段解析，解析失败（如远端非 Linux）时面板显示错误信息。

## 安装

### 开发构建

```bash
npm install
npm run build     # 产物在 dist/index.js
```

### 安装到 Tabby

Tabby 按**目录**扫描插件（读取 `node_modules/*/package.json` 中 `keywords` 含 `tabby-plugin` 的包），
**不是**识别一个裸 `dist` 文件夹。必须把插件作为完整包放到插件目录下，目录名必须为 `tabby-server-monitor`。

下表为 Tabby **插件根目录**（`plugins`，注意是根目录，**不是**其下的 `node_modules`）：

| 平台 | 插件目录 |
| ---- | ---- |
| macOS | `~/Library/Application Support/tabby/plugins/` |
| Windows | `%APPDATA%\tabby\plugins\` |
| Linux | `~/.config/tabby/plugins/` |

**方式一（推荐，长期使用）：登记为 `file:` 依赖**

手工拷贝进 `node_modules` 的插件未记入 `package.json`，Tabby 更新其他插件时 npm 会把它当“多余包”清空。登记为依赖后 npm 操作会永久保留；且插件目录直接链接到代码仓库——仓库内 `npm run build` 后重启 Tabby 即生效，无需再拷贝：

```bash
# 1) 获取代码到任意位置（仓库已包含构建好的 dist/index.js，仅使用时无需安装依赖）
git clone https://github.com/ThisBugTo/tabby-server-monitor.git <你的仓库路径>

# 2) 在 Tabby 插件根目录登记为依赖（macOS 示例，其他平台见上表）
#    <你的仓库路径> 换成上面第 1 步克隆到的绝对路径
cd ~/Library/Application\ Support/tabby/plugins
npm install "file:<你的仓库路径>" --no-audit --no-fund

# 3) 重启 Tabby（设置 → 插件中可确认已加载）
```

换其他电脑重复此操作时，只需把两处 `<你的仓库路径>` 换成新机器上的实际位置。

**方式二（临时试用）：选择性拷贝**

拷贝后的目标层级（`package.json` 必需，`README.md` 建议一并拷贝）：

```text
<插件目录>/node_modules/
└── tabby-server-monitor/        # 目录名必须与包名一致
    ├── package.json             # 必需：tabby-plugin 关键字 + main=dist/index.js，Tabby 据此识别
    ├── README.md                # 建议一并拷贝
    └── dist/
        └── index.js             # npm run build 的产物，package.json 的 main 指向这里
```

> 只把 `dist/` 拷进插件目录**不生效**（缺少 `package.json`，Tabby 扫不到）。
> `node_modules/` 无需拷贝；手动安装也不需要改插件根目录的 `package.json`。

构建后在项目目录执行（按平台二选一）：

```powershell
# Windows (PowerShell)
$dest = "$env:APPDATA\tabby\plugins\node_modules\tabby-server-monitor"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item package.json, README.md $dest
Copy-Item dist "$dest\dist" -Recurse -Force
```

```bash
# macOS（Linux 将路径换成 ~/.config/tabby/plugins/node_modules/）
dest="$HOME/Library/Application Support/tabby/plugins/node_modules/tabby-server-monitor"
mkdir -p "$dest"
cp package.json README.md "$dest/"
cp -r dist "$dest/"
```

完全退出并重启 Tabby 后生效（设置 → 插件中可确认已加载）。

⚠️ 方式二未登记依赖，Tabby 更新其他插件后会被 npm 清空，需重新拷贝；长期使用请用方式一。

## 使用

- 打开任意 SSH 连接（或重启 Tabby 恢复会话）后，监控面板**自动出现在该会话左侧**；再次点击工具栏按钮或面板上的 ✕ 可关闭。
- 也可点击窗口**右上工具栏**的柱状图按钮，或在命令面板中执行「服务器状态监控」手动开关；在「设置 → 快捷键」中为 `打开服务器状态监控` 绑定快捷键。
- 首次连接时面板先显示骨架屏（提示语会区分“会话建立中”与“首次采集进行中”），快数据约 1 秒内回填。
- 在「设置 → 服务器监控」中调整刷新间隔、采样窗口、告警阈值、展示项与占用条颜色等。

## 配置项（config.yaml → serverMonitor）

| 配置 | 默认值 | 说明 |
| ---- | ---- | ---- |
| `enabled` | `true` | 总开关 |
| `monitorLocal` | `false` | 是否监控本机 |
| `monitorSSHTabs` | `true` | 是否自动监控已打开的 SSH 标签页 |
| `refreshInterval` | `5` | 刷新间隔（秒，最小 2） |
| `cpuSampleSeconds` | `1` | CPU 采样窗口（秒） |
| `diskMount` | `/` | 告警阈值所用挂载点（展示为全量挂载点） |
| `thresholds.cpu/memory/disk` | `90` | 告警阈值（%，`0` 关闭） |
| `alertCooldown` | `60` | 同一目标同类告警冷却（秒） |
| `display.*` | `true` | 各区块展示开关（publicIp/cpu/mem/swap/disk/load/procs/uptime） |
| `barColorMode` / `barColorCustom` | `auto` / `#81c784` | 占用条颜色：自动分级或自定义单色 |

## 兼容性说明

- 目标 Tabby 版本：**1.0.x**（基于 Angular 15 插件体系，即 Tabby ≥ 1.0.200 的 NgModule 插件格式）。
- SSH 远端需为 **Linux**（可读 `/proc`）或 **macOS**；不采集 GPU 数据。
- 本机磁盘监控支持 macOS/Linux。
- Web 版 Tabby 不支持 SSH/本机命令采集，仅保留基础信息。

## License

MIT
