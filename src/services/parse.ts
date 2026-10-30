import { GPUInfo } from '../interfaces'

/** 解析 /proc/stat 首行：cpu user nice system idle iowait irq softirq ... */
export function parseCpuStatLine (line: string): { total: number, idle: number }|null {
    const parts = line.trim().split(/\s+/)
    if (parts[0] !== 'cpu') {
        return null
    }
    const nums = parts.slice(1).map(x => parseInt(x, 10) || 0)
    const total = nums.reduce((a, b) => a + b, 0)
    const idle = (nums[3] ?? 0) + (nums[4] ?? 0) // idle + iowait
    return { total, idle }
}

export function cpuPercentBetween (first: { total: number, idle: number }|null, second: { total: number, idle: number }|null): number|null {
    if (!first || !second) {
        return null
    }
    const total = second.total - first.total
    const idle = second.idle - first.idle
    if (total <= 0) {
        return null
    }
    return Math.max(0, Math.min(100, (total - idle) / total * 100))
}

/** 解析 /proc/meminfo */
export function parseMeminfo (text: string): Record<string, number> {
    const result: Record<string, number> = {}
    for (const line of text.split('\n')) {
        const m = line.match(/^(\w+):\s+(\d+)/)
        if (m) {
            result[m[1]] = parseInt(m[2], 10) * 1024 // kB → bytes
        }
    }
    return result
}

export function memFromMeminfo (info: Record<string, number>): { total: number, used: number, available: number }|null {
    const total = info['MemTotal']
    if (!total) {
        return null
    }
    const available = info['MemAvailable']
        ?? ((info['MemFree'] ?? 0) + (info['Buffers'] ?? 0) + (info['Cached'] ?? 0))
    return { total, available, used: Math.max(0, total - available) }
}

export function swapFromMeminfo (info: Record<string, number>): { total: number, used: number }|null {
    const total = info['SwapTotal']
    const free = info['SwapFree']
    if (total === undefined || free === undefined) {
        return null
    }
    return { total, used: Math.max(0, total - free) }
}

/** 解析 `df -kP <mount>` 的数据行（单位 kB） */
export function parseDfLine (line: string): { mount: string, total: number, used: number, usedPercent: number }|null {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6) {
        return null
    }
    const blocks = parseInt(parts[1], 10)
    const used = parseInt(parts[2], 10)
    const capacity = parseInt(parts[4], 10)
    if (isNaN(blocks) || isNaN(used)) {
        return null
    }
    return {
        mount: parts[parts.length - 1],
        total: blocks * 1024,
        used: used * 1024,
        usedPercent: isNaN(capacity) ? 0 : capacity,
    }
}

/** 解析 nvidia-smi --format=csv,noheader,nounits 输出 */
export function parseGpuCsv (text: string): GPUInfo[] {
    const gpus: GPUInfo[] = []
    const num = (s: string): number|null => {
        const cleaned = (s ?? '').trim().replace(/^\[|\]$/g, '')
        if (!cleaned || cleaned.toUpperCase().includes('N/A')) {
            return null
        }
        const v = parseFloat(cleaned)
        return isNaN(v) ? null : v
    }
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim()
        if (!line || /no gpu|not found|command not found/i.test(line)) {
            continue
        }
        const cols = line.split(',').map(x => x.trim())
        if (cols.length < 6) {
            continue
        }
        const index = parseInt(cols[0], 10)
        if (isNaN(index)) {
            continue
        }
        gpus.push({
            index,
            name: cols[1] || `GPU ${index}`,
            utilPercent: num(cols[2]),
            memUsedMB: num(cols[3]),
            memTotalMB: num(cols[4]),
            temperature: num(cols[5]),
            fanSpeed: cols.length > 6 ? num(cols[6]) : null,
            powerDraw: cols.length > 7 ? num(cols[7]) : null,
        })
    }
    return gpus
}

export const NVIDIA_SMI_ARGS = [
    '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,fan.speed,power.draw',
    '--format=csv,noheader,nounits',
]

/**
 * 以下为 macOS（Darwin）解析器，采集命令均为普通用户可执行的只读命令：
 * top -l 2 / vm_stat / sysctl
 */

/** 解析 `top -l 2` 输出中的 CPU 行："CPU usage: 5.23% user, 6.78% sys, 88.99% idle" */
export function parseMacTopCpuLine (line: string): number|null {
    const m = line.match(/([\d.]+)%\s*idle/i)
    if (!m) {
        return null
    }
    const idle = parseFloat(m[1])
    if (isNaN(idle)) {
        return null
    }
    return Math.max(0, Math.min(100, 100 - idle))
}

/**
 * 解析 macOS 内存：首行为 sysctl hw.memsize（总字节），其余为 vm_stat 输出。
 * 已用 = active + wired + compressor 页（与系统监视器口径近似）
 */
export function parseMacMem (text: string): { total: number, used: number, available: number }|null {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const total = parseInt(lines[0] ?? '', 10)
    if (!total) {
        return null
    }
    let pageSize = 4096
    const ps = (lines.find(l => l.includes('page size of')) ?? '').match(/page size of (\d+)/)
    if (ps) {
        pageSize = parseInt(ps[1], 10)
    }
    const pages = (prefix: string): number => {
        const line = lines.find(l => l.startsWith(prefix)) ?? ''
        const m = line.match(/(\d+)/)
        return m ? parseInt(m[1], 10) : 0
    }
    const usedPages = pages('Pages active:') + pages('Pages wired down:') + pages('Pages occupied by compressor:')
    const used = Math.min(total, usedPages * pageSize)
    return { total, used, available: Math.max(0, total - used) }
}

/** 解析 `sysctl vm.swapusage`："total = 4096.00M used = 512.50M" */
export function parseMacSwap (text: string): { total: number, used: number }|null {
    const conv = (v: string, unit: string): number => {
        const n = parseFloat(v)
        switch (unit.toUpperCase()) {
            case 'K': return n * 1024
            case 'M': return n * 1024 * 1024
            case 'G': return n * 1024 * 1024 * 1024
            default: return n
        }
    }
    const t = text.match(/total\s*=\s*([\d.]+)\s*([KMG]?)/i)
    const u = text.match(/used\s*=\s*([\d.]+)\s*([KMG]?)/i)
    if (!t) {
        return null
    }
    return { total: conv(t[1], t[2] ?? ''), used: u ? conv(u[1], u[2] ?? '') : 0 }
}

/** 解析 `sysctl vm.loadavg`："{ 1.90 2.10 2.50 }" */
export function parseMacLoadavg (text: string): [number, number, number]|null {
    const nums = (text.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3)
    if (nums.length < 3 || nums.some(x => isNaN(x))) {
        return null
    }
    return [nums[0], nums[1], nums[2]]
}

/** 解析 `sysctl kern.boottime`："{ sec = 1699999999, usec = 123456 }" → 已运行秒数 */
export function parseMacUptime (text: string): number|null {
    const m = text.match(/sec\s*=\s*(\d+)/)
    if (!m) {
        return null
    }
    const bootSec = parseInt(m[1], 10)
    const up = Math.floor(Date.now() / 1000) - bootSec
    return up > 0 ? up : null
}
