import type { Observable } from 'rxjs'

/** 单个挂载点的磁盘占用（df -kP 输出，单位已换算为字节） */
export interface DiskInfo {
    mount: string
    total: number
    used: number
    usedPercent: number
}

/** 进程占用快照（ps -Ao pid,pcpu,pmem,comm 输出） */
export interface ProcInfo {
    pid: number
    /** CPU 占用百分比（ps 统计口径） */
    cpu: number
    /** 内存占用百分比 */
    mem: number
    name: string
}

/** 低频采集开关：公网 IP 与进程列表按 TTL 采集，避免每轮刷新都执行 */
export interface ProbeExtra {
    wantIp?: boolean
    wantProcs?: boolean
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
    /** 告警阈值用：配置挂载点所在的磁盘（与历史口径一致） */
    disk: DiskInfo|null
    /** df -h 式的全部挂载点 */
    disks: DiskInfo[]
    /** 公网 IP：仅在本轮实际采集时由探针赋值，其余轮次由 MonitorService 按缓存回填 */
    publicIp?: string|null
    /** CPU 占用倒序 Top5（同上，按 TTL 回填） */
    cpuTop5?: ProcInfo[]
    /** 内存占用倒序 Top5 */
    memTop5?: ProcInfo[]
    uptimeSeconds: number|null
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
    profile?: { type?: string, options?: SSHTabProfileOptions }
    sshSession: SSHTabSession|null
}
