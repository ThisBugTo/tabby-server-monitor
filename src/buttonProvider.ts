import { Injectable } from '@angular/core'
import { take, takeUntil } from 'rxjs/operators'
import { AppService, BaseTabComponent, HotkeysService, NotificationsService, SplitContainer, SplitTabComponent, TabsService, ToolbarButton, ToolbarButtonProvider } from 'tabby-core'
import { MonitorTabComponent } from './components/monitorTab.component'
import { MonitorPaneComponent } from './components/monitorPane.component'
import { FilePaneComponent } from './components/filePane.component'
import { MonitorService } from './services/monitor.service'
import { FOLDER_ICON_SVG, MONITOR_ICON_SVG } from './icons'

/** @hidden */
@Injectable()
export class MonitorButtonProvider extends ToolbarButtonProvider {
    /** 每个 SSH 标签页固定持有的监控面板（一窗一面板，不跨窗口移动） */
    private panes = new Map<any, MonitorPaneComponent>()
    /** 每个 SSH 标签页的底部文件传输面板（手动开关，不自动弹出） */
    private filePanes = new Map<any, FilePaneComponent>()
    /** 已挂载 tabAdded 监听的分屏（避免重复订阅） */
    private watchedSplits = new WeakSet<SplitTabComponent>()

    constructor (
        private app: AppService,
        private tabsService: TabsService,
        hotkeys: HotkeysService,
        // 注入监控服务，使插件加载后即启动监控循环（支持后台告警）
        public monitor: MonitorService,
        private notifications: NotificationsService,
    ) {
        super()
        hotkeys.hotkey$.subscribe(hotkey => {
            if (hotkey === 'open-server-monitor') {
                void this.open()
            } else if (hotkey === 'open-file-transfer') {
                this.toggleFilePaneForActive()
            }
        })

        // 切换标签页时只修复分屏布局并补挂分屏监听；面板按 SSH 标签固定绑定，不跟随活动窗口移动
        this.app.activeTabChange$.subscribe(tab => {
            // Tabby 重启恢复分屏后 ratios 可能损坏（终端被挤压/右侧留白），切换时立即修复
            if (tab instanceof SplitTabComponent) {
                this.repairSplitRatios(tab)
                this.watchSplit(tab)
            }
        })

        this.monitor.targets$.subscribe(targets => {
            // 兜底：恢复分屏若未触发切换标签，下一轮刷新内也会修复（数组对齐且总和为 1 时零开销）
            const active = this.app.activeTab
            if (active instanceof SplitTabComponent) {
                this.repairSplitRatios(active)
            }
        })

        // 新开（含重启恢复）的 SSH 标签就绪后，立即在其左侧打开专属监控面板
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
        }, {
            icon: FOLDER_ICON_SVG,
            title: '文件传输（SSH 文件上传/下载）',
            touchBarTitle: 'Files',
            weight: 6, // 紧随监控按钮之后
            click: (): void => this.toggleFilePaneForActive(),
        }]
    }

    async open (): Promise<void> {
        const sshTab = this.findActiveSSHTab()
        if (!sshTab) {
            // 没有 SSH 会话时退回为独立标签页
            this.openStandaloneTab()
            return
        }
        await this.togglePane(sshTab)
    }

    /** 文件传输面板开关（工具栏按钮 / 快捷键）；无 SSH 会话时提示而不是静默失败 */
    private toggleFilePaneForActive (): void {
        const sshTab = this.findActiveSSHTab()
        if (!sshTab) {
            this.notifications.error('文件传输需要 SSH 连接', '请先打开一个 SSH 标签页')
            return
        }
        void this.toggleFilePane(sshTab)
    }

    /** 开关指定 SSH 会话自己的底部文件传输面板 */
    private async toggleFilePane (sshTab: any): Promise<void> {
        const existing = this.filePanes.get(sshTab)
        if (existing) {
            this.closePane(existing)
            return
        }
        // 打开：先切到目标标签，保证面板可见
        const top = sshTab.topmostParent ?? sshTab
        if (top !== this.app.activeTab) {
            this.app.selectTab(top)
        }
        await this.openFilePaneFor(sshTab)
    }

    /** 在 SSH 标签**下方**创建文件传输面板（FinalShell 底部文件面板风格，可拖中线调高矮） */
    private async openFilePaneFor (sshTab: any): Promise<void> {
        if (this.filePanes.has(sshTab)) {
            return
        }
        const pane = this.tabsService.create({ type: FilePaneComponent, inputs: { tab: sshTab } })
        // 先占位：重入调用因 has() 直接跳过，不会重复开面板
        this.filePanes.set(sshTab, pane)
        pane.destroyed$.subscribe(() => {
            if (this.filePanes.get(sshTab) === pane) {
                this.filePanes.delete(sshTab)
            }
        })
        pane.close.subscribe(() => this.closePane(pane))
        // SSH 标签被单独关闭时延迟收掉它的孤儿面板（整窗关闭时面板已随分屏销毁，查不到即跳过）
        sshTab.destroyed$.pipe(take(1)).subscribe(() => {
            setImmediate(() => {
                const orphan = this.filePanes.get(sshTab)
                if (orphan?.parent) {
                    this.closePane(orphan)
                }
            })
        })
        const split = this.splitOf(sshTab)
        if (!split) {
            this.filePanes.delete(sshTab)
            pane.destroy()
            return
        }
        try {
            // 'b' = 插到 SSH 标签下方；分屏方向不匹配时 Tabby 会自动包一层纵向容器
            await split.addTab(pane, sshTab, 'b')
        } catch (err) {
            console.error('[server-monitor] 插入文件传输面板失败', err)
            this.filePanes.delete(sshTab)
            pane.destroy()
            return
        }
        this.fitPaneRatio(split, pane)
        // 焦点交还 SSH 终端（不抢输入焦点，与监控面板一致）
        setImmediate(() => {
            if (pane.parent === split) {
                split.focus(sshTab)
            }
            this.blurInactiveTopTabs()
        })
    }

    /** 新开/恢复的 SSH 标签就绪后，为其中每个 SSH 会话自动打开专属面板（受设置开关控制；panes 幂等去重） */
    private autoOpenFor (tab: any): void {
        const settings = this.monitor.settings
        if (!settings.enabled || !settings.monitorSSHTabs) {
            return
        }
        const tryOpen = (): void => {
            if (tab instanceof SplitTabComponent) {
                this.watchSplit(tab)
            }
            for (const sshTab of this.sshTabsIn(tab)) {
                if (!this.panes.has(sshTab)) {
                    void this.openPaneFor(sshTab)
                }
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

    /** 给定标签（或其所在的分屏）内的全部 SSH 会话标签 */
    private sshTabsIn (tab: any): any[] {
        if (this.isSshProfileTab(tab)) {
            return [tab]
        }
        if (tab instanceof SplitTabComponent) {
            return tab.getAllTabs().filter((t: any) => this.isSshProfileTab(t))
        }
        return []
    }

    /**
     * 监控指定分屏：分屏内新增的 SSH 会话（复制/拖入）自动补开专属面板；
     * 首次挂载时对分屏内已有的 SSH 会话补开一次（幂等，已手动关闭的不会被重开——挂载只发生一次）。
     */
    private watchSplit (split: SplitTabComponent): void {
        if (this.watchedSplits.has(split)) {
            return
        }
        this.watchedSplits.add(split)
        split.tabAdded$.pipe(takeUntil(split.destroyed$)).subscribe(tab => {
            const settings = this.monitor.settings
            if (settings.enabled && settings.monitorSSHTabs && this.isSshProfileTab(tab) && !this.panes.has(tab)) {
                void this.openPaneFor(tab as any)
            }
        })
        const settings = this.monitor.settings
        if (settings.enabled && settings.monitorSSHTabs) {
            for (const sshTab of this.sshTabsIn(split)) {
                if (!this.panes.has(sshTab)) {
                    void this.openPaneFor(sshTab)
                }
            }
        }
    }

    /** 开关指定 SSH 会话自己的监控面板（每个窗口只关联自己的面板） */
    private async togglePane (sshTab: any): Promise<void> {
        const existing = this.panes.get(sshTab)
        if (existing) {
            // 该会话已有面板：再次点击关闭
            this.closePane(existing)
            return
        }
        // 打开：先切到目标分屏，保证面板可见
        const top = sshTab.topmostParent ?? sshTab
        if (top !== this.app.activeTab) {
            this.app.selectTab(top)
        }
        await this.openPaneFor(sshTab)
    }

    /** 在指定 SSH 会话左侧创建该会话专属的监控面板（一窗一面板，不跨窗口移动） */
    private async openPaneFor (sshTab: any): Promise<void> {
        if (this.panes.has(sshTab)) {
            return
        }
        const targetId = this.targetIdFor(sshTab)
        const pane = this.tabsService.create({ type: MonitorPaneComponent, inputs: { targetId } })
        // 先占位：splitOf / tabAdded 触发的重入会因 has() 直接跳过，不会重复开面板
        this.panes.set(sshTab, pane)
        pane.destroyed$.subscribe(() => {
            if (this.panes.get(sshTab) === pane) {
                this.panes.delete(sshTab) // 面板所在分屏被整体关闭时同步清理
            }
        })
        pane.close.subscribe(() => this.closePane(pane))
        // SSH 标签被单独关闭时延迟收掉它的孤儿面板（整窗关闭时面板已随分屏销毁，此时查不到即跳过）
        sshTab.destroyed$.pipe(take(1)).subscribe(() => {
            setImmediate(() => {
                const orphan = this.panes.get(sshTab)
                if (orphan?.parent) {
                    this.closePane(orphan)
                }
            })
        })
        const split = this.splitOf(sshTab)
        if (!split) {
            this.panes.delete(sshTab)
            pane.destroy()
            return
        }
        this.watchSplit(split)
        try {
            await split.addTab(pane, sshTab, 'l')
        } catch (err) {
            console.error('[server-monitor] 插入监控面板失败', err)
            this.panes.delete(sshTab)
            pane.destroy()
            return
        }
        this.fitPaneRatio(split, pane)
        this.monitor.refresh()
        // addTab 内部会把焦点切到新插入的面板，随后交还给 SSH 终端（保持不抢输入焦点的体验）
        setImmediate(() => {
            if (pane.parent === split) {
                // 把分屏内焦点交还 SSH 终端：split.focus 不检查分屏是否为当前活动标签，
                // 非活动分屏会留下 hasFocus=true（粘贴热键会广播到所有 hasFocus 的终端），由下方清理
                split.focus(sshTab)
            }
            this.blurInactiveTopTabs()
        })
    }

    /** 关闭插入式面板（监控 / 文件传输通用）：从分屏摘除并销毁组件（removeTab 只摘视图，不销毁实例） */
    private closePane (pane: MonitorPaneComponent|FilePaneComponent): void {
        const split = pane.parent as SplitTabComponent | null
        if (split) {
            split.removeTab(pane)
            this.blurInactiveTopTabs()
        }
        pane.destroy()
    }

    /**
     * 清理非活动顶层标签中残留的 hasFocus。
     * Tabby 的 addTab/removeTab/split.focus 在非活动分屏里也会 emitFocused，而 AppService.selectTab
     * 只 blur 切换前的活动标签，清不掉这些残留；粘贴热键（⌘-V）会广播给所有 hasFocus 的终端标签，
     * 导致“在一个窗口粘贴，所有后台 SSH 窗口都收到命令”。
     */
    private blurInactiveTopTabs (): void {
        const active = this.app.activeTab
        const clear = (tab: BaseTabComponent): void => {
            if (tab instanceof SplitTabComponent) {
                if (tab.hasFocus) {
                    tab.emitBlurred() // 分屏的 blurred$ 会同时清掉其所有子标签
                }
                for (const child of tab.getAllTabs()) {
                    clear(child)
                }
            } else if (tab.hasFocus) {
                tab.emitBlurred()
            }
        }
        for (const tab of this.app.tabs) {
            if (tab !== active) {
                clear(tab)
            }
        }
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

    /** 面板初始占比：左侧监控面板约 400px 宽、底部文件面板约 300px 高，其余留给 SSH 终端 */
    private fitPaneRatio (split: SplitTabComponent, pane: BaseTabComponent): void {
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
        const vertical = container.orientation === 'v'
        const span = vertical ? window.innerHeight : window.innerWidth
        const desired = vertical
            ? Math.min(0.45, Math.max(0.15, 300 / Math.max(1, span)))
            : Math.min(0.45, Math.max(0.12, 400 / Math.max(1, span)))
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
        this.app.removeTab(tab)
        const pending = split.addTab(tab, null, 'l')
        this.app.addTabRaw(split)
        void pending.then(
            () => this.blurInactiveTopTabs(),
            err => console.error('[server-monitor] 包装分屏失败', err),
        )
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
