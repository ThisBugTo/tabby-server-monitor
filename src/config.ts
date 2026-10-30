import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class MonitorConfigProvider extends ConfigProvider {
    defaults = {
        serverMonitor: {
            enabled: true,
            /** 是否监控本机 */
            monitorLocal: true,
            /** 是否自动监控已打开的 SSH 标签页 */
            monitorSSHTabs: true,
            /** 刷新间隔（秒），最小 2 */
            refreshInterval: 5,
            /** CPU 采样窗口（秒），同时用于远端命令内 sleep 与本地两次采样间隔 */
            cpuSampleSeconds: 1,
            /** 远端磁盘查询的挂载点 */
            diskMount: '/',
            /** 阈值告警：百分比，0 表示关闭该告警 */
            thresholds: {
                cpu: 90,
                memory: 90,
                gpu: 90,
                disk: 90,
            },
            /** 同一目标同类告警的冷却时间（秒） */
            alertCooldown: 60,
        },
        hotkeys: {
            'open-server-monitor': null,
        },
    }
}
