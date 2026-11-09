import { Component } from '@angular/core'
import { ConfigService } from 'tabby-core'

/** @hidden */
@Component({
    selector: 'sm-monitor-settings',
    template: `
        <h3>服务器状态监控</h3>

        <div class="sm-section">
            <checkbox
                text='启用服务器状态监控'
                [(ngModel)]='config.store.serverMonitor.enabled'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='监控本机'
                [(ngModel)]='config.store.serverMonitor.monitorLocal'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='自动监控已打开的 SSH 标签页'
                [(ngModel)]='config.store.serverMonitor.monitorSSHTabs'
                (ngModelChange)='config.save()'
            ></checkbox>
        </div>

        <h4>展示设置</h4>
        <div class="sm-section">
            <checkbox
                text='显示公网 IP'
                [(ngModel)]='config.store.serverMonitor.display.publicIp'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示 CPU'
                [(ngModel)]='config.store.serverMonitor.display.cpu'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示内存'
                [(ngModel)]='config.store.serverMonitor.display.mem'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示交换分区'
                [(ngModel)]='config.store.serverMonitor.display.swap'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示磁盘（全部挂载点）'
                [(ngModel)]='config.store.serverMonitor.display.disk'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示负载'
                [(ngModel)]='config.store.serverMonitor.display.load'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示进程 Top5（CPU / 内存）'
                [(ngModel)]='config.store.serverMonitor.display.procs'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示运行时长与核数'
                [(ngModel)]='config.store.serverMonitor.display.uptime'
                (ngModelChange)='config.save()'
            ></checkbox>
        </div>

        <div class="sm-section form-inline">
            <label>占用条颜色</label>
            <select class='form-control form-control-sm sm-select'
                [(ngModel)]='config.store.serverMonitor.barColorMode'
                (ngModelChange)='config.save()'>
                <option value='auto'>自动（按占用分级：绿 / 橙 / 红）</option>
                <option value='custom'>自定义颜色</option>
            </select>
            <input *ngIf='config.store.serverMonitor.barColorMode === "custom"'
                type='color' class='sm-color'
                [(ngModel)]='config.store.serverMonitor.barColorCustom'
                (ngModelChange)='config.save()' />
        </div>

        <div class="sm-section form-inline">
            <label>刷新间隔（秒）</label>
            <input type='number' class='form-control form-control-sm' min='2' max='300'
                [(ngModel)]='config.store.serverMonitor.refreshInterval' (change)='config.save()' />
        </div>

        <div class="sm-section form-inline">
            <label>CPU 采样窗口（秒）</label>
            <input type='number' class='form-control form-control-sm' min='1' max='10'
                [(ngModel)]='config.store.serverMonitor.cpuSampleSeconds' (change)='config.save()' />
        </div>

        <div class="sm-section form-inline">
            <label>远端磁盘挂载点</label>
            <input type='text' class='form-control form-control-sm'
                [(ngModel)]='config.store.serverMonitor.diskMount' (change)='config.save()' />
        </div>

        <h4>告警阈值（%，0 = 关闭）</h4>
        <div class="sm-section form-inline">
            <label>CPU</label>
            <input type='number' class='form-control form-control-sm' min='0' max='100'
                [(ngModel)]='config.store.serverMonitor.thresholds.cpu' (change)='config.save()' />

            <label>内存</label>
            <input type='number' class='form-control form-control-sm' min='0' max='100'
                [(ngModel)]='config.store.serverMonitor.thresholds.memory' (change)='config.save()' />

            <label>磁盘</label>
            <input type='number' class='form-control form-control-sm' min='0' max='100'
                [(ngModel)]='config.store.serverMonitor.thresholds.disk' (change)='config.save()' />
        </div>

        <div class="sm-section form-inline">
            <label>告警冷却（秒）</label>
            <input type='number' class='form-control form-control-sm' min='0'
                [(ngModel)]='config.store.serverMonitor.alertCooldown' (change)='config.save()' />
        </div>

        <div class="sm-notes">
            <p>说明：</p>
            <ul>
                <li>SSH 监控通过当前已打开的 SSH 会话执行只读命令（Linux 读 /proc，macOS 用 sysctl/vm_stat/top），不影响终端中的交互会话，也无需 sudo。</li>
                <li>远端需为 Linux 或 macOS；不采集 GPU 数据（显卡品牌繁多，无法统一匹配）。</li>
                <li>公网 IP 约 15 分钟采集一次、进程 Top5 约 30 秒一次，均不随刷新间隔频繁执行，避免影响系统性能。</li>
                <li>可通过快捷键设置中的「打开服务器状态监控」绑定快捷键快速打开面板。</li>
            </ul>
        </div>
    `,
    styles: [`
        .sm-section { margin: 12px 0; }
        .sm-section label { min-width: 130px; margin-right: 8px; }
        .sm-section input[type=number] { width: 100px; margin-right: 16px; }
        .sm-section input[type=text] { width: 200px; }
        .form-inline { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 0; }
        .sm-select { width: 260px; margin-right: 8px; }
        .sm-color {
            width: 64px; height: 30px; padding: 2px;
            border: 1px solid rgba(127, 127, 127, .4); border-radius: 4px;
            background: transparent; cursor: pointer;
        }
        .sm-notes { opacity: .7; font-size: 12px; margin-top: 16px; }
        .sm-notes code { padding: 0 4px; }
    `],
})
export class MonitorSettingsComponent {
    constructor (public config: ConfigService) {
        // 兼容旧配置：补齐新增字段（下次 config.save() 时随配置持久化）
        const s = this.config.store.serverMonitor
        if (s) {
            if (!s.display) {
                s.display = {
                    publicIp: true,
                    cpu: true,
                    mem: true,
                    swap: true,
                    disk: true,
                    load: true,
                    procs: true,
                    uptime: true,
                }
            }
            if (!s.thresholds) {
                s.thresholds = {}
            }
            if (!s.barColorMode) {
                s.barColorMode = 'auto'
            }
            if (!s.barColorCustom) {
                s.barColorCustom = '#81c784'
            }
        }
    }
}
