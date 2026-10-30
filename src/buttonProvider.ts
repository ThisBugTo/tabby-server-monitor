import { ApplicationRef, ComponentFactoryResolver, ComponentRef, Injectable, Injector } from '@angular/core'
import { AppService, HotkeysService, SplitTabComponent, ToolbarButton, ToolbarButtonProvider } from 'tabby-core'
import { MonitorTabComponent } from './components/monitorTab.component'
import { MonitorOverlayComponent } from './components/monitorOverlay.component'
import { MonitorService } from './services/monitor.service'
import { MONITOR_ICON_SVG } from './icons'

/** @hidden */
@Injectable()
export class MonitorButtonProvider extends ToolbarButtonProvider {
    private overlayRef: ComponentRef<MonitorOverlayComponent>|null = null

    constructor (
        private app: AppService,
        private resolver: ComponentFactoryResolver,
        private appRef: ApplicationRef,
        private injector: Injector,
        hotkeys: HotkeysService,
        // 注入监控服务，使插件加载后即启动监控循环（支持后台告警）
        public monitor: MonitorService,
    ) {
        super()
        hotkeys.hotkey$.subscribe(hotkey => {
            if (hotkey === 'open-server-monitor') {
                this.open()
            }
        })

        // 切换标签页时，浮动窗立即跟随切换绑定到新的 SSH 会话（不等连接就绪，id 只依赖 profile）
        this.app.activeTabChange$.subscribe(tab => {
            if (!this.overlayRef) {
                return
            }
            const sshProfileTab = this.findSSHProfileTabIn(tab as any)
            if (sshProfileTab) {
                this.rebindOverlay(this.targetIdFor(sshProfileTab))
            }
        })

        // 新的 SSH 会话建立后，默认自动弹出浮动窗（插件加载时已有的连接不触发）
        let initialized = false
        const seen = new Set<string>()
        this.monitor.targets$.subscribe(targets => {
            const sshTargets = targets.filter(t => t.kind === 'ssh')
            if (!initialized) {
                initialized = true
                sshTargets.forEach(t => seen.add(t.id))
                return
            }
            const fresh = sshTargets.filter(t => !seen.has(t.id))
            sshTargets.forEach(t => seen.add(t.id))
            if (!fresh.length) {
                return
            }
            // 取最新的一个新连接
            const newest = fresh[fresh.length - 1]
            if (this.overlayRef) {
                this.rebindOverlay(newest.id)
            } else {
                this.createOverlay(newest.id)
            }
        })
    }

    provide (): ToolbarButton[] {
        return [{
            icon: MONITOR_ICON_SVG,
            title: '服务器状态监控',
            touchBarTitle: 'Monitor',
            weight: 5, // >0 → 窗口右上工具栏，位于设置按钮旁
            click: (): void => this.open(),
        }]
    }

    open (): void {
        const sshTab = this.findActiveSSHTab()
        if (!sshTab) {
            // 没有 SSH 会话时退回为独立标签页
            this.openStandaloneTab()
            return
        }
        this.toggleOverlay(sshTab)
    }

    /** 在 SSH 会话上方弹出/关闭浮动监控面板（只展示该会话的服务器） */
    private toggleOverlay (sshTab: any): void {
        const targetId = this.targetIdFor(sshTab)
        if (this.overlayRef) {
            if (this.overlayRef.instance.targetId === targetId) {
                this.closeOverlay()
                return
            }
            // 已有面板但绑定的是别的服务器：切换绑定
            this.rebindOverlay(targetId)
            return
        }
        this.createOverlay(targetId)
    }

    /** 换绑浮动窗到新的目标并立即刷新 */
    private rebindOverlay (targetId: string): void {
        if (!this.overlayRef || this.overlayRef.instance.targetId === targetId) {
            return
        }
        this.overlayRef.instance.targetId = targetId
        this.monitor.refresh()
    }

    private createOverlay (targetId: string): void {
        if (this.overlayRef) {
            return
        }
        const factory = this.resolver.resolveComponentFactory(MonitorOverlayComponent)
        const ref = factory.create(this.injector)
        ref.instance.targetId = targetId
        ref.instance.close.subscribe(() => this.closeOverlay())
        this.appRef.attachView(ref.hostView)
        document.body.appendChild(ref.location.nativeElement)
        this.overlayRef = ref
        this.monitor.refresh()
    }

    private closeOverlay (): void {
        if (!this.overlayRef) {
            return
        }
        this.appRef.detachView(this.overlayRef.hostView)
        this.overlayRef.destroy()
        this.overlayRef.location.nativeElement.remove()
        this.overlayRef = null
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

    /** 在给定标签（或其所在的分屏中）找带 SSH 配置的标签（不要求会话已连接，用于即时换绑） */
    private findSSHProfileTabIn (tab: any): any|null {
        if (tab?.profile?.options?.host) {
            return tab
        }
        if (tab instanceof SplitTabComponent) {
            return tab.getAllTabs().find((t: any) => t?.profile?.options?.host) ?? null
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
