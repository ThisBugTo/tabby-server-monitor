import { Injectable } from '@angular/core'
import { take } from 'rxjs/operators'
import { AppService, HotkeysService, SplitContainer, SplitTabComponent, TabsService, ToolbarButton, ToolbarButtonProvider } from 'tabby-core'
import { MonitorTabComponent } from './components/monitorTab.component'
import { MonitorPaneComponent } from './components/monitorPane.component'
import { MonitorService } from './services/monitor.service'
import { MONITOR_ICON_SVG } from './icons'

/** @hidden */
@Injectable()
export class MonitorButtonProvider extends ToolbarButtonProvider {
    /** 当前监控分屏面板（单实例，跟随活动 SSH 会话移动，对应原浮动窗的单实例行为） */
    private pane: MonitorPaneComponent|null = null
    /** 打开/移动面板期间屏蔽 activeTabChange 跟随逻辑，避免重入 */
    private busy = false

    constructor (
        private app: AppService,
        private tabsService: TabsService,
        hotkeys: HotkeysService,
        // 注入监控服务，使插件加载后即启动监控循环（支持后台告警）
        public monitor: MonitorService,
    ) {
        super()
        hotkeys.hotkey$.subscribe(hotkey => {
            if (hotkey === 'open-server-monitor') {
                void this.open()
            }
        })

        // 切换标签页时，面板跟随切换到新的 SSH 会话所在的分屏（对应原浮动窗的跟随换绑行为）
        this.app.activeTabChange$.subscribe(tab => {
            // Tabby 重启恢复分屏后 ratios 可能损坏（终端被挤压/右侧留白），切换时立即修复
            if (tab instanceof SplitTabComponent) {
                this.repairSplitRatios(tab)
            }
            if (!this.pane || this.busy) {
                return
            }
            const sshProfileTab = this.findSSHProfileTabIn(tab as any)
            if (sshProfileTab) {
                void this.movePaneTo(sshProfileTab)
            }
        })

        this.monitor.targets$.subscribe(targets => {
            // 兜底：恢复分屏若未触发切换标签，下一轮刷新内也会修复（数组对齐且总和为 1 时零开销）
            const active = this.app.activeTab
            if (active instanceof SplitTabComponent) {
                this.repairSplitRatios(active)
            }
        })

        // 新开（含重启恢复）的 SSH 标签就绪后，立即在其左侧自动打开监控面板
        this.app.tabOpened$.subscribe(tab => this.autoOpenFor(tab))

        // 插件构造晚于标签恢复时，补扫已打开的标签
        for (const tab of [...this.app.tabs]) {
            this.autoOpenFor(tab)
        }
    }

    provide (): ToolbarButton[] {
        return [{
            icon: MONITOR_ICON_SVG,
            title: '服务器状态监控',
            touchBarTitle: 'Monitor',
            weight: 5, // >0 → 窗口右上工具栏，位于设置按钮旁
            click: (): void => { void this.open() },
        }]
    }

    async open (): Promise<void> {
        this.busy = true
        try {
            const sshTab = this.findActiveSSHTab()
            if (!sshTab) {
                // 没有 SSH 会话时退回为独立标签页
                this.openStandaloneTab()
                return
            }
            await this.togglePane(sshTab)
        } finally {
            this.busy = false
        }
    }

    /** 新开/恢复的 SSH 标签就绪后自动打开监控面板（受设置开关控制；重复触发由 movePaneTo 幂等去重） */
    private autoOpenFor (tab: any): void {
        const settings = this.monitor.settings
        if (!settings.enabled || !settings.monitorSSHTabs) {
            return
        }
        const tryOpen = (): void => {
            const sshTab = this.findSSHProfileTabIn(tab)
            if (sshTab) {
                void this.movePaneTo(sshTab)
            }
        }
        if (!(tab instanceof SplitTabComponent)) {
            tryOpen()
            return
        }
        if (tab.getAllTabs().length) {
            tryOpen()
        } else {
            // 重启恢复：子标签在分屏 initialized 后才挂载，等就绪再打开（与 SSH 窗口同刻出现）
            tab.initialized$.pipe(take(1)).subscribe(tryOpen)
        }
    }

    /** 在 SSH 会话左侧插入/关闭监控分屏面板（只展示该会话的服务器） */
    private async togglePane (sshTab: any): Promise<void> {
        const targetId = this.targetIdFor(sshTab)
        const split = this.splitOf(sshTab)
        if (!split) {
            return
        }
        if (this.pane && this.pane.parent === split && this.pane.targetId === targetId) {
            // 面板已绑定该会话并位于其左侧：再次点击关闭
            this.closePane(this.pane)
            return
        }
        // 打开/换绑：先切到目标分屏，保证面板可见（原浮窗可悬浮在任意标签页上，分屏必须可见）
        const top = sshTab.topmostParent ?? sshTab
        if (top !== this.app.activeTab) {
            this.app.selectTab(top)
        }
        await this.movePaneTo(sshTab)
    }

    /** 把面板创建/移动到目标 SSH 会话所在分屏的左侧，并换绑到该会话 */
    private async movePaneTo (sshTab: any): Promise<void> {
        const split = this.splitOf(sshTab)
        if (!split) {
            return
        }
        const targetId = this.targetIdFor(sshTab)
        let pane: MonitorPaneComponent
        if (this.pane) {
            const existing = this.pane
            pane = existing
            if (existing.targetId !== targetId) {
                existing.targetId = targetId // setter 会立即按缓存目标列表换绑
            }
            if (existing.parent === split) {
                this.monitor.refresh()
                return
            }
            // 单实例：先从原分屏摘除，再插入到目标分屏左侧
            ;(existing.parent as SplitTabComponent | null)?.removeTab(existing)
        } else {
            const created = this.tabsService.create({ type: MonitorPaneComponent, inputs: { targetId } })
            pane = created
            this.pane = created
            created.destroyed$.subscribe(() => {
                if (this.pane === created) {
                    this.pane = null // 面板所在分屏被整体关闭时同步清理引用
                }
            })
            created.close.subscribe(() => this.closePane(created))
        }
        await split.addTab(pane, sshTab, 'l')
        this.fitPaneRatio(split, pane)
        this.monitor.refresh()
        // addTab 内部会把焦点切到新插入的面板，随后交还给 SSH 终端（保持不抢输入焦点的体验）
        setImmediate(() => {
            if (pane.parent === split) {
                split.focus(sshTab)
            }
        })
    }

    /** 关闭面板：从分屏摘除并销毁组件（removeTab 只摘视图，不销毁实例） */
    private closePane (pane: MonitorPaneComponent): void {
        const split = pane.parent as SplitTabComponent | null
        if (split) {
            split.removeTab(pane)
        }
        pane.destroy()
    }

    /**
     * 修复分屏恢复后 ratios 损坏的状态：Tabby 恢复时若子标签（如本插件面板，无恢复令牌）被丢弃，
     * ratios 与 children 会长度错位且总和不为 1，导致子面板被挤压、右侧留白。
     * 此处对齐长度、剔除非数值并归一到 1；无变化时不做任何事。
     * @returns 是否发生了修复（有修复时已重新 layout）
     */
    private repairSplitRatios (split: SplitTabComponent): boolean {
        let changed = false
        const fix = (container: SplitContainer): void => {
            const n = container.children.length
            if (!n) {
                return
            }
            // 截断多余、补齐缺失、非数值置 0
            const next = container.ratios.slice(0, n).map(r => (isFinite(r) && r >= 0) ? r : 0)
            while (next.length < n) {
                next.push(1)
            }
            let sum = next.reduce((a, b) => a + b, 0)
            if (!(sum > 0)) {
                for (let i = 0; i < n; i++) {
                    next[i] = 1 / n
                }
                sum = 1
            } else if (Math.abs(sum - 1) > 0.001) {
                for (let i = 0; i < n; i++) {
                    next[i] = next[i] / sum
                }
            }
            const dirty = next.length !== container.ratios.length
                || next.some((r, i) => Math.abs(r - container.ratios[i]) > 1e-6)
            if (dirty) {
                container.ratios = next
                changed = true
            }
            for (const child of container.children) {
                if (child instanceof SplitContainer) {
                    fix(child)
                }
            }
        }
        fix(split.root)
        if (changed) {
            split.root.normalize()
            split.layout()
        }
        return changed
    }

    /** 面板初始宽度约 400px（与原浮窗一致），其余宽度留给 SSH 终端 */
    private fitPaneRatio (split: SplitTabComponent, pane: MonitorPaneComponent): void {
        // 先修复恢复分屏可能损坏的 ratios，再在归一化后的数据上计算目标比例
        this.repairSplitRatios(split)
        const container = split.getParentOf(pane)
        if (!container) {
            return
        }
        const index = container.children.indexOf(pane)
        const n = container.children.length
        if (index < 0 || n < 2) {
            return
        }
        const desired = Math.min(0.45, Math.max(0.12, 400 / Math.max(1, window.innerWidth)))
        const othersSum = 1 - container.ratios[index]
        container.ratios = container.ratios.map((r, i) => {
            if (i === index) {
                return desired
            }
            return othersSum > 0.001 ? r * (1 - desired) / othersSum : (1 - desired) / (n - 1)
        })
        split.layout()
    }

    /** 会话所在的分屏容器；Tabby 会把打开的标签包装进 SplitTabComponent，未包装时现场兜底包装 */
    private splitOf (tab: any): SplitTabComponent|null {
        if (tab?.parent instanceof SplitTabComponent) {
            return tab.parent
        }
        if (!tab) {
            return null
        }
        // 防御分支：Tabby 常规路径都会包装分屏，仅当拿到裸的顶层标签时在此包装
        const split = this.tabsService.create({ type: SplitTabComponent })
        const prevBusy = this.busy
        this.busy = true
        try {
            this.app.removeTab(tab)
            const pending = split.addTab(tab, null, 'l')
            this.app.addTabRaw(split)
            void pending.catch(err => console.error('[server-monitor] 包装分屏失败', err))
        } finally {
            this.busy = prevBusy
        }
        return split
    }

    /** 当前活动的 SSH 标签页（含分屏内的子标签）；找不到时退回第一个 SSH 标签 */
    private findActiveSSHTab (): any|null {
        const active = this.app.activeTab as any
        const inActive = this.findSSHTabIn(active)
        if (inActive) {
            return inActive
        }
        // 退回：任意一个已连接的 SSH 标签
        for (const tab of this.flattenTabs(this.app.tabs)) {
            if (this.isSSHTab(tab)) {
                return tab
            }
        }
        return null
    }

    /** 在给定标签（或其所在的分屏）中找 SSH 会话标签 */
    private findSSHTabIn (tab: any): any|null {
        if (this.isSSHTab(tab)) {
            return tab
        }
        if (tab instanceof SplitTabComponent) {
            return tab.getAllTabs().find((t: any) => this.isSSHTab(t)) ?? null
        }
        return null
    }

    /** 是否为 SSH 配置标签（带 host 且为 SSH 类型；排除 RDP/Telnet 等同样带 host 的配置） */
    private isSshProfileTab (tab: any): boolean {
        const profile = tab?.profile
        return !!profile?.options?.host
            && (profile?.type === 'ssh' || (!!tab && 'sshSession' in tab))
    }

    /** 在给定标签（或其所在的分屏中）找带 SSH 配置的标签（不要求会话已连接，用于即时换绑/自动打开） */
    private findSSHProfileTabIn (tab: any): any|null {
        if (this.isSshProfileTab(tab)) {
            return tab
        }
        if (tab instanceof SplitTabComponent) {
            return tab.getAllTabs().find((t: any) => this.isSshProfileTab(t)) ?? null
        }
        return null
    }

    private isSSHTab (tab: any): boolean {
        return !!tab?.sshSession && !!tab?.profile?.options?.host
    }

    /** 与 MonitorService.collectTargets 相同的 id 规则，保证面板能找到对应目标 */
    private targetIdFor (sshTab: any): string {
        const o = sshTab.profile.options
        return `ssh:${o.user || 'default'}@${o.host}:${o.port ?? 22}`
    }

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

    private openStandaloneTab (): void {
        const existing = this.flattenTabs(this.app.tabs).find(tab => tab instanceof MonitorTabComponent)
        if (existing) {
            this.app.selectTab(existing.topmostParent ?? existing)
        } else {
            this.app.openNewTabRaw({ type: MonitorTabComponent })
        }
    }
}
