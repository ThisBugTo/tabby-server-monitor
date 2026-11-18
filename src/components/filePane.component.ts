import { Component, ElementRef, EventEmitter, Injector, Input, Output, ViewChild } from '@angular/core'
import { BaseTabComponent, FileDownload, FileUpload, NotificationsService, PlatformService, ThemesService } from 'tabby-core'
import { interval } from 'rxjs'
import { SFTPFileLike, SFTPSessionLike, SSHTabLike } from '../interfaces'
import { execRemoteCommand } from '../services/remoteProbe'
import { isLightTheme } from '../theme'
import { FOLDER_ICON_SVG } from '../icons'

/** 目录树节点（懒加载：children === null 表示尚未加载） */
interface TreeNode {
    path: string
    name: string
    expanded: boolean
    loading: boolean
    children: TreeNode[]|null
}

/** 目录树的扁平展示项（仅展开的分支；由组件现算，避免递归模板的上下文问题） */
interface FlatNode {
    node: TreeNode
    level: number
}

/** 上传项（tabby-core FileUpload / DirectoryUpload 的结构化描述，duck-typing） */
interface UploadEntryLike {
    getName (): string
    /** DirectoryUpload 才有；用于识别文件夹条目 */
    getChildrens? (): UploadEntryLike[]
}

/** 路径规范化：折叠 '.' / '..'，保证 '/' 开头的绝对路径 */
function normalizePath (input: string): string {
    const out: string[] = []
    for (const part of (input ?? '').split('/')) {
        if (!part || part === '.') {
            continue
        }
        if (part === '..') {
            out.pop()
        } else {
            out.push(part)
        }
    }
    return '/' + out.join('/')
}

/** 拼接目录与名称为绝对路径 */
function joinPath (dir: string, name: string): string {
    return normalizePath(`${dir}/${name}`)
}

/**
 * 文件传输面板：以 Tabby 原生分屏插入到 SSH 会话**底部**（FinalShell 底部文件面板风格）。
 * 左侧目录树（懒加载）+ 右侧文件列表（名称/类型/大小/修改时间/权限），
 * 传输基于 tabby-ssh 的 SFTP 会话与 tabby-core 的文件选择/进度 UI，不占用终端交互会话。
 */
@Component({
    selector: 'sm-file-pane',
    template: `
        <div class="fp-panel" [class.fp-light]='isLight'>
            <div class="fp-head">
                <strong class="fp-title">文件传输</strong>
                <span class="fp-host" [title]='hostLabel'>{{ hostLabel }}</span>
                <span class="fp-msg fp-muted" [class.fp-error]='error' *ngIf='error || statusText'>
                    {{ error || statusText }}
                </span>
                <span class="fp-spacer"></span>
                <button class="btn btn-sm btn-secondary" (click)='refresh()' [disabled]='busy || !sftp'>刷新</button>
                <button class="btn btn-sm btn-secondary" (click)='close.emit()' title='关闭面板'>✕</button>
            </div>

            <div class="fp-path">
                <button class="btn btn-sm btn-secondary" (click)='goUp()' [disabled]='busy || path === "/"'
                        title='上级目录'>↑</button>
                <input class="form-control form-control-sm fp-input" [(ngModel)]='pathInput'
                       (keyup.enter)='navigate(pathInput)' (blur)='pathInput = path'
                       spellcheck='false' placeholder='输入远程路径后回车跳转' [title]='path'>
            </div>

            <div class="fp-actions">
                <button class="btn btn-sm btn-primary" (click)='upload()' [disabled]='busy || !sftp'>上传文件</button>
                <button class="btn btn-sm btn-primary" (click)='uploadFolder()' [disabled]='busy || !sftp'>上传文件夹</button>
                <button class="btn btn-sm btn-primary" (click)='downloadSelected()' [disabled]='busy || !sftp || !selected'>下载</button>
                <button class="btn btn-sm btn-secondary" (click)='startCreateFolder()' [disabled]='busy || !sftp'>新建文件夹</button>
                <button class="btn btn-sm btn-secondary" (click)='deleteSelected()' [disabled]='busy || !sftp || !selected'>删除</button>
                <span class="fp-spacer"></span>
                <span class="fp-muted fp-hint" *ngIf='selected' [title]='selected.name'>{{ selected.name }}</span>
            </div>

            <div class="fp-newfolder" *ngIf='creating'>
                <input #newFolderInput class="form-control form-control-sm fp-input" [(ngModel)]='newName'
                       (keyup.enter)='confirmCreateFolder()' (keyup.escape)='creating = false'
                       spellcheck='false' placeholder='新文件夹名称（回车创建，Esc 取消）'>
                <button class="btn btn-sm btn-primary" (click)='confirmCreateFolder()'>创建</button>
                <button class="btn btn-sm btn-secondary" (click)='creating = false'>取消</button>
            </div>

            <div class="fp-body" (drop)='onDrop($event)' (dragover)='$event.preventDefault()'>
                <div class="fp-tree">
                    <div class="fp-node" *ngFor='let item of visibleNodes; trackBy: trackFlat'
                         [style.paddingLeft.px]='item.level * 14 + 4'
                         [class.fp-active]='item.node.path === path'
                         (click)='onNodeClick(item.node)'>
                        <span class="fp-arrow" [class.fp-arrow-open]='item.node.expanded'>{{ item.node.loading ? '…' : '▸' }}</span>
                        <span class="fp-node-name" [title]='item.node.path'>{{ item.node.name }}</span>
                    </div>
                </div>
                <div class="fp-list">
                    <table class="fp-table">
                        <thead>
                            <tr>
                                <th class="fp-c-name" (click)='setSort("name")'>文件名{{ sortMark("name") }}</th>
                                <th class="fp-c-type">类型</th>
                                <th class="fp-c-size" (click)='setSort("size")'>大小{{ sortMark("size") }}</th>
                                <th class="fp-c-time" (click)='setSort("modified")'>修改时间{{ sortMark("modified") }}</th>
                                <th class="fp-c-mode">权限</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr *ngFor='let f of sortedFiles; trackBy: trackFile'
                                [class.fp-active]='selected === f'
                                (click)='selected = f'
                                (dblclick)='openItem(f)'>
                                <td class="fp-c-name">
                                    <span class="fp-ico">{{ iconOf(f) }}</span>
                                    <span class="fp-name" [title]='f.name'>{{ f.name }}</span>
                                </td>
                                <td class="fp-c-type">{{ typeOf(f) }}</td>
                                <td class="fp-c-size" [title]='f.isDirectory ? "" : f.size + " bytes"'>
                                    {{ f.isDirectory ? "" : fmtBytes(f.size) }}
                                </td>
                                <td class="fp-c-time">{{ fmtTime(f.modified) }}</td>
                                <td class="fp-c-mode" [title]='modeString(f.mode)'>{{ modeString(f.mode) }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="fp-empty" *ngIf='loading'>加载中…</div>
                    <div class="fp-empty" *ngIf='!loading && !files.length'>{{ emptyText }}</div>
                </div>
            </div>

            <div class="fp-foot">
                <span class="fp-path-label" [title]='path'>{{ path }}</span>
                <span class="fp-muted">{{ files.length }} 项</span>
                <span class="fp-muted" *ngIf='selected'>选中：{{ selected.name }}</span>
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
            background: #232326;
            color: #eee;
        }
        :host(.fp-light) {
            background: #f2f3f5;
            color: #1e1e1e;
        }
        .fp-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .fp-head {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 10px; flex: none;
            border-bottom: 1px solid rgba(127, 127, 127, .25);
            user-select: none;
        }
        .fp-title { font-size: 13px; }
        .fp-host {
            font-size: 12px; opacity: .85; max-width: 180px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .fp-msg {
            font-size: 11px; overflow: hidden; text-overflow: ellipsis;
            white-space: nowrap; max-width: 50%;
        }
        .fp-error { color: #e57373; }
        .fp-spacer { flex: 1; }
        .fp-muted { opacity: .6; font-size: 11px; }
        .fp-path, .fp-actions, .fp-newfolder {
            display: flex; align-items: center; gap: 6px;
            padding: 6px 10px 0; flex: none;
        }
        .fp-actions { padding-top: 6px; }
        .fp-newfolder { padding-bottom: 2px; }
        .fp-input { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
        .fp-hint { max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fp-body {
            display: flex; flex: 1; min-height: 0;
            margin-top: 6px;
            border-top: 1px solid rgba(127, 127, 127, .25);
        }
        .fp-tree {
            width: 170px; flex: none; overflow: auto;
            padding: 4px 0; user-select: none;
            border-right: 1px solid rgba(127, 127, 127, .25);
        }
        .fp-node {
            display: flex; align-items: center; gap: 4px;
            font-size: 12px; line-height: 20px; cursor: pointer;
            white-space: nowrap; overflow: hidden;
        }
        .fp-node:hover { background: rgba(127, 127, 127, .18); }
        .fp-node.fp-active > .fp-node-name { color: #64b5f6; font-weight: 600; }
        .fp-arrow { width: 12px; flex: none; opacity: .7; transition: transform .12s; text-align: center; }
        .fp-arrow-open { transform: rotate(90deg); }
        .fp-node-name { overflow: hidden; text-overflow: ellipsis; }
        .fp-list { flex: 1; min-width: 0; overflow: auto; position: relative; }
        .fp-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
        .fp-table th {
            position: sticky; top: 0; z-index: 1;
            text-align: left; font-weight: 600; opacity: .85;
            padding: 4px 8px; cursor: default; user-select: none;
            background: #2b2b2e;
            border-bottom: 1px solid rgba(127, 127, 127, .3);
        }
        .fp-table th:not(.fp-c-type):not(.fp-c-mode) { cursor: pointer; }
        .fp-table td {
            padding: 2px 8px; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis;
        }
        .fp-table tbody tr:hover { background: rgba(127, 127, 127, .14); }
        .fp-table tbody tr.fp-active { background: rgba(76, 175, 80, .28); }
        .fp-c-name { max-width: 0; width: 45%; }
        .fp-c-type { width: 84px; }
        .fp-c-size { width: 84px; text-align: right; font-variant-numeric: tabular-nums; }
        .fp-c-time { width: 132px; font-variant-numeric: tabular-nums; }
        .fp-c-mode { width: 104px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .fp-ico { margin-right: 6px; }
        .fp-name { vertical-align: bottom; }
        .fp-empty {
            padding: 24px 12px; text-align: center;
            opacity: .6; font-size: 12px;
        }
        .fp-foot {
            display: flex; align-items: center; gap: 12px;
            padding: 4px 10px; flex: none; font-size: 11px;
            border-top: 1px solid rgba(127, 127, 127, .25);
            user-select: none;
        }
        .fp-path-label {
            flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        /* 亮色主题：跟随 Tabby 亮/暗色切换（类挂在 .fp-panel 上，由模板 [class.fp-light] 标记） */
        .fp-panel.fp-light .fp-table th { background: #e8eaed; }
        .fp-panel.fp-light .fp-table tbody tr.fp-active { background: rgba(25, 118, 210, .18); }
        .fp-panel.fp-light .fp-node.fp-active > .fp-node-name { color: #1565c0; }
        .fp-panel.fp-light .fp-error { color: #c62828; }
    `],
})
export class FilePaneComponent extends BaseTabComponent {
    /** 对应的 SSH 标签页（由 buttonProvider 通过 inputs 注入） */
    @Input() set tab (value: SSHTabLike|null) {
        this._tab = value
        this.sftp = null
        this.pathLoaded = false
        this.statusText = value ? '正在连接…' : ''
        if (value) {
            void this.ensureSftp(false)
        }
    }

    get tab (): SSHTabLike|null {
        return this._tab
    }

    @Output() close = new EventEmitter<void>()

    @ViewChild('newFolderInput') newFolderInput: ElementRef<HTMLInputElement>|null = null

    /** 是否亮色主题（跟随 Tabby 亮/暗色切换） */
    isLight = false

    sftp: SFTPSessionLike|null = null
    path = '/'
    pathInput = '/'
    files: SFTPFileLike[] = []
    selected: SFTPFileLike|null = null
    loading = false
    busy = false
    error = ''
    statusText = ''
    creating = false
    newName = ''
    sortKey: 'name'|'size'|'modified' = 'name'
    sortAsc = true

    root: TreeNode = { path: '/', name: '/', expanded: false, loading: false, children: null }

    private _tab: SSHTabLike|null = null
    private connecting = false
    private pathLoaded = false
    private navSeq = 0

    constructor (
        injector: Injector,
        public platform: PlatformService,
        private notifications: NotificationsService,
        private themes: ThemesService,
    ) {
        super(injector)
        this.setTitle('文件传输')
        this.icon = FOLDER_ICON_SVG
        const updateTheme = (): void => { this.isLight = isLightTheme(this.themes) }
        updateTheme()
        this.subscribeUntilDestroyed(this.themes.themeChanged$, updateTheme)
        // SFTP 未就绪（连接中 / 断开重连）时每 2 秒静默重试，就绪后自动加载目录
        this.subscribeUntilDestroyed(interval(2000), () => {
            if (this._tab && !this.sftp && !this.connecting && !this.busy) {
                void this.ensureSftp(true)
            }
        })
    }

    get hostLabel (): string {
        const o = this._tab?.profile?.options
        if (!o?.host) {
            return ''
        }
        return `${o.user ? o.user + '@' : ''}${o.host}:${o.port ?? 22}`
    }

    get emptyText (): string {
        if (!this._tab) {
            return '未绑定 SSH 会话'
        }
        if (!this.sftp) {
            return this.statusText || '等待 SSH 会话就绪…'
        }
        return '空目录'
    }

    /* ---------- SFTP 就绪与初始路径 ---------- */

    /** 打开 SFTP 会话并加载初始目录（幂等；quiet 用于定时重试不弹错误通知） */
    private async ensureSftp (quiet: boolean): Promise<void> {
        if (this.connecting || this.sftp) {
            return
        }
        const session = this._tab?.sshSession
        if (!session?.open || !session.openSFTP) {
            this.statusText = '等待 SSH 会话就绪…'
            return
        }
        this.connecting = true
        try {
            const sftp = await session.openSFTP()
            this.sftp = sftp
            this.subscribeUntilDestroyed(sftp.closed$, () => {
                if (this.sftp === sftp) {
                    this.sftp = null
                    this.statusText = '连接已断开，正在重连…'
                }
            })
            this.statusText = ''
            this.error = ''
            if (!this.pathLoaded) {
                const initial = await this.detectInitialPath()
                const ok = await this.navigate(initial)
                this.pathLoaded = ok
            } else {
                // 断开重连：回到原路径重新拉取
                await this.navigate(this.path)
            }
            if (this.root.children === null) {
                void this.loadChildren(this.root)
            }
            this.root.expanded = true
        } catch (err) {
            if (quiet) {
                this.statusText = '等待 SSH 会话就绪…'
            } else {
                this.fail('打开 SFTP 失败', err)
            }
        } finally {
            this.connecting = false
        }
    }

    /** 初始路径：shell 集成上报的 cwd → exec pwd → '/' */
    private async detectInitialPath (): Promise<string> {
        try {
            const cwd = await this._tab?.session?.getWorkingDirectory?.()
            if (cwd?.startsWith('/')) {
                return cwd
            }
        } catch { /* 无 shell 集成时返回 null，继续回退 */ }
        const session = this._tab?.sshSession
        if (session?.open) {
            try {
                const out = await execRemoteCommand(session, 'pwd -P', 6000)
                const line = out.trim().split('\n').pop() ?? ''
                if (line.startsWith('/')) {
                    return line
                }
            } catch { /* exec 不可用时回退根目录 */ }
        }
        return '/'
    }

    /* ---------- 目录浏览 ---------- */

    /** 跳转到指定目录；返回是否成功 */
    async navigate (input: string): Promise<boolean> {
        const raw = (input ?? '').trim()
        if (!raw) {
            this.pathInput = this.path
            return false
        }
        if (!this.sftp) {
            await this.ensureSftp(false)
            if (!this.sftp) {
                return false
            }
        }
        const target = normalizePath(raw)
        const seq = ++this.navSeq
        this.loading = true
        this.error = ''
        try {
            const entries = await this.sftp.readdir(target)
            if (seq !== this.navSeq) {
                return false // 已有更新的跳转在途，放弃本次结果
            }
            this.path = target
            this.pathInput = target
            this.files = entries
            this.selected = null
            await this.expandTo(target)
            return true
        } catch (err) {
            if (seq === this.navSeq) {
                this.fail(`无法访问 ${target}`, err, false)
            }
            return false
        } finally {
            if (seq === this.navSeq) {
                this.loading = false
            }
        }
    }

    goUp (): void {
        if (this.path === '/') {
            return
        }
        const parent = this.path.split('/').slice(0, -1).join('/') || '/'
        void this.navigate(parent)
    }

    /** 刷新当前目录（同时使目录树对应节点的子级缓存失效） */
    async refresh (): Promise<void> {
        if (!this.sftp) {
            await this.ensureSftp(false)
            if (!this.sftp) {
                return
            }
        }
        const node = this.findNode(this.path)
        if (node) {
            node.children = null
            node.loading = false
            // 立即重载该节点子级，保持树的展开状态与实际内容一致
            await this.loadChildren(node)
        }
        await this.navigate(this.path)
    }

    openItem (item: SFTPFileLike): void {
        if (!item.isDirectory && !item.isSymlink) {
            void this.downloadItem(item)
            return
        }
        void (async () => {
            const ok = await this.navigate(item.fullPath)
            if (!ok && item.isSymlink) {
                // 符号链接指向文件时 readdir 会失败，退化为下载
                this.error = ''
                await this.downloadItem(item)
            }
        })()
    }

    /* ---------- 目录树 ---------- */

    private findNode (path: string): TreeNode|null {
        const walk = (node: TreeNode): TreeNode|null => {
            if (!node) {
                return null
            }
            if (node.path === path) {
                return node
            }
            for (const child of node.children ?? []) {
                if (!child) {
                    continue
                }
                const hit = walk(child)
                if (hit) {
                    return hit
                }
            }
            return null
        }
        return walk(this.root)
    }

    /** 懒加载某节点的子目录 */
    private async loadChildren (node: TreeNode): Promise<void> {
        if (!this.sftp || node.loading) {
            return
        }
        node.loading = true
        try {
            const entries = await this.sftp.readdir(node.path)
            node.children = entries
                .filter(e => e && e.isDirectory)
                .map(e => ({ path: e.fullPath, name: e.name, expanded: false, loading: false, children: null }))
                .sort((a, b) => a.name.localeCompare(b.name))
        } catch {
            node.children = []
        } finally {
            node.loading = false
        }
    }

    /** 展开到指定路径（逐级加载，保证树上能看到当前目录） */
    private async expandTo (path: string): Promise<void> {
        let node = this.root
        node.expanded = true
        let current = ''
        for (const part of path.split('/').filter(Boolean)) {
            current += '/' + part
            if (node.children === null) {
                await this.loadChildren(node)
            }
            const child = (node.children ?? []).find(c => c && c.path === current)
            if (!child) {
                break
            }
            child.expanded = true
            node = child
        }
    }

    onNodeClick (node: TreeNode): void {
        if (!node || this.busy) {
            return
        }
        const willExpand = !node.expanded
        node.expanded = willExpand
        if (willExpand && node.children === null) {
            void this.loadChildren(node)
        }
        if (node.path !== this.path) {
            void this.navigate(node.path)
        }
    }

    /** 展开的目录树扁平视图（供模板 *ngFor 使用；每项均为现算对象，避免递归模板上下文问题） */
    get visibleNodes (): FlatNode[] {
        const out: FlatNode[] = []
        const walk = (node: TreeNode|null|undefined, level: number): void => {
            if (!node) {
                return
            }
            out.push({ node, level })
            if (node.expanded && node.children) {
                for (const child of node.children) {
                    walk(child, level + 1)
                }
            }
        }
        walk(this.root, 0)
        return out
    }

    trackFlat (index: number, item: FlatNode): string {
        return item?.node?.path ?? `idx:${index}`
    }

    /* ---------- 传输 ---------- */

    async upload (): Promise<void> {
        if (this.busy || !this.sftp) {
            return
        }
        let transfers: FileUpload[] = []
        try {
            transfers = await this.platform.startUpload({ multiple: true })
        } catch (err) {
            this.fail('选择上传文件失败', err)
            return
        }
        await this.uploadEntries(transfers as unknown as UploadEntryLike[])
    }

    async uploadFolder (): Promise<void> {
        if (this.busy || !this.sftp) {
            return
        }
        try {
            const root = await this.platform.startUploadDirectory()
            await this.uploadEntries(root.getChildrens() as unknown as UploadEntryLike[])
        } catch (err) {
            this.fail('选择上传文件夹失败', err)
        }
    }

    /** 拖放上传（放入列表/树区域即上传到当前目录） */
    async onDrop (event: DragEvent): Promise<void> {
        event.preventDefault()
        if (this.busy || !this.sftp) {
            return
        }
        try {
            const root = await this.platform.startUploadFromDragEvent(event, true)
            await this.uploadEntries(root.getChildrens() as unknown as UploadEntryLike[])
        } catch (err) {
            this.fail('上传失败', err)
        }
    }

    private async uploadEntries (entries: UploadEntryLike[]): Promise<void> {
        if (!this.sftp || !entries.length) {
            return
        }
        this.busy = true
        this.error = ''
        try {
            for (const entry of entries) {
                await this.uploadEntry(entry, this.path)
            }
            this.notifications.notice(`上传完成：${entries.length} 项`)
            await this.refresh()
        } catch (err) {
            this.fail('上传失败', err)
        } finally {
            this.busy = false
            this.statusText = ''
        }
    }

    private async uploadEntry (entry: UploadEntryLike, dirPath: string): Promise<void> {
        const sftp = this.sftp
        if (!sftp) {
            throw new Error('SFTP 连接已断开')
        }
        const target = joinPath(dirPath, entry.getName())
        if (typeof entry.getChildrens === 'function') {
            try {
                await sftp.mkdir(target)
            } catch {
                // 目标已存在时忽略，继续向内上传
            }
            for (const child of entry.getChildrens()) {
                await this.uploadEntry(child, target)
            }
        } else {
            this.statusText = `正在上传 ${entry.getName()}…`
            await sftp.upload(target, entry as unknown as FileUpload)
        }
    }

    downloadSelected (): void {
        const item = this.selected
        if (!item) {
            return
        }
        if (item.isDirectory) {
            void this.downloadFolder(item)
        } else {
            void this.downloadItem(item)
        }
    }

    private async downloadItem (item: SFTPFileLike): Promise<void> {
        if (this.busy || !this.sftp) {
            return
        }
        let transfer: FileDownload|null = null
        try {
            transfer = await this.platform.startDownload(item.name, item.mode, item.size)
        } catch (err) {
            this.fail('创建下载任务失败', err)
            return
        }
        if (!transfer) {
            return // 用户取消了保存对话框
        }
        this.busy = true
        this.error = ''
        this.statusText = `正在下载 ${item.name}…`
        try {
            // SFTPSession.download 成功后关闭 transfer，失败时自动 setStatus/cancel
            await this.sftp.download(item.fullPath, transfer)
        } catch (err) {
            this.fail('下载失败', err)
        } finally {
            this.busy = false
            this.statusText = ''
        }
    }

    private async downloadFolder (item: SFTPFileLike): Promise<void> {
        if (this.busy || !this.sftp) {
            return
        }
        const platformAny = this.platform as any
        if (typeof platformAny.startDownloadDirectory !== 'function') {
            this.notifications.error('当前 Tabby 版本不支持文件夹下载', '请升级 Tabby，或改为逐个下载文件')
            return
        }
        let transfer: any = null
        try {
            transfer = await platformAny.startDownloadDirectory(item.name, 0)
        } catch (err) {
            this.fail('创建下载任务失败', err)
            return
        }
        if (!transfer) {
            return // 用户取消了目录选择对话框
        }
        this.busy = true
        this.error = ''
        this.statusText = `正在下载文件夹 ${item.name}…`
        try {
            await this.downloadDirRecursive(item.fullPath, '', transfer)
            transfer.setStatus('')
            transfer.setCompleted(true)
            this.notifications.notice(`已下载文件夹 ${item.name}`)
        } catch (err) {
            transfer.cancel()
            this.fail('下载失败', err)
        } finally {
            transfer.close()
            this.busy = false
            this.statusText = ''
        }
    }

    private async downloadDirRecursive (dirPath: string, rel: string, transfer: any): Promise<void> {
        const sftp = this.sftp
        if (!sftp) {
            throw new Error('SFTP 连接已断开')
        }
        const entries = await sftp.readdir(dirPath)
        for (const e of entries) {
            if (transfer.isCancelled()) {
                throw new Error('下载已取消')
            }
            const childRel = rel ? `${rel}/${e.name}` : e.name
            transfer.setStatus(childRel)
            if (e.isDirectory) {
                await transfer.createDirectory(childRel)
                await this.downloadDirRecursive(e.fullPath, childRel, transfer)
            } else {
                const fileTransfer = await transfer.createFile(childRel, e.mode, e.size)
                await sftp.download(e.fullPath, fileTransfer)
            }
        }
    }

    /* ---------- 新建 / 删除 ---------- */

    startCreateFolder (): void {
        if (this.busy || !this.sftp) {
            return
        }
        this.creating = true
        this.newName = ''
        setTimeout(() => this.newFolderInput?.nativeElement.focus())
    }

    async confirmCreateFolder (): Promise<void> {
        const name = this.newName.trim()
        if (!name) {
            return
        }
        if (name.includes('/')) {
            this.notifications.error('文件夹名称不能包含 /')
            return
        }
        if (this.busy || !this.sftp) {
            return
        }
        this.busy = true
        try {
            await this.sftp.mkdir(joinPath(this.path, name))
            this.creating = false
            this.notifications.notice(`已创建文件夹 ${name}`)
            await this.refresh()
        } catch (err) {
            this.fail('新建文件夹失败', err)
        } finally {
            this.busy = false
        }
    }

    async deleteSelected (): Promise<void> {
        const item = this.selected
        if (!item || this.busy || !this.sftp) {
            return
        }
        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: `确定删除「${item.name}」吗？`,
            detail: item.isDirectory ? '文件夹及其内容将被递归删除，不可恢复' : '文件删除后不可恢复',
            buttons: ['删除', '取消'],
            defaultId: 1,
            cancelId: 1,
        })
        if (result.response !== 0) {
            return
        }
        this.busy = true
        this.error = ''
        this.statusText = `正在删除 ${item.name}…`
        try {
            if (item.isDirectory) {
                await this.removeRecursive(item.fullPath)
            } else {
                await this.sftp.unlink(item.fullPath)
            }
            this.selected = null
            this.notifications.notice(`已删除 ${item.name}`)
            await this.refresh()
        } catch (err) {
            this.fail('删除失败', err)
        } finally {
            this.busy = false
            this.statusText = ''
        }
    }

    /** SFTP 递归删除（先删子项再删目录，全程不经过 shell） */
    private async removeRecursive (path: string): Promise<void> {
        const sftp = this.sftp
        if (!sftp) {
            throw new Error('SFTP 连接已断开')
        }
        const entries = await sftp.readdir(path)
        for (const e of entries) {
            if (e.isDirectory) {
                await this.removeRecursive(e.fullPath)
            } else {
                await sftp.unlink(e.fullPath)
            }
        }
        await sftp.rmdir(path)
    }

    /* ---------- 展示辅助 ---------- */

    setSort (key: 'name'|'size'|'modified'): void {
        if (this.sortKey === key) {
            this.sortAsc = !this.sortAsc
        } else {
            this.sortKey = key
            this.sortAsc = true
        }
    }

    sortMark (key: 'name'|'size'|'modified'): string {
        if (this.sortKey !== key) {
            return ''
        }
        return this.sortAsc ? ' ↑' : ' ↓'
    }

    /** 目录恒在前，其余按当前排序键排列 */
    get sortedFiles (): SFTPFileLike[] {
        const cmp = (a: SFTPFileLike, b: SFTPFileLike): number => {
            let d = 0
            if (this.sortKey === 'size') {
                d = a.size - b.size
            } else if (this.sortKey === 'modified') {
                d = a.modified.getTime() - b.modified.getTime()
            } else {
                d = a.name.localeCompare(b.name)
            }
            return this.sortAsc ? d : -d
        }
        const dirs = this.files.filter(f => f.isDirectory).sort(cmp)
        const rest = this.files.filter(f => !f.isDirectory).sort(cmp)
        return [...dirs, ...rest]
    }

    trackFile (index: number, file: SFTPFileLike): string {
        return file.fullPath
    }

    iconOf (file: SFTPFileLike): string {
        if (file.isDirectory) {
            return '📁'
        }
        if (file.isSymlink) {
            return '🔗'
        }
        return '📄'
    }

    typeOf (file: SFTPFileLike): string {
        if (file.isDirectory) {
            return '文件夹'
        }
        if (file.isSymlink) {
            return '符号链接'
        }
        const m = /\.([^.]+)$/.exec(file.name)
        return m ? m[1].toUpperCase() : '文件'
    }

    fmtBytes (bytes: number|null|undefined): string {
        if (bytes === null || bytes === undefined) {
            return '-'
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
        let value = bytes
        let unit = 0
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024
            unit++
        }
        return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)}${units[unit]}`
    }

    fmtTime (value: Date): string {
        const d = value instanceof Date ? value : new Date(value)
        if (isNaN(d.getTime())) {
            return '-'
        }
        const p = (n: number): string => String(n).padStart(2, '0')
        return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    /** POSIX 权限位 → rwx 串（含 setuid/setgid/sticky 与类型位） */
    modeString (mode: number): string {
        const bits = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
        const type = mode & 0o170000
        let out = type === 0o040000 ? 'd' : type === 0o120000 ? 'l' : '-'
        for (let shift = 6; shift >= 0; shift -= 3) {
            out += bits[(mode >> shift) & 7]
        }
        const special = (index: number, ch: string, execBit: number): void => {
            out = out.slice(0, index) + (mode & execBit ? ch : ch.toUpperCase()) + out.slice(index + 1)
        }
        if (mode & 0o4000) {
            special(3, 's', 0o100)
        }
        if (mode & 0o2000) {
            special(6, 's', 0o010)
        }
        if (mode & 0o1000) {
            special(9, 't', 0o001)
        }
        return out
    }

    private fail (what: string, err: any, notify = true): void {
        const message = err?.message ? String(err.message) : String(err)
        this.error = `${what}: ${message}`
        if (notify) {
            this.notifications.error(`${what}失败`, message)
        }
    }
}
