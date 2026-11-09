import { SettingsTabProvider } from 'tabby-settings'
import { MonitorSettingsComponent } from './components/monitorSettings.component'

/** @hidden */
export class MonitorSettingsTabProvider extends SettingsTabProvider {
    id = 'server-monitor'
    // 设置侧边栏以 `fa-{{icon}}` 渲染（Font Awesome 类名），不能传 SVG
    icon = 'server'
    title = '服务器监控'

    getComponentType (): any {
        return MonitorSettingsComponent
    }
}
