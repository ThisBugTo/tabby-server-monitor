import { Component, Injector } from '@angular/core'
import { BaseTabComponent, ConfigService } from 'tabby-core'
import { MonitorTarget } from '../interfaces'
import { MonitorService } from '../services/monitor.service'
import { MONITOR_ICON_SVG } from '../icons'

/** @hidden */
@Component({
    selector: 'sm-monitor-tab',
    template: `
        <div class="sm-wrap">
            <div class="sm-toolbar">
                <strong>服务器状态监控</strong>
                <span class="sm-muted" *ngIf="monitor.lastRefresh">
                    最后刷新 {{ monitor.lastRefresh | date: 'HH:mm:ss' }}
                </span>
                <span class="sm-muted">每 {{ intervalSeconds }}s 刷新</span>
                <button class="btn btn-sm btn-secondary" (click)='refreshNow()'>立即刷新</button>
            </div>

            <div class="sm-grid" *ngIf="monitor.targets$ | async as targets">
                <sm-monitor-card *ngFor="let t of targets; trackBy: trackTarget" [target]='t'></sm-monitor-card>

                <div class="sm-empty" *ngIf="!targets.length">
                    当前没有可监控的目标。<br>
                    在「设置 → 服务器监控」中启用本地监控，或打开一个 SSH 连接标签页后，这里会自动显示其 CPU、内存、GPU、磁盘和负载。
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; height: 100%; overflow: auto; }
        .sm-wrap { padding: 12px 16px; }
        .sm-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .sm-toolbar .sm-muted { margin-right: auto; }
        .sm-muted { opacity: .6; font-size: 12px; }
        .sm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; }
        .sm-empty { opacity: .7; line-height: 1.8; padding: 24px; text-align: center; }
    `],
})
export class MonitorTabComponent extends BaseTabComponent {
    constructor (
        public monitor: MonitorService,
        public config: ConfigService,
        injector: Injector,
    ) {
        super(injector)
        this.setTitle('服务器监控')
        this.icon = MONITOR_ICON_SVG
    }

    get intervalSeconds (): number {
        return Math.max(2, this.config.store.serverMonitor?.refreshInterval ?? 5)
    }

    refreshNow (): void {
        this.monitor.refresh()
    }

    trackTarget (index: number, target: MonitorTarget): string {
        return target.id
    }
}
