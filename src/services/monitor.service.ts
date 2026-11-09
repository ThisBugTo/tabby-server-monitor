import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'
import { AppService, ConfigService, HostAppService, Logger, LogService, NotificationsService, Platform, SplitTabComponent } from 'tabby-core'
import { MonitorTarget, ProcInfo, ServerStats, SSHTabLike } from '../interfaces'
import { probeLocalAux, probeLocalQuick } from './localProbe'
import { probeSSHAux, probeSSHCpu, probeSSHQuick } from './remoteProbe'

/** 低频数据缓存：公网 IP 与进程 Top5（key = target id） */
interface AuxEntry {
    ip: string|null
    ipAt: number
    procAt: number
    cpuTop5: ProcInfo[]
    memTop5: ProcInfo[]
}

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
    private auxCache = new Map<string, AuxEntry>()
    private pendingRefresh = false
    /** 最近一次采集的目标列表（供任何时机的 notify 推送最新数据，包括后台低频阶段完成时） */
    private lastDescriptors: MonitorTarget[] = []

    /** 公网 IP 成功后的复用时长（IP 极少变化） */
    private static readonly IP_TTL_OK = 15 * 60 * 1000
    /** 公网 IP 采集失败后的重试间隔（避免每轮都发外部请求） */
    private static readonly IP_TTL_FAIL = 5 * 60 * 1000
    /** 进程 Top5 采集间隔（ps 为轻量只读命令，但不随 5 秒主循环执行） */
    private static readonly PROC_TTL = 30 * 1000

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
            this.scheduleNextTick()
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
            this.lastDescriptors = descriptors
            // 先推送目标列表：新打开的 SSH 会话可以立即出现在面板上（骨架屏）
            this.targets$.next(descriptors)
            // 分级回填：各目标、各阶段完成即推送，先查到的先展示（磁盘等快数据不等 CPU/IP/进程）
            const notify = (): void => this.targets$.next(this.lastDescriptors)
            await Promise.all(descriptors.map(t => this.probeTarget(t, cfg, notify)))
            this.lastRefresh = new Date()
            this.targets$.next(descriptors)
        } catch (err) {
            this.logger.error(`刷新失败: ${err}`)
        } finally {
            this.refreshing = false
            // 每轮结束按最新状态重排下一轮：标签恢复/连接就绪触发的刷新也会重排，
            // 避免“状态已变、旧定时器仍在长间隔里等待”的启动缝隙（重启后首填慢的根因）
            if (this.pendingRefresh) {
                this.pendingRefresh = false
                this.scheduleNextTick(0.05)
            } else {
                this.scheduleNextTick()
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
            // 因此必须递归展平分屏子标签，否则新开的 SSH 会话会被漏掉。
            // 按 SSH profile 收集（不要求会话已建立）：标签一打开即入列，
            // 面板立即展示骨架屏，会话就绪后再回写数据（消除秒级等待）。
            for (const tab of this.flattenTabs(this.app.tabs)) {
                const sshTab = tab as any as SSHTabLike
                if (!sshTab?.profile?.options?.host) {
                    continue
                }
                // 仅 SSH 类型：排除 RDP/Telnet 等同样带 host 的配置
                if (sshTab.profile?.type !== 'ssh' && !('sshSession' in (sshTab as any))) {
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

        // 清理已关闭目标的状态与低频数据缓存
        for (const key of [...this.stateCache.keys()]) {
            if (!seen.has(key)) {
                this.stateCache.delete(key)
                this.auxCache.delete(key)
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

    private async probeTarget (target: MonitorTarget, cfg: any, notify: () => void): Promise<void> {
        // 低频数据（公网 IP / 进程 Top5）按 TTL 采集并缓存，高频刷新轮次只回填不重复执行
        const aux = this.auxFor(target.id)
        const t0 = Date.now()
        const wantIp = t0 - aux.ipAt > (aux.ip ? MonitorService.IP_TTL_OK : MonitorService.IP_TTL_FAIL)
        const wantProcs = t0 - aux.procAt > MonitorService.PROC_TTL
        const applyAux = (stats: ServerStats): void => {
            stats.publicIp = aux.ip
            stats.cpuTop5 = aux.cpuTop5
            stats.memTop5 = aux.memTop5
        }
        const commit = (stats: ServerStats): void => {
            target.stats = stats
            target.error = null
            target.lastUpdated = Date.now()
            this.checkThresholds(target, stats, cfg)
            notify()
        }
        /** 低频阶段：启动即记时间（防并发重复、失败也按 TTL 退避），后台执行不阻塞刷新周期 */
        const runAuxDetached = (fetcher: () => Promise<{ publicIp?: string|null, cpuTop5?: ProcInfo[], memTop5?: ProcInfo[] }>): void => {
            if (wantIp) {
                aux.ipAt = Date.now()
            }
            if (wantProcs) {
                aux.procAt = Date.now()
            }
            void (async () => {
                let extra = null
                try {
                    extra = await fetcher()
                } catch {
                    extra = null
                }
                if (extra?.publicIp) {
                    aux.ip = extra.publicIp // 采集失败时保留旧值，不抹掉已展示的 IP
                }
                if (extra?.cpuTop5?.length) {
                    aux.cpuTop5 = extra.cpuTop5
                    aux.memTop5 = extra.memTop5 ?? []
                }
                // 回填到该目标的最新对象（跨刷新周期仍能写到当前展示的数据）
                const latest = this.stateCache.get(target.id)
                if (latest?.stats) {
                    applyAux(latest.stats)
                    notify()
                }
            })().catch(() => undefined)
        }

        try {
            if (target.kind === 'local') {
                // 阶段1：本机核心快数据先回填
                const stats = await probeLocalQuick(this.hostApp.platform)
                applyAux(stats)
                commit(stats)
                // 阶段2：公网 IP / 进程 Top5（按 TTL，后台执行不阻塞刷新周期）
                if ((wantIp || wantProcs) && this.hostApp.platform !== Platform.Web) {
                    runAuxDetached(() => probeLocalAux({ wantIp, wantProcs }))
                }
                return
            }

            const session = target.ref?.sshSession
            if (!session) {
                // 连接中（会话尚未建立）：静默跳过探测，不报错，面板保留骨架屏等待就绪
                return
            }
            // 阶段1：快数据（磁盘/内存/负载等）立即回填，不等 CPU 采样与外网请求
            const quick = await probeSSHQuick(session, cfg.diskMount ?? '/')
            applyAux(quick.stats)
            commit(quick.stats)
            // 阶段2：CPU 补采（Linux 本地等待采样窗口；macOS 远端 top -l 2 自带采样）
            try {
                const cpu = await probeSSHCpu(session, cfg.cpuSampleSeconds ?? 1, quick)
                if (cpu !== null && target.stats === quick.stats) {
                    quick.stats.cpuPercent = cpu
                    this.checkThresholds(target, quick.stats, cfg)
                    notify()
                }
            } catch {
                // CPU 补采失败：保留已回填的快数据
            }
            // 阶段3：公网 IP / 进程 Top5（按 TTL，后台执行不阻塞快数据与刷新周期）
            if (wantIp || wantProcs) {
                runAuxDetached(() => probeSSHAux(session, { wantIp, wantProcs }))
            }
        } catch (err: any) {
            target.error = err?.message ? String(err.message) : String(err)
            this.logger.warn(`${target.label}: ${target.error}`)
            notify()
        }
    }

    /** 阈值告警（带冷却） */
    private checkThresholds (target: MonitorTarget, stats: ServerStats, cfg: any): void {
        const thresholds = cfg.thresholds ?? {}
        const cooldownMs = Math.max(0, cfg.alertCooldown ?? 60) * 1000
        const checks: [string, number|null, number][] = [
            ['CPU', stats.cpuPercent, thresholds.cpu],
            ['内存', this.memPercent(stats), thresholds.memory],
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

    private auxFor (id: string): AuxEntry {
        let aux = this.auxCache.get(id)
        if (!aux) {
            aux = { ip: null, ipAt: 0, procAt: 0, cpuTop5: [], memTop5: [] }
            this.auxCache.set(id, aux)
        }
        return aux
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

    /** 有 SSH 目标等待首次数据（连接中或待首次探测）：1 秒快轮询，会话就绪后尽快回填 */
    private hasPendingTarget (): boolean {
        if (!this.config.store.serverMonitor?.monitorSSHTabs) {
            return false
        }
        for (const target of this.stateCache.values()) {
            if (target.kind === 'ssh' && !target.stats && !target.error) {
                return true
            }
        }
        return false
    }

    /** 统一调度：每轮刷新结束后按最新状态重排下一轮（连接中 1s、待回填 0.5s、否则常规间隔） */
    private scheduleNextTick (delaySeconds?: number): void {
        if (this.timer) {
            clearTimeout(this.timer)
        }
        const delay = delaySeconds ?? (
            this.hasConnectingSSHTab()
                ? 1
                : this.hasPendingTarget()
                    ? 0.5
                    : Math.max(2, this.settings.refreshInterval ?? 5)
        )
        this.timer = setTimeout(() => {
            void this.refresh().catch(err => this.logger.error(`监控循环异常: ${err}`))
        }, delay * 1000)
    }

    private startLoop (): void {
        if (this.timer) {
            clearTimeout(this.timer)
        }
        this.scheduleNextTick(0)
    }
}
