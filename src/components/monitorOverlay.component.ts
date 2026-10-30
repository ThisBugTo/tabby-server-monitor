import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output } from '@angular/core'
import { Subscription } from 'rxjs'
import { MonitorTarget } from '../interfaces'
import { MonitorService } from '../services/monitor.service'

/**
 * 浮动监控面板：悬浮在窗口之上，只展示绑定的单个 SSH 会话的服务器状态。
 * 通过 ComponentFactoryResolver 动态创建，挂到 body 上。
 */
@Component({
    selector: 'sm-monitor-overlay',
    template: `
        <div class="sm-panel">
            <div class="sm-head" (mousedown)='startDrag($event)'>
                <strong class="sm-title">服务器监控</strong>
                <span class="sm-host" *ngIf="target">{{ target.label }}</span>
                <span class="sm-muted" *ngIf="monitor.lastRefresh">
                    {{ monitor.lastRefresh | date: 'HH:mm:ss' }}
                </span>
                <button class="btn btn-sm btn-secondary" (mousedown)='$event.stopPropagation()'
                    (click)='refreshNow()'>刷新</button>
                <button class="btn btn-sm btn-secondary" (mousedown)='$event.stopPropagation()'
                    (click)='close.emit()'>✕</button>
            </div>
            <div class="sm-body">
                <sm-monitor-card [target]='target'></sm-monitor-card>
                <div class="sm-empty" *ngIf="!target">
                    未找到对应的 SSH 会话（可能已断开）。<br>重新打开监控面板即可绑定当前连接。
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host {
            position: fixed;
            right: 24px;
            bottom: 60px;
            z-index: 1050;
            width: 400px;
            max-height: 70vh;
            display: block;
        }
        .sm-panel {
            background: rgba(35, 35, 38, .96);
            border: 1px solid rgba(127, 127, 127, .35);
            border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, .45);
            overflow: hidden;
            color: #eee;
        }
        .sm-head {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(127, 127, 127, .25);
            cursor: move;
            user-select: none;
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
        .sm-body { padding: 10px; overflow: auto; max-height: calc(70vh - 44px); }
        .sm-empty { opacity: .6; font-size: 12px; line-height: 1.8; text-align: center; padding: 16px; }
    `],
})
export class MonitorOverlayComponent implements OnDestroy {
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
    private sub: Subscription
    private dragCleanup: (() => void)|null = null

    constructor (
        public monitor: MonitorService,
        private el: ElementRef<HTMLElement>,
    ) {
        this.sub = monitor.targets$.subscribe(targets => {
            this.allTargets = targets
            this.resolveTarget()
        })
    }

    private resolveTarget (): void {
        this.target = this.allTargets.find(t => t.id === this._targetId) ?? null
    }

    ngOnDestroy (): void {
        this.sub.unsubscribe()
        this.dragCleanup?.()
    }

    refreshNow (): void {
        this.monitor.refresh()
    }

    /** 拖动面板 */
    startDrag (event: MouseEvent): void {
        event.preventDefault()
        const host = this.el.nativeElement
        const rect = host.getBoundingClientRect()
        const offsetX = event.clientX - rect.left
        const offsetY = event.clientY - rect.top

        const onMove = (e: MouseEvent): void => {
            // 从 right/bottom 定位切换为 left/top 定位
            host.style.left = `${Math.max(0, Math.min(window.innerWidth - rect.width, e.clientX - offsetX))}px`
            host.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offsetY))}px`
            host.style.right = 'auto'
            host.style.bottom = 'auto'
        }
        const onUp = (): void => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            this.dragCleanup = null
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        this.dragCleanup = onUp
    }
}
