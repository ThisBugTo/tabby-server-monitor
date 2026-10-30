import type { Observable } from 'rxjs'

/** GPU 信息（来自 nvidia-smi） */
export interface GPUInfo {
    index: number
    name: string
    /** GPU 利用率 % */
    utilPercent: number|null
    /** 显存已用 MB */
    memUsedMB: number|null
    /** 显存总量 MB */
    memTotalMB: number|null
    /** 温度 °C */
    temperature: number|null
    /** 风扇转速 % */
    fanSpeed: number|null
    /** 功耗 W */
    powerDraw: number|null
}

/** 单次采集到的服务器状态 */
export interface ServerStats {
    hostname: string|null
    cpuCores: number|null
    /** CPU 利用率 % */
    cpuPercent: number|null
    /** 1 / 5 / 15 分钟负载 */
    loadAvg: [number, number, number]|null
    mem: { total: number, used: number, available: number }|null
    swap: { total: number, used: number }|null
    disk: { mount: string, total: number, used: number, usedPercent: number }|null
    uptimeSeconds: number|null
    gpus: GPUInfo[]
}

/** 监控目标（本地或某个 SSH 标签页） */
export interface MonitorTarget {
    id: string
    kind: 'local'|'ssh'
    label: string
    /** 仅 SSH 目标：对应的标签页引用 */
    ref?: SSHTabLike
    stats: ServerStats|null
    error: string|null
    lastUpdated: number|null
}

/**
 * 以下为对 tabby-ssh 的 SSHTabComponent / SSHSession 的结构化（duck-typing）描述，
 * 避免在运行时硬依赖 tabby-ssh 模块。
 */
export interface ExecChannel {
    data$: Observable<Uint8Array>
    eof$: Observable<void>
    closed$: Observable<void>
    requestExec (command: string): Promise<void>
    close (): Promise<void>
}

export interface ExecSSHClient {
    openSessionChannel (): Promise<any>
    activateChannel (ch: any): Promise<ExecChannel>
}

export interface SSHTabSession {
    open: boolean
    ssh: ExecSSHClient|null
}

export interface SSHTabProfileOptions {
    host: string
    port?: number
    user?: string
}

export interface SSHTabLike {
    profile?: { options?: SSHTabProfileOptions }
    sshSession: SSHTabSession|null
}
