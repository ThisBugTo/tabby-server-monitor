import * as os from 'os'
import { execFile } from 'child_process'
import { Platform } from 'tabby-core'
import { ServerStats } from '../interfaces'
import { cpuPercentBetween, parseCpuStatLine, parseDfLine, parseGpuCsv, NVIDIA_SMI_ARGS } from './parse'

interface CpuSample { total: number, idle: number }

let gpuDisabledUntil = 0

function sampleCpu (): CpuSample {
    let total = 0
    let idle = 0
    for (const cpu of os.cpus()) {
        for (const t of Object.values(cpu.times)) {
            total += t
        }
        idle += cpu.times.idle
    }
    return { total, idle }
}

function execFileAsync (cmd: string, args: string[], timeout = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => {
            if (err) {
                reject(err)
            } else {
                resolve(stdout)
            }
        })
    })
}

/** 本地磁盘（macOS/Linux）；Windows 暂不采集 */
async function probeLocalDisk (): Promise<ServerStats['disk']|null> {
    const out = await execFileAsync('df', ['-kP', '/'])
    const line = out.split('\n').filter(x => x.trim()).pop() ?? ''
    return parseDfLine(line)
}

/** 本机 GPU：尝试 nvidia-smi（Linux/Windows），失败则视为无 GPU */
async function probeLocalGPU (): Promise<ServerStats['gpus']> {
    if (Date.now() < gpuDisabledUntil) {
        return []
    }
    try {
        const out = await execFileAsync('nvidia-smi', NVIDIA_SMI_ARGS)
        return parseGpuCsv(out)
    } catch {
        // 常见于无 NVIDIA 驱动 / macOS，10 分钟内不再尝试
        gpuDisabledUntil = Date.now() + 10 * 60 * 1000
        return []
    }
}

/** 采集本机状态 */
export async function probeLocal (platform: Platform): Promise<ServerStats> {
    const first = sampleCpu()
    await new Promise(resolve => setTimeout(resolve, 900))
    const second = sampleCpu()
    const cpuPercent = cpuPercentBetween(first, second)

    const memTotal = os.totalmem()
    const memFree = os.freemem()

    let disk: ServerStats['disk'] = null
    let gpus: ServerStats['gpus'] = []
    if (platform !== Platform.Web) {
        disk = await probeLocalDisk().catch(() => null)
        gpus = await probeLocalGPU().catch(() => [])
    }

    return {
        hostname: os.hostname(),
        cpuCores: os.cpus().length,
        cpuPercent: cpuPercent === null ? null : +cpuPercent.toFixed(1),
        loadAvg: os.loadavg() as [number, number, number],
        mem: { total: memTotal, available: memFree, used: memTotal - memFree },
        swap: null,
        disk,
        uptimeSeconds: Math.floor(os.uptime()),
        gpus,
    }
}
