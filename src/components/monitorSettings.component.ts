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

            <label>GPU</label>
            <input type='number' class='form-control form-control-sm' min='0' max='100'
                [(ngModel)]='config.store.serverMonitor.thresholds.gpu' (change)='config.save()' />

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
                <li>远端需为 Linux 或 macOS；GPU 监控（NVIDIA）需安装 nvidia-smi（仅 Linux 常见）。</li>
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
        .sm-notes { opacity: .7; font-size: 12px; margin-top: 16px; }
        .sm-notes code { padding: 0 4px; }
    `],
})
export class MonitorSettingsComponent {
    constructor (public config: ConfigService) { }
}
