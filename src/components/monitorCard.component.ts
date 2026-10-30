import { Component, Input } from '@angular/core'
import { MonitorTarget } from '../interfaces'
import { MonitorService } from '../services/monitor.service'

/** 单个监控目标的卡片视图（监控标签页与浮动面板共用） */
@Component({
    selector: 'sm-monitor-card',
    template: `
        <div class="sm-card" *ngIf="target as t">
            <div class="sm-card-head">
                <span class="sm-badge" [class.sm-badge-local]='t.kind === "local"'>
                    {{ t.kind === 'local' ? '本机' : 'SSH' }}
                </span>
                <span class="sm-label" [title]='t.label'>{{ t.label }}</span>
                <span class="sm-muted sm-time" *ngIf="t.lastUpdated">{{ relTime(t.lastUpdated) }}</span>
            </div>

            <div class="sm-error" *ngIf="t.error">⚠ {{ t.error }}</div>

            <ng-container *ngIf="t.stats">
                <div class="sm-row" *ngIf="t.stats.cpuPercent !== null">
                    <span class="sm-key">CPU</span>
                    <div class="sm-bar"><div class="sm-fill"
                        [style.width.%]='t.stats.cpuPercent'
                        [style.background]='barColor(t.stats.cpuPercent)'></div></div>
                    <span class="sm-val">{{ fmt1(t.stats.cpuPercent) }}%</span>
                </div>

                <div class="sm-row" *ngIf="t.stats.mem as mem">
                    <span class="sm-key">内存</span>
                    <div class="sm-bar"><div class="sm-fill"
                        [style.width.%]='percent(mem.used, mem.total)'
                        [style.background]='barColor(percent(mem.used, mem.total))'></div></div>
                    <span class="sm-val">{{ fmtBytes(mem.used) }}/{{ fmtBytes(mem.total) }}</span>
                </div>

                <div class="sm-row" *ngIf="t.stats.swap as swap">
                    <ng-container *ngIf="swap.total > 0">
                        <span class="sm-key">交换</span>
                        <div class="sm-bar"><div class="sm-fill"
                            [style.width.%]='percent(swap.used, swap.total)'
                            [style.background]='barColor(percent(swap.used, swap.total))'></div></div>
                        <span class="sm-val">{{ fmtBytes(swap.used) }}/{{ fmtBytes(swap.total) }}</span>
                    </ng-container>
                </div>

                <div class="sm-row" *ngIf="t.stats.disk as disk">
                    <span class="sm-key">磁盘</span>
                    <div class="sm-bar"><div class="sm-fill"
                        [style.width.%]='disk.usedPercent'
                        [style.background]='barColor(disk.usedPercent)'></div></div>
                    <span class="sm-val" [title]='disk.mount'>
                        {{ fmtBytes(disk.used) }}/{{ fmtBytes(disk.total) }}
                    </span>
                </div>

                <ng-container *ngIf="t.stats.loadAvg as load">
                    <div class="sm-row">
                        <span class="sm-key">负载</span>
                        <span class="sm-muted">1 / 5 / 15 分钟平均值</span>
                    </div>
                    <div class="sm-row" *ngFor="let row of loadRows(load, t.stats.cpuCores)">
                        <span class="sm-key sm-key-sub">{{ row.label }}</span>
                        <div class="sm-bar"><div class="sm-fill"
                            [style.width.%]='row.percent'
                            [style.background]='barColor(row.percent)'></div></div>
                        <span class="sm-val">{{ row.value }}</span>
                    </div>
                    <div class="sm-note sm-muted" *ngIf="t.stats.cpuCores">
                        负载 = 平均等待运行的任务数，{{ t.stats.cpuCores }} 核 CPU 达到 {{ t.stats.cpuCores }} 即满载（100%）
                    </div>
                </ng-container>

                <div class="sm-gpu" *ngFor="let gpu of t.stats.gpus">
                    <div class="sm-row">
                        <span class="sm-key" [title]='gpu.name'>GPU{{ gpu.index }}</span>
                        <div class="sm-bar"><div class="sm-fill"
                            [style.width.%]='gpu.utilPercent ?? 0'
                            [style.background]='barColor(gpu.utilPercent ?? 0)'></div></div>
                        <span class="sm-val">
                            {{ fmt1(gpu.utilPercent) }}%
                            <ng-container *ngIf="gpu.memUsedMB !== null && gpu.memTotalMB">
                                · {{ gpu.memUsedMB }}/{{ gpu.memTotalMB }}MB
                            </ng-container>
                            <ng-container *ngIf="gpu.temperature !== null"> · {{ gpu.temperature }}°C</ng-container>
                            <ng-container *ngIf="gpu.powerDraw !== null"> · {{ fmt1(gpu.powerDraw) }}W</ng-container>
                        </span>
                    </div>
                    <div class="sm-gpu-name sm-muted">{{ gpu.name }}</div>
                </div>

                <div class="sm-footer sm-muted">
                    <span *ngIf="t.stats.uptimeSeconds !== null">已运行 {{ fmtUptime(t.stats.uptimeSeconds) }}</span>
                    <span *ngIf="t.stats.cpuCores">· {{ t.stats.cpuCores }} 核</span>
                </div>
            </ng-container>
        </div>
    `,
    styles: [`
        .sm-card {
            background: rgba(127, 127, 127, .12);
            border: 1px solid rgba(127, 127, 127, .25);
            border-radius: 8px;
            padding: 10px 12px;
        }
        .sm-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .sm-badge {
            font-size: 11px; padding: 1px 6px; border-radius: 4px;
            background: rgba(76, 175, 80, .25); color: #81c784;
        }
        .sm-badge-local { background: rgba(33, 150, 243, .25); color: #64b5f6; }
        .sm-label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sm-time { margin-left: auto; }
        .sm-muted { opacity: .6; font-size: 12px; }
        .sm-error { color: #e57373; font-size: 12px; margin: 4px 0; }
        .sm-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
        .sm-key { width: 42px; flex: none; font-size: 12px; opacity: .8; }
        .sm-key-sub { width: 42px; padding-left: 8px; opacity: .65; }
        .sm-bar {
            flex: 1; height: 8px; border-radius: 4px;
            background: rgba(127, 127, 127, .2); overflow: hidden;
        }
        .sm-fill { height: 100%; border-radius: 4px; transition: width .4s; }
        .sm-val { font-size: 12px; font-variant-numeric: tabular-nums; flex: none; max-width: 55%; text-align: right; }
        .sm-gpu { margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(127, 127, 127, .25); }
        .sm-gpu-name { font-size: 11px; padding-left: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sm-footer { margin-top: 8px; font-size: 11px; }
        .sm-note { margin-top: 4px; font-size: 11px; }
    `],
})
export class MonitorCardComponent {
    @Input() target: MonitorTarget|null = null

    constructor (public monitor: MonitorService) { }

    percent (used?: number, total?: number): number {
        if (used === undefined || !total) {
            return 0
        }
        return Math.max(0, Math.min(100, used / total * 100))
    }

    fmt1 (value: number|null|undefined): string {
        return value === null || value === undefined ? '-' : value.toFixed(1)
    }

    fmtBytes (bytes: number|null|undefined): string {
        if (bytes === null || bytes === undefined) {
            return '-'
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
        let value = bytes
        let unit = 0
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024
            unit++
        }
        return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)}${units[unit]}`
    }

    fmtUptime (seconds: number): string {
        const d = Math.floor(seconds / 86400)
        const h = Math.floor((seconds % 86400) / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        if (d > 0) {
            return `${d}天${h}小时`
        }
        if (h > 0) {
            return `${h}小时${m}分`
        }
        return `${m}分钟`
    }

    relTime (ts: number): string {
        const delta = Math.max(0, Math.round((Date.now() - ts) / 1000))
        if (delta < 5) {
            return '刚刚'
        }
        return `${delta}s前`
    }

    /** 负载三行：1/5/15 分钟，按核数换算满载百分比 */
    loadRows (load: [number, number, number], cores: number|null): { label: string, value: string, percent: number|null }[] {
        const labels = ['1分钟', '5分钟', '15分钟']
        return load.map((v, i) => ({
            label: labels[i],
            value: (typeof v === 'number' && !isNaN(v)) ? v.toFixed(2) : '-',
            percent: (cores && typeof v === 'number' && !isNaN(v))
                ? Math.max(0, Math.min(100, v / cores * 100))
                : null,
        }))
    }

    barColor (percent: number|null|undefined): string {
        const p = percent ?? 0
        if (p >= 90) {
            return '#e57373'
        }
        if (p >= 70) {
            return '#ffb74d'
        }
        return '#81c784'
    }
}
