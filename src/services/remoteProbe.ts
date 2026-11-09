import { Subscription } from 'rxjs'
import { ProbeExtra, ProcInfo, ServerStats, SSHTabSession } from '../interfaces'
import {
    cpuPercentBetween, parseCpuStatLine, parseDf, parseMeminfo, memFromMeminfo,
    swapFromMeminfo, parseMacTopCpuLine, parseMacMem, parseMacSwap, parseMacLoadavg, parseMacUptime,
    isValidIp, parsePsOutput, pickDisk, topProcs,
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
const M_IP = '#SM#IP'
const M_PS = '#SM#PS'
const M_END = '#SM#END'

/**
 * 采集分三个阶段，先查到的先回填（不互相等待）：
 * 1. 快数据：无 sleep、无外网请求——磁盘/内存/负载等连接后立即展示；
 * 2. CPU 补采：本地等待采样窗口（Linux 读第二次 /proc/stat；macOS 远端 top -l 2 自带采样）；
 * 3. 低频数据：公网 IP（IPv4 优先）与进程 Top5，仅 TTL 到期时独立执行，不阻塞前两阶段。
 * 所有命令均为普通用户可执行的只读操作，无需 sudo。
 */

/** 阶段1：快速核心采集命令（跨平台，uname 分支） */
export function buildRemoteQuickCommand (): string {
    return [
        `echo '${M_OS}'`,
        'uname -s 2>/dev/null',
        `echo '${M_HOST}'`,
        'hostname 2>/dev/null',
        'case "`uname -s 2>/dev/null`" in',
        'Linux)',
        `  echo '${M_STAT1}'`,
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
        `df -kP 2>/dev/null | head -n 100`,
        // 空的 IP/PS 段标记：保持解析分段完整（实际采集在独立的低频阶段执行）
        `echo '${M_IP}'`,
        `true`,
        `echo '${M_PS}'`,
        `true`,
        `echo '${M_END}'`,
    ].join('\n')
}

/** 阶段2：CPU 补采命令（按快阶段识别的 OS 分支） */
export function buildRemoteCpuCommand (os: string, sampleSeconds: number): string {
    const sample = Math.max(1, Math.min(10, Math.round(sampleSeconds)))
    if (/darwin/i.test(os)) {
        return [
            `echo '${M_CPU}'`,
            `top -l 2 -n 0 -s ${sample} 2>/dev/null | grep '^CPU usage' | tail -n 1`,
            `echo '${M_END}'`,
        ].join('\n')
    }
    return [
        `echo '${M_STAT2}'`,
        'head -n 1 /proc/stat 2>/dev/null',
        `echo '${M_END}'`,
    ].join('\n')
}

/** 阶段3：低频数据命令（公网 IP IPv4 优先 + 进程 Top5；仅 TTL 到期时携带对应开关） */
export function buildRemoteAuxCommand (opts: ProbeExtra = {}): string {
    const ipCmd = opts.wantIp
        ? `(curl -s --max-time 2 https://api4.ipify.org 2>/dev/null || curl -s --max-time 2 https://ipv4.icanhazip.com 2>/dev/null || curl -s --max-time 2 https://api.ipify.org 2>/dev/null || true)`
        : `true`
    const psCmd = opts.wantProcs
        ? `ps -Ao pid,pcpu,pmem,comm 2>/dev/null | head -n 1000 || true`
        : `true`
    return [
        `echo '${M_IP}'`,
        ipCmd,
        `echo '${M_PS}'`,
        psCmd,
        `echo '${M_END}'`,
    ].join('\n')
}

function withTimeout<T> (promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
        promise.then(
            value => { clearTimeout(timer); resolve(value) },
            err => { clearTimeout(timer); reject(err) },
        )
    })
}

/** 通过 russh 通道执行命令并收集输出（不经过用户终端，不影响交互会话）；整条链路（含通道打开/激活）受超时约束 */
export async function execRemoteCommand (sshSession: SSHTabSession, command: string, timeoutMs = 25000): Promise<string> {
    const ssh = sshSession.ssh
    if (!ssh) {
        throw new Error('SSH 连接尚未就绪')
    }
    const openPromise = ssh.openSessionChannel()
    let ch: any = null
    try {
        const opened = await withTimeout(openPromise, timeoutMs, 'SSH 通道打开超时')
        ch = await withTimeout(ssh.activateChannel(opened), timeoutMs, 'SSH 通道激活超时')
    } catch (err) {
        // 超时后迟到的通道直接关闭，避免泄漏
        openPromise.then((c: any) => c.close().catch(() => undefined)).catch(() => undefined)
        throw err
    }
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
        disk: null,
        disks: parseDf(section(out, M_DISK, M_IP)),
        uptimeSeconds: isNaN(uptime) ? null : Math.floor(uptime),
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
        disk: null,
        disks: parseDf(section(out, M_DISK, M_IP)),
        uptimeSeconds: uptime,
    }
}

/** 解析远程采集输出（自动按 OS 分支） */
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

/** 快阶段结果：核心数据 + CPU 补采所需状态 */
export interface SSHQuickResult {
    stats: ServerStats
    os: string
    stat1: { total: number, idle: number }|null
}

/** 低频阶段结果（公网 IP / 进程 Top5） */
export interface SSHAuxResult {
    publicIp?: string|null
    cpuTop5?: ProcInfo[]
    memTop5?: ProcInfo[]
}

/** 阶段1：快速核心采集——磁盘/内存/负载等立即可回填（无 sleep、无外网请求） */
export async function probeSSHQuick (sshSession: SSHTabSession, diskMount: string): Promise<SSHQuickResult> {
    if (!sshSession.open) {
        throw new Error('SSH 会话未连接')
    }
    const out = await execRemoteCommand(sshSession, buildRemoteQuickCommand(), 10000)
    const stats = parseRemoteOutput(out)
    if (!stats) {
        throw new Error('远程系统不受支持或采集失败（需 Linux 或 macOS，普通用户可读即可）')
    }
    // 全量挂载点已由 parse 得到；告警仍取配置挂载点所在磁盘（与原单点 df 语义一致）
    stats.disk = pickDisk(stats.disks, diskMount || '/')
    return {
        stats,
        os: firstLine(section(out, M_OS, M_HOST)),
        stat1: parseCpuStatLine(section(out, M_STAT1, M_MEM)),
    }
}

/** 阶段2：CPU 补采（Linux 本地等待采样窗口后读第二次 /proc/stat；macOS 远端 top -l 2 自带采样） */
export async function probeSSHCpu (sshSession: SSHTabSession, sampleSeconds: number, quick: SSHQuickResult): Promise<number|null> {
    if (!sshSession.open) {
        return null
    }
    const sample = Math.max(1, Math.min(10, Math.round(sampleSeconds)))
    const isDarwin = /darwin/i.test(quick.os)
    if (!isDarwin) {
        // Linux：stat1 已在快阶段读取，本地等待采样窗口后再读 stat2
        await new Promise(resolve => setTimeout(resolve, sample * 1000))
    }
    const out = await execRemoteCommand(sshSession, buildRemoteCpuCommand(quick.os, sample), 15000)
    if (isDarwin) {
        const cpu = parseMacTopCpuLine(section(out, M_CPU, M_END))
        return cpu === null ? null : +cpu.toFixed(1)
    }
    const stat2 = parseCpuStatLine(section(out, M_STAT2, M_END))
    const cpu = cpuPercentBetween(quick.stat1, stat2)
    return cpu === null ? null : +cpu.toFixed(1)
}

/** 阶段3（按 TTL）：公网 IP（IPv4 优先）+ 进程 Top5，独立执行不阻塞快数据 */
export async function probeSSHAux (sshSession: SSHTabSession, opts: ProbeExtra): Promise<SSHAuxResult> {
    if (!sshSession.open) {
        throw new Error('SSH 会话未连接')
    }
    const out = await execRemoteCommand(sshSession, buildRemoteAuxCommand(opts), 20000)
    const result: SSHAuxResult = {}
    if (opts.wantIp) {
        const ip = firstLine(section(out, M_IP, M_PS))
        result.publicIp = isValidIp(ip) ? ip : null
    }
    if (opts.wantProcs) {
        const top = topProcs(parsePsOutput(section(out, M_PS, M_END)))
        result.cpuTop5 = top.cpu
        result.memTop5 = top.mem
    }
    return result
}
