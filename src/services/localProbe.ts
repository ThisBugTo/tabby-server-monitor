import * as os from 'os'
import { execFile } from 'child_process'
import { Platform } from 'tabby-core'
import { DiskInfo, ProbeExtra, ProcInfo, ServerStats } from '../interfaces'
import { cpuPercentBetween, parseDf, parsePsOutput, pickDisk, topProcs } from './parse'
import { fetchLocalPublicIp } from './publicIp'

interface CpuSample { total: number, idle: number }

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

/** 本地全部挂载点（df -h 式，macOS/Linux）；Windows 暂不采集 */
async function probeLocalDisks (): Promise<DiskInfo[]> {
    const out = await execFileAsync('df', ['-kP'])
    return parseDf(out)
}

/** 低频阶段结果（公网 IP / 进程 Top5） */
export interface LocalAuxResult {
    publicIp?: string|null
    cpuTop5?: ProcInfo[]
    memTop5?: ProcInfo[]
}

/**
 * 阶段1：本机核心快数据（CPU 900ms 采样 + 内存 + 全量磁盘）。
 * 公网 IP 与进程 Top5 由 probeLocalAux 按 TTL 单独采集，不阻塞本阶段回填。
 */
export async function probeLocalQuick (platform: Platform): Promise<ServerStats> {
    const first = sampleCpu()
    await new Promise(resolve => setTimeout(resolve, 900))
    const second = sampleCpu()
    const cpuPercent = cpuPercentBetween(first, second)

    const memTotal = os.totalmem()
    const memFree = os.freemem()

    let disks: DiskInfo[] = []
    if (platform !== Platform.Web) {
        disks = await probeLocalDisks().catch(() => [])
    }

    return {
        hostname: os.hostname(),
        cpuCores: os.cpus().length,
        cpuPercent: cpuPercent === null ? null : +cpuPercent.toFixed(1),
        loadAvg: os.loadavg() as [number, number, number],
        mem: { total: memTotal, available: memFree, used: memTotal - memFree },
        swap: null,
        disk: pickDisk(disks, '/'),
        disks,
        uptimeSeconds: Math.floor(os.uptime()),
    }
}

/** 阶段2（按 TTL）：本机公网 IP（IPv4 优先）+ 进程 Top5 */
export async function probeLocalAux (opts: ProbeExtra): Promise<LocalAuxResult> {
    const result: LocalAuxResult = {}
    if (opts.wantIp) {
        result.publicIp = await fetchLocalPublicIp().catch(() => null)
    }
    if (opts.wantProcs) {
        const psOut = await execFileAsync('ps', ['-Ao', 'pid,pcpu,pmem,comm'], 5000).catch(() => '')
        const top = topProcs(parsePsOutput(psOut))
        result.cpuTop5 = top.cpu
        result.memTop5 = top.mem
    }
    return result
}
