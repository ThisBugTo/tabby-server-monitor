import { SettingsTabProvider } from 'tabby-settings'
import { MonitorSettingsComponent } from './components/monitorSettings.component'
import { MONITOR_ICON_SVG } from './icons'

/** @hidden */
export class MonitorSettingsTabProvider extends SettingsTabProvider {
    id = 'server-monitor'
    icon = MONITOR_ICON_SVG
    title = '服务器监控'

    getComponentType (): any {
        return MonitorSettingsComponent
    }
}
