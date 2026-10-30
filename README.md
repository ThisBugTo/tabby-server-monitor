# tabby-server-monitor

Tabby 终端服务器状态监控插件：在 Tabby 中实时查看**本机**与所有已打开 **SSH 连接**的 CPU、内存（含交换分区）、GPU、磁盘和负载，支持阈值告警。

![icon](https://img.shields.io/badge/Tabby-%3E%3D1.0.200-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## 功能

- **监控面板标签页**：卡片式展示每个监控目标
  - CPU 利用率（颜色进度条：<70% 绿 / 70~90% 橙 / ≥90% 红）
  - 内存 已用/总量、交换分区
  - GPU：利用率、显存已用/总量、温度、风扇、功耗（NVIDIA，多卡支持）
  - 磁盘 已用/总量与使用率（默认 `/`，可配置挂载点）
  - 1/5/15 分钟负载、主机名、开机时长、CPU 核数
- **SSH 自动发现**：自动监控当前打开的所有 SSH 标签页（按 `用户@主机:端口` 去重，复用同一会话的多个标签只计一次）
- **本机监控**：基于 Node `os` 模块 + `df` + `nvidia-smi`（可选开关）
- **阈值告警**：CPU / 内存 / GPU / 磁盘任一超过阈值时弹出通知，带冷却时间
- **配置页**：设置 → 服务器监控；可绑定快捷键「打开服务器状态监控」

## 工作原理

- 远程采集通过 russh 的 **exec 通道**执行一条只读命令（不占用、不干扰你的终端交互会话）：

  ```
  hostname; head -1 /proc/stat; sleep 1; head -1 /proc/stat;   # 两次采样算 CPU
  cat /proc/meminfo; cat /proc/loadavg; cat /proc/uptime;       # 内存/负载/开机时长
  df -kP '/';                                                   # 磁盘
  nvidia-smi --query-gpu=... --format=csv,noheader,nounits      # GPU（无则跳过）
  ```

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

将整个包目录放到 Tabby 用户插件目录下的 `node_modules` 中（目录名必须为 `tabby-server-monitor`）：

| 平台 | 插件目录 |
| ---- | ---- |
| macOS | `~/Library/Application Support/tabby/plugins/node_modules/` |
| Windows | `%APPDATA%\tabby\plugins\node_modules\` |
| Linux | `~/.config/tabby/plugins/node_modules/` |

```bash
# macOS 示例
cp -r tabby-server-monitor ~/Library/Application\ Support/tabby/plugins/node_modules/
```

重启 Tabby 后生效（设置 → 插件中可确认已加载）。

## 使用

- 点击窗口**右上工具栏**的柱状图按钮，或在命令面板中执行「服务器状态监控」，打开监控面板。
- 在「设置 → 快捷键」中为 `打开服务器状态监控` 绑定快捷键。
- 打开任意 SSH 连接后，对应服务器卡片会自动出现。
- 在「设置 → 服务器监控」中调整刷新间隔、采样窗口、告警阈值等。

## 配置项（config.yaml → serverMonitor）

| 配置 | 默认值 | 说明 |
| ---- | ---- | ---- |
| `enabled` | `true` | 总开关 |
| `monitorLocal` | `true` | 是否监控本机 |
| `monitorSSHTabs` | `true` | 是否自动监控已打开的 SSH 标签页 |
| `refreshInterval` | `5` | 刷新间隔（秒，最小 2） |
| `cpuSampleSeconds` | `1` | CPU 采样窗口（秒） |
| `diskMount` | `/` | 远端磁盘查询的挂载点 |
| `thresholds.cpu/memory/gpu/disk` | `90` | 告警阈值（%，`0` 关闭） |
| `alertCooldown` | `60` | 同一目标同类告警冷却（秒） |

## 兼容性说明

- 目标 Tabby 版本：**1.0.x**（基于 Angular 15 插件体系，即 Tabby ≥ 1.0.200 的 NgModule 插件格式）。
- SSH 远端需为 **Linux**（可读 `/proc`）；GPU 需安装 NVIDIA 驱动（`nvidia-smi` 在 PATH 中），无 GPU 时自动跳过。
- 本机 GPU 监控同样依赖 `nvidia-smi`（macOS 通常无）；本机磁盘监控支持 macOS/Linux。
- Web 版 Tabby 不支持 SSH/本机命令采集，仅保留基础信息。

## License

MIT
