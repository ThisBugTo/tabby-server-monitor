import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, { ConfigProvider, HotkeyProvider, ToolbarButtonProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { MonitorConfigProvider } from './config'
import { MonitorHotkeysProvider } from './hotkeys'
import { MonitorButtonProvider } from './buttonProvider'
import { MonitorSettingsTabProvider } from './settings'
import { MonitorService } from './services/monitor.service'
import { MonitorTabComponent } from './components/monitorTab.component'
import { MonitorSettingsComponent } from './components/monitorSettings.component'
import { MonitorCardComponent } from './components/monitorCard.component'
import { MonitorOverlayComponent } from './components/monitorOverlay.component'

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: MonitorConfigProvider, multi: true },
        { provide: HotkeyProvider, useClass: MonitorHotkeysProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: MonitorButtonProvider, multi: true },
        { provide: SettingsTabProvider, useClass: MonitorSettingsTabProvider, multi: true },
        MonitorService,
    ],
    declarations: [
        MonitorTabComponent,
        MonitorSettingsComponent,
        MonitorCardComponent,
        MonitorOverlayComponent,
    ],
})
export default class ServerMonitorModule { }

export { MonitorTabComponent, MonitorService, MonitorCardComponent, MonitorOverlayComponent }
