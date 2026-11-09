import { Component, EventEmitter, Injector, Input, Output } from '@angular/core'
import { BaseTabComponent } from 'tabby-core'
import { MonitorTarget } from '../interfaces'
import { MonitorService } from '../services/monitor.service'
import { MONITOR_ICON_SVG } from '../icons'

/**
 * 左侧分屏监控面板：作为 SplitTabComponent 的子标签插入到 SSH 会话左侧，
 * 占据独立布局空间，不再悬浮遮挡终端窗口。
 * 由 buttonProvider 动态创建并管理生命周期。
 */
@Component({
    selector: 'sm-monitor-pane',
    template: `
        <div class="sm-panel">
            <div class="sm-head">
                <strong class="sm-title">服务器监控</strong>
                <span class="sm-host" *ngIf="target">{{ target.label }}</span>
                <span class="sm-muted" *ngIf="monitor.lastRefresh">
                    {{ monitor.lastRefresh | date: 'HH:mm:ss' }}
                </span>
                <button class="btn btn-sm btn-secondary" (click)='refreshNow()'>刷新</button>
                <button class="btn btn-sm btn-secondary" (click)='close.emit()'>✕</button>
            </div>
            <div class="sm-body">
                <sm-monitor-card [target]='target'></sm-monitor-card>
                <div class="sm-empty" *ngIf="!target">
                    正在连接或等待会话就绪…<br>数据就绪后自动显示；若会话已断开，重新打开监控面板即可绑定。
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            background: #232326;
            color: #eee;
        }
        .sm-panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
        .sm-head {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(127, 127, 127, .25);
            user-select: none;
            flex: none;
        }
        .sm-title { font-size: 13px; }
        .sm-host {
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 140px;
            opacity: .85;
        }
        .sm-muted { font-size: 11px; opacity: .55; margin-left: auto; }
        .sm-body { padding: 10px; overflow: auto; flex: 1; }
        .sm-empty { opacity: .6; font-size: 12px; line-height: 1.8; text-align: center; padding: 16px; }
    `],
})
export class MonitorPaneComponent extends BaseTabComponent {
    @Input() set targetId (value: string) {
        if (this._targetId === value) {
            return
        }
        this._targetId = value
        // 立即从已缓存的目标列表中查找，不等下一轮采集（避免换绑延迟）
        this.resolveTarget()
    }

    get targetId (): string {
        return this._targetId
    }

    @Output() close = new EventEmitter<void>()

    target: MonitorTarget|null = null
    private _targetId = ''
    private allTargets: MonitorTarget[] = []

    constructor (
        public monitor: MonitorService,
        injector: Injector,
    ) {
        super(injector)
        this.setTitle('服务器监控')
        this.icon = MONITOR_ICON_SVG
        this.subscribeUntilDestroyed(monitor.targets$, targets => {
            this.allTargets = targets
            this.resolveTarget()
        })
    }

    private resolveTarget (): void {
        this.target = this.allTargets.find(t => t.id === this._targetId) ?? null
    }

    refreshNow (): void {
        this.monitor.refresh()
    }
}
