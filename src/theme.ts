import { ThemesService } from 'tabby-core'

/** 颜色平均通道亮度（0-255），支持 #rgb / #rrggbb / rgb(r, g, b)；无法解析返回 null */
function brightness (value: string): number|null {
    const v = (value ?? '').trim()
    const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (hex) {
        let h = hex[1]
        if (h.length === 3) {
            h = h.split('').map(c => c + c).join('')
        }
        const n = parseInt(h, 16)
        return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3
    }
    const rgb = v.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i)
    if (rgb) {
        return (parseInt(rgb[1], 10) + parseInt(rgb[2], 10) + parseInt(rgb[3], 10)) / 3
    }
    return null
}

/**
 * 当前是否亮色主题，用于让监控界面跟随 Tabby 亮/暗色切换。
 * 优先读主题写入 <html> 的 CSS 变量（亮暗切换时会重新计算）：
 *   --theme-bg：主题跟随配色方案时由 ThemesService 写入的界面背景色；
 *   --body-bg：始终写入的活动背景色。
 * 取不到时回退到 Tabby 活动配色方案的背景色；仍无法判定时按暗色（保持原外观）。
 */
export function isLightTheme (themes: ThemesService): boolean {
    try {
        const css = getComputedStyle(document.documentElement)
        for (const name of ['--theme-bg', '--body-bg']) {
            const b = brightness(css.getPropertyValue(name))
            if (b !== null) {
                return b > 128
            }
        }
        const scheme = themes?._getActiveColorScheme?.()
        const b = brightness(scheme?.background ?? '')
        if (b !== null) {
            return b > 128
        }
    } catch {
        // 读取失败按暗色处理
    }
    return false
}
