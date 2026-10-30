import { Subscription } from 'rxjs'
import { ServerStats, SSHTabSession } from '../interfaces'
import {
    cpuPercentBetween, parseCpuStatLine, parseDfLine, parseGpuCsv, parseMeminfo, memFromMeminfo, NVIDIA_SMI_ARGS,
    swapFromMeminfo, parseMacTopCpuLine, parseMacMem, parseMacSwap, parseMacLoadavg, parseMacUptime,
} from './parse'

const M_OS = '#SM#OS'
const M_HOST = '#SM#HOST'
const M_CPU = '#SM#CPU'
const M_STAT1 = '#SM#STAT1'
const M_STAT2 = '#SM#STAT2'
const M_MEM = '#SM#MEM'
const M_LOAD = '#SM#LOAD'
const M_CORES = '#SM#CORES'
const M_UPTIME = '#SM#UPTIME'
const M_SWAP = '#SM#SWAP'
const M_DISK = '#SM#DISK'
const M_GPU = '#SM#GPU'
const M_END = '#SM#END'

/**
 * 组装远程只读采集命令（跨平台）：
 * 脚本内用 uname -s 自动分支——Linux 读 /proc，macOS 用 sysctl/vm_stat/top -l。
 * 所有命令均为普通用户可执行的只读操作，无需 sudo。
 */
export function buildRemoteCommand (sampleSeconds: number, diskMount: string): string {
    const mount = (diskMount || '/').replace(/'/g, '') || '/'
    const sample = Math.max(1, Math.min(10, Math.round(sampleSeconds)))
    return [
        `echo '${M_OS}'`,
        'uname -s 2>/dev/null',
        `echo '${M_HOST}'`,
        'hostname 2>/dev/null',
        'case "`uname -s 2>/dev/null`" in',
        'Linux)',
        `  echo '${M_STAT1}'`,
        '  head -n 1 /proc/stat 2>/dev/null',
        `  sleep ${sample}`,
        `  echo '${M_STAT2}'`,
        '  head -n 1 /proc/stat 2>/dev/null',
        `  echo '${M_MEM}'`,
        '  cat /proc/meminfo 2>/dev/null',
        `  echo '${M_LOAD}'`,
        '  cat /proc/loadavg 2>/dev/null',
        `  echo '${M_CORES}'`,
        '  nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || true',
        `  echo '${M_UPTIME}'`,
        '  cat /proc/uptime 2>/dev/null',
        '  ;;',
        'Darwin)',
        `  echo '${M_CPU}'`,
        `  top -l 2 -n 0 -s ${sample} 2>/dev/null | grep '^CPU usage' | tail -n 1`,
        `  echo '${M_MEM}'`,
        '  sysctl -n hw.memsize 2>/dev/null',
        '  vm_stat 2>/dev/null',
        `  echo '${M_LOAD}'`,
        '  sysctl -n vm.loadavg 2>/dev/null',
        `  echo '${M_CORES}'`,
        '  sysctl -n hw.ncpu 2>/dev/null',
        `  echo '${M_UPTIME}'`,
        '  sysctl -n kern.boottime 2>/dev/null',
        `  echo '${M_SWAP}'`,
        '  sysctl -n vm.swapusage 2>/dev/null',
        '  ;;',
        '*)',
        `  echo '${M_END}'`,
        '  exit 0',
        '  ;;',
        'esac',
        `echo '${M_DISK}'`,
        `df -kP '${mount}' 2>/dev/null | tail -n 1`,
        `echo '${M_GPU}'`,
        `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,fan.speed,power.draw --format=csv,noheader,nounits 2>/dev/null || true`,
        `echo '${M_END}'`,
    ].join('\n')
}

/** 通过 russh 通道执行命令并收集输出（不经过用户终端，不影响交互会话） */
export async function execRemoteCommand (sshSession: SSHTabSession, command: string, timeoutMs = 25000): Promise<string> {
    const ssh = sshSession.ssh
    if (!ssh) {
        throw new Error('SSH 连接尚未就绪')
    }
    const ch = await ssh.activateChannel(await ssh.openSessionChannel())
    try {
        return await new Promise<string>((resolve, reject) => {
            const chunks: Uint8Array[] = []
            const subs: Subscription[] = []
            let settled = false
            const textSoFar = (): string => Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8')
            const finish = (err?: Error): void => {
                if (settled) {
                    return
                }
                settled = true
                clearTimeout(timer)
                subs.forEach(s => s.unsubscribe())
                if (err) {
                    reject(err)
                } else {
                    resolve(textSoFar())
                }
            }
            const timer = setTimeout(() => finish(new Error('远程采集命令超时')), timeoutMs)
            subs.push(ch.data$.subscribe(d => {
                chunks.push(d)
                // 收到结束标记即完成，不依赖 eof（某些服务器不发送 eof）
                if (textSoFar().includes(M_END)) {
                    finish()
                }
            }))
            subs.push(ch.eof$.subscribe(() => finish()))
            subs.push(ch.closed$.subscribe(() => finish()))
            // 关键：把命令真正发送到远端执行
            ch.requestExec(command).catch(err => finish(err instanceof Error ? err : new Error(String(err))))
        })
    } finally {
        ch.close().catch(() => undefined)
    }
}

function section (out: string, startMark: string, endMark: string): string {
    const i = out.indexOf(startMark)
    if (i < 0) {
        return ''
    }
    const start = i + startMark.length
    const j = out.indexOf(endMark, start)
    return out.slice(start, j < 0 ? undefined : j).trim()
}

function firstLine (text: string): string {
    return (text.split('\n')[0] ?? '').trim()
}

/** 解析 Linux（/proc）采集输出 */
function parseLinuxOutput (out: string): ServerStats|null {
    const stat1 = parseCpuStatLine(section(out, M_STAT1, M_STAT2))
    const stat2 = parseCpuStatLine(section(out, M_STAT2, M_MEM))
    if (!stat1 && !section(out, M_MEM, M_LOAD)) {
        return null
    }
    const meminfo = parseMeminfo(section(out, M_MEM, M_LOAD))
    const loadParts = firstLine(section(out, M_LOAD, M_CORES)).split(/\s+/).map(Number)
    const cores = parseInt(firstLine(section(out, M_CORES, M_UPTIME)), 10)
    const uptime = parseFloat(firstLine(section(out, M_UPTIME, M_DISK)))
    const cpuPercent = cpuPercentBetween(stat1, stat2)
    return {
        hostname: firstLine(section(out, M_HOST, M_CPU)) || firstLine(section(out, M_HOST, M_STAT1)) || null,
        cpuCores: isNaN(cores) ? null : cores,
        cpuPercent: cpuPercent === null ? null : +cpuPercent.toFixed(1),
        loadAvg: loadParts.length >= 3 && loadParts.slice(0, 3).every(x => !isNaN(x))
            ? [loadParts[0], loadParts[1], loadParts[2]]
            : null,
        mem: memFromMeminfo(meminfo),
        swap: swapFromMeminfo(meminfo),
        disk: parseDfLine(firstLine(section(out, M_DISK, M_GPU))),
        uptimeSeconds: isNaN(uptime) ? null : Math.floor(uptime),
        gpus: [],
    }
}

/** 解析 macOS（Darwin）采集输出 */
function parseDarwinOutput (out: string): ServerStats|null {
    const cpuSection = section(out, M_CPU, M_MEM)
    const memSection = section(out, M_MEM, M_LOAD)
    if (!cpuSection && !memSection) {
        return null
    }
    const loadParts = (section(out, M_LOAD, M_CORES).match(/[\d.]+/g) ?? []).map(Number).slice(0, 3)
    const cores = parseInt(firstLine(section(out, M_CORES, M_UPTIME)), 10)
    const uptime = parseMacUptime(section(out, M_UPTIME, M_SWAP))
    return {
        hostname: firstLine(section(out, M_HOST, M_CPU)) || null,
        cpuCores: isNaN(cores) ? null : cores,
        cpuPercent: parseMacTopCpuLine(cpuSection),
        loadAvg: loadParts.length >= 3 && loadParts.every(x => !isNaN(x))
            ? [loadParts[0], loadParts[1], loadParts[2]]
            : null,
        mem: parseMacMem(memSection),
        swap: parseMacSwap(section(out, M_SWAP, M_DISK)),
        disk: parseDfLine(firstLine(section(out, M_DISK, M_GPU))),
        uptimeSeconds: uptime,
        gpus: [],
    }
}

/** 解析远程采集命令输出（自动按 OS 分支） */
export function parseRemoteOutput (out: string): ServerStats|null {
    const os = firstLine(section(out, M_OS, M_HOST))
    if (/darwin/i.test(os)) {
        return parseDarwinOutput(out)
    }
    if (/linux/i.test(os)) {
        return parseLinuxOutput(out)
    }
    return null
}

/** 对某个 SSH 会话执行一次远程采集 */
export async function probeSSH (sshSession: SSHTabSession, sampleSeconds: number, diskMount: string): Promise<ServerStats> {
    if (!sshSession.open) {
        throw new Error('SSH 会话未连接')
    }
    const out = await execRemoteCommand(sshSession, buildRemoteCommand(sampleSeconds, diskMount))
    const stats = parseRemoteOutput(out)
    if (!stats) {
        throw new Error('远程系统不受支持或采集失败（需 Linux 或 macOS，普通用户可读即可）')
    }
    return stats
}
