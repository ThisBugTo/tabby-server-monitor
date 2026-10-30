import { HotkeyProvider, HotkeyDescription } from 'tabby-core'

/** @hidden */
export class MonitorHotkeysProvider extends HotkeyProvider {
    provide (): Promise<HotkeyDescription[]> {
        return Promise.resolve([
            { id: 'open-server-monitor', name: '打开服务器状态监控' },
        ])
    }
}
