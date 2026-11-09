import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class MonitorConfigProvider extends ConfigProvider {
    defaults = {
        serverMonitor: {
            enabled: true,
            /** 是否监控本机（默认关闭） */
            monitorLocal: false,
            /** 是否自动监控已打开的 SSH 标签页 */
            monitorSSHTabs: true,
            /** 刷新间隔（秒），最小 2 */
            refreshInterval: 5,
            /** CPU 采样窗口（秒），同时用于远端命令内 sleep 与本地两次采样间隔 */
            cpuSampleSeconds: 1,
            /** 远端磁盘查询的挂载点（用于告警阈值；展示为全量挂载点） */
            diskMount: '/',
            /** 阈值告警：百分比，0 表示关闭该告警 */
            thresholds: {
                cpu: 90,
                memory: 90,
                disk: 90,
            },
            /** 同一目标同类告警的冷却时间（秒） */
            alertCooldown: 60,
            /** 展示项勾选：控制卡片中各区块是否显示 */
            display: {
                publicIp: true,
                cpu: true,
                mem: true,
                swap: true,
                disk: true,
                load: true,
                procs: true,
                uptime: true,
            },
            /** 占用条颜色模式：auto = 按占用分级（绿/橙/红）；custom = 自定义单色 */
            barColorMode: 'auto',
            /** 自定义占用条颜色（barColorMode = custom 时生效） */
            barColorCustom: '#81c784',
        },
        hotkeys: {
            'open-server-monitor': null,
        },
    }
}
