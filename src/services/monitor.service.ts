import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'
import { AppService, ConfigService, HostAppService, Logger, LogService, NotificationsService, Platform, SplitTabComponent } from 'tabby-core'
import { MonitorTarget, ServerStats, SSHTabLike } from '../interfaces'
import { probeLocal } from './localProbe'
import { probeSSH } from './remoteProbe'

/**
 * 监控引擎：
 * - 定时刷新本地与所有已打开 SSH 标签页的 CPU / 内存 / GPU / 磁盘 / 负载
 * - SSH 采集通过会话的 exec 通道执行只读命令，不占用终端输入
 * - 超过阈值时弹出通知（带冷却）
 */
@Injectable({ providedIn: 'root' })
export class MonitorService {
    targets$ = new BehaviorSubject<MonitorTarget[]>([])
    lastRefresh: Date|null = null
    refreshing = false

    private timer: any = null
    private logger: Logger
    private alertLastFired = new Map<string, number>()
    private stateCache = new Map<string, MonitorTarget>()
    private pendingRefresh = false

    constructor (
        private app: AppService,
        public config: ConfigService,
        private notifications: NotificationsService,
        log: LogService,
        private hostApp: HostAppService,
    ) {
        this.logger = log.create('server-monitor')
        this.config.ready$.toPromise().then(() => {
            this.startLoop()
            // 标签页开/关时立即刷新，新打开的 SSH 会话可以马上被发现
            this.app.tabsChanged$.pipe(debounceTime(200)).subscribe(() => this.refresh())
        })
    }

    get settings (): any {
        return this.config.store.serverMonitor ?? {}
    }

    /** 立即刷新一轮 */
    async refresh (): Promise<void> {
        const cfg = this.settings
        if (!cfg.enabled) {
            this.stateCache.clear()
            this.targets$.next([])
            return
        }
        if (this.refreshing) {
            // 正在探测时收到新请求：排队，当前轮结束后立刻补刷一轮
            this.pendingRefresh = true
            return
        }
        this.refreshing = true
        try {
            const descriptors = this.collectTargets(cfg)
            // 先推送目标列表：新打开的 SSH 会话可以立即出现在面板上（探测完成后再推一次带数据的）
            this.targets$.next(descriptors)
            await Promise.all(descriptors.map(t => this.probeTarget(t, cfg)))
            this.lastRefresh = new Date()
            this.targets$.next(descriptors)
        } catch (err) {
            this.logger.error(`刷新失败: ${err}`)
        } finally {
            this.refreshing = false
            if (this.pendingRefresh) {
                this.pendingRefresh = false
                setTimeout(() => this.refresh(), 50)
            }
        }
    }

    /** 收集监控目标：本机 + 每台已连接 SSH 服务器（按主机去重） */
    private collectTargets (cfg: any): MonitorTarget[] {
        const result: MonitorTarget[] = []
        const seen = new Set<string>()

        if (cfg.monitorLocal) {
            const id = 'local'
            seen.add(id)
            result.push(this.merged(id, 'local', '本地主机', undefined))
        }

        if (cfg.monitorSSHTabs && this.hostApp.platform !== Platform.Web) {
            // Tabby 会把通过配置选择器打开的标签包装进 SplitTabComponent（分屏容器），
            // 因此必须递归展平分屏子标签，否则新开的 SSH 会话会被漏掉
            for (const tab of this.flattenTabs(this.app.tabs)) {
                const sshTab = tab as any as SSHTabLike
                if (!sshTab?.sshSession || !sshTab?.profile?.options?.host) {
                    continue
                }
                const o = sshTab.profile.options
                const id = `ssh:${o.user || 'default'}@${o.host}:${o.port ?? 22}`
                if (seen.has(id)) {
                    continue // 多个标签页复用同一会话时只保留一个
                }
                seen.add(id)
                result.push(this.merged(id, 'ssh', `${o.user ? o.user + '@' : ''}${o.host}:${o.port ?? 22}`, sshTab))
            }
        }

        // 清理已关闭目标的状态缓存
        for (const key of [...this.stateCache.keys()]) {
            if (!seen.has(key)) {
                this.stateCache.delete(key)
            }
        }
        return result
    }

    /** 递归展平标签列表：分屏容器展开为其内部的所有子标签 */
    private flattenTabs (tabs: readonly any[]): any[] {
        const result: any[] = []
        for (const tab of tabs) {
            if (tab instanceof SplitTabComponent) {
                result.push(...this.flattenTabs(tab.getAllTabs()))
            } else {
                result.push(tab)
            }
        }
        return result
    }

    private merged (id: string, kind: 'local'|'ssh', label: string, ref?: SSHTabLike): MonitorTarget {
        const prev = this.stateCache.get(id)
        const target: MonitorTarget = {
            id, kind, label, ref,
            stats: prev?.stats ?? null,
            error: prev?.error ?? null,
            lastUpdated: prev?.lastUpdated ?? null,
        }
        this.stateCache.set(id, target)
        return target
    }

    private async probeTarget (target: MonitorTarget, cfg: any): Promise<void> {
        try {
            let stats: ServerStats
            if (target.kind === 'local') {
                stats = await probeLocal(this.hostApp.platform)
            } else {
                const session = target.ref?.sshSession
                if (!session) {
                    throw new Error('SSH 会话已关闭')
                }
                stats = await probeSSH(session, cfg.cpuSampleSeconds ?? 1, cfg.diskMount ?? '/')
            }
            target.stats = stats
            target.error = null
            target.lastUpdated = Date.now()
            this.checkThresholds(target, stats, cfg)
        } catch (err: any) {
            target.error = err?.message ? String(err.message) : String(err)
            this.logger.warn(`${target.label}: ${target.error}`)
        }
    }

    /** 阈值告警（带冷却） */
    private checkThresholds (target: MonitorTarget, stats: ServerStats, cfg: any): void {
        const thresholds = cfg.thresholds ?? {}
        const cooldownMs = Math.max(0, cfg.alertCooldown ?? 60) * 1000
        const checks: [string, number|null, number][] = [
            ['CPU', stats.cpuPercent, thresholds.cpu],
            ['内存', this.memPercent(stats), thresholds.memory],
            ['GPU', stats.gpus.length ? Math.max(...stats.gpus.map(g => g.utilPercent ?? 0)) : null, thresholds.gpu],
            ['磁盘', stats.disk?.usedPercent ?? null, thresholds.disk],
        ]
        for (const [name, value, threshold] of checks) {
            if (!threshold || value === null || value < threshold) {
                continue
            }
            const key = `${target.id}:${name}`
            const now = Date.now()
            if (now - (this.alertLastFired.get(key) ?? 0) < cooldownMs) {
                continue
            }
            this.alertLastFired.set(key, now)
            this.notifications.error(
                `${target.label} ${name}占用 ${Math.round(value)}%`,
                `已超过告警阈值 ${threshold}%`,
            )
        }
    }

    memPercent (stats: ServerStats): number|null {
        if (!stats.mem || !stats.mem.total) {
            return null
        }
        return stats.mem.used / stats.mem.total * 100
    }

    /** 是否存在“已有 SSH 配置但会话尚未就绪”的标签（正在连接中） */
    private hasConnectingSSHTab (): boolean {
        if (!this.config.store.serverMonitor?.monitorSSHTabs) {
            return false
        }
        for (const tab of this.flattenTabs(this.app.tabs)) {
            const t = tab as any
            if (t?.profile?.options?.host && !t?.sshSession?.open) {
                return true
            }
        }
        return false
    }

    private startLoop (): void {
        if (this.timer) {
            clearTimeout(this.timer)
        }
        const tick = async (): Promise<void> => {
            try {
                await this.refresh()
            } catch (err) {
                this.logger.error(`监控循环异常: ${err}`)
            }
            // 有 SSH 正在连接时用 1 秒快速轮询，连接完成后恢复常规间隔
            const interval = this.hasConnectingSSHTab()
                ? 1
                : Math.max(2, this.settings.refreshInterval ?? 5)
            this.timer = setTimeout(tick, interval * 1000)
        }
        tick()
    }
}
