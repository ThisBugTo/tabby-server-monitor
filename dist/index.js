/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/buttonProvider.ts"
/*!*******************************!*\
  !*** ./src/buttonProvider.ts ***!
  \*******************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorButtonProvider = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const operators_1 = __webpack_require__(/*! rxjs/operators */ "rxjs/operators");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
const monitorTab_component_1 = __webpack_require__(/*! ./components/monitorTab.component */ "./src/components/monitorTab.component.ts");
const monitorPane_component_1 = __webpack_require__(/*! ./components/monitorPane.component */ "./src/components/monitorPane.component.ts");
const monitor_service_1 = __webpack_require__(/*! ./services/monitor.service */ "./src/services/monitor.service.ts");
const icons_1 = __webpack_require__(/*! ./icons */ "./src/icons.ts");
/** @hidden */
let MonitorButtonProvider = class MonitorButtonProvider extends tabby_core_1.ToolbarButtonProvider {
    constructor(app, tabsService, hotkeys, 
    // 注入监控服务，使插件加载后即启动监控循环（支持后台告警）
    monitor) {
        super();
        this.app = app;
        this.tabsService = tabsService;
        this.monitor = monitor;
        /** 当前监控分屏面板（单实例，跟随活动 SSH 会话移动，对应原浮动窗的单实例行为） */
        this.pane = null;
        /** 打开/移动面板期间屏蔽 activeTabChange 跟随逻辑，避免重入 */
        this.busy = false;
        hotkeys.hotkey$.subscribe(hotkey => {
            if (hotkey === 'open-server-monitor') {
                void this.open();
            }
        });
        // 切换标签页时，面板跟随切换到新的 SSH 会话所在的分屏（对应原浮动窗的跟随换绑行为）
        this.app.activeTabChange$.subscribe(tab => {
            // Tabby 重启恢复分屏后 ratios 可能损坏（终端被挤压/右侧留白），切换时立即修复
            if (tab instanceof tabby_core_1.SplitTabComponent) {
                this.repairSplitRatios(tab);
            }
            if (!this.pane || this.busy) {
                return;
            }
            const sshProfileTab = this.findSSHProfileTabIn(tab);
            if (sshProfileTab) {
                void this.movePaneTo(sshProfileTab);
            }
        });
        this.monitor.targets$.subscribe(targets => {
            // 兜底：恢复分屏若未触发切换标签，下一轮刷新内也会修复（数组对齐且总和为 1 时零开销）
            const active = this.app.activeTab;
            if (active instanceof tabby_core_1.SplitTabComponent) {
                this.repairSplitRatios(active);
            }
        });
        // 新开（含重启恢复）的 SSH 标签就绪后，立即在其左侧自动打开监控面板
        this.app.tabOpened$.subscribe(tab => this.autoOpenFor(tab));
        // 插件构造晚于标签恢复时，补扫已打开的标签
        for (const tab of [...this.app.tabs]) {
            this.autoOpenFor(tab);
        }
    }
    provide() {
        return [{
                icon: icons_1.MONITOR_ICON_SVG,
                title: '服务器状态监控',
                touchBarTitle: 'Monitor',
                weight: 5,
                click: () => { void this.open(); },
            }];
    }
    async open() {
        this.busy = true;
        try {
            const sshTab = this.findActiveSSHTab();
            if (!sshTab) {
                // 没有 SSH 会话时退回为独立标签页
                this.openStandaloneTab();
                return;
            }
            await this.togglePane(sshTab);
        }
        finally {
            this.busy = false;
        }
    }
    /** 新开/恢复的 SSH 标签就绪后自动打开监控面板（受设置开关控制；重复触发由 movePaneTo 幂等去重） */
    autoOpenFor(tab) {
        const settings = this.monitor.settings;
        if (!settings.enabled || !settings.monitorSSHTabs) {
            return;
        }
        const tryOpen = () => {
            const sshTab = this.findSSHProfileTabIn(tab);
            if (sshTab) {
                void this.movePaneTo(sshTab);
            }
        };
        if (!(tab instanceof tabby_core_1.SplitTabComponent)) {
            tryOpen();
            return;
        }
        if (tab.getAllTabs().length) {
            tryOpen();
        }
        else {
            // 重启恢复：子标签在分屏 initialized 后才挂载，等就绪再打开（与 SSH 窗口同刻出现）
            tab.initialized$.pipe((0, operators_1.take)(1)).subscribe(tryOpen);
        }
    }
    /** 在 SSH 会话左侧插入/关闭监控分屏面板（只展示该会话的服务器） */
    async togglePane(sshTab) {
        var _a;
        const targetId = this.targetIdFor(sshTab);
        const split = this.splitOf(sshTab);
        if (!split) {
            return;
        }
        if (this.pane && this.pane.parent === split && this.pane.targetId === targetId) {
            // 面板已绑定该会话并位于其左侧：再次点击关闭
            this.closePane(this.pane);
            return;
        }
        // 打开/换绑：先切到目标分屏，保证面板可见（原浮窗可悬浮在任意标签页上，分屏必须可见）
        const top = (_a = sshTab.topmostParent) !== null && _a !== void 0 ? _a : sshTab;
        if (top !== this.app.activeTab) {
            this.app.selectTab(top);
        }
        await this.movePaneTo(sshTab);
    }
    /** 把面板创建/移动到目标 SSH 会话所在分屏的左侧，并换绑到该会话 */
    async movePaneTo(sshTab) {
        var _a;
        const split = this.splitOf(sshTab);
        if (!split) {
            return;
        }
        const targetId = this.targetIdFor(sshTab);
        let pane;
        if (this.pane) {
            const existing = this.pane;
            pane = existing;
            if (existing.targetId !== targetId) {
                existing.targetId = targetId; // setter 会立即按缓存目标列表换绑
            }
            if (existing.parent === split) {
                this.monitor.refresh();
                return;
            }
            // 单实例：先从原分屏摘除，再插入到目标分屏左侧
            ;
            (_a = existing.parent) === null || _a === void 0 ? void 0 : _a.removeTab(existing);
        }
        else {
            const created = this.tabsService.create({ type: monitorPane_component_1.MonitorPaneComponent, inputs: { targetId } });
            pane = created;
            this.pane = created;
            created.destroyed$.subscribe(() => {
                if (this.pane === created) {
                    this.pane = null; // 面板所在分屏被整体关闭时同步清理引用
                }
            });
            created.close.subscribe(() => this.closePane(created));
        }
        await split.addTab(pane, sshTab, 'l');
        this.fitPaneRatio(split, pane);
        this.monitor.refresh();
        // addTab 内部会把焦点切到新插入的面板，随后交还给 SSH 终端（保持不抢输入焦点的体验）
        setImmediate(() => {
            if (pane.parent === split) {
                split.focus(sshTab);
            }
        });
    }
    /** 关闭面板：从分屏摘除并销毁组件（removeTab 只摘视图，不销毁实例） */
    closePane(pane) {
        const split = pane.parent;
        if (split) {
            split.removeTab(pane);
        }
        pane.destroy();
    }
    /**
     * 修复分屏恢复后 ratios 损坏的状态：Tabby 恢复时若子标签（如本插件面板，无恢复令牌）被丢弃，
     * ratios 与 children 会长度错位且总和不为 1，导致子面板被挤压、右侧留白。
     * 此处对齐长度、剔除非数值并归一到 1；无变化时不做任何事。
     * @returns 是否发生了修复（有修复时已重新 layout）
     */
    repairSplitRatios(split) {
        let changed = false;
        const fix = (container) => {
            const n = container.children.length;
            if (!n) {
                return;
            }
            // 截断多余、补齐缺失、非数值置 0
            const next = container.ratios.slice(0, n).map(r => (isFinite(r) && r >= 0) ? r : 0);
            while (next.length < n) {
                next.push(1);
            }
            let sum = next.reduce((a, b) => a + b, 0);
            if (!(sum > 0)) {
                for (let i = 0; i < n; i++) {
                    next[i] = 1 / n;
                }
                sum = 1;
            }
            else if (Math.abs(sum - 1) > 0.001) {
                for (let i = 0; i < n; i++) {
                    next[i] = next[i] / sum;
                }
            }
            const dirty = next.length !== container.ratios.length
                || next.some((r, i) => Math.abs(r - container.ratios[i]) > 1e-6);
            if (dirty) {
                container.ratios = next;
                changed = true;
            }
            for (const child of container.children) {
                if (child instanceof tabby_core_1.SplitContainer) {
                    fix(child);
                }
            }
        };
        fix(split.root);
        if (changed) {
            split.root.normalize();
            split.layout();
        }
        return changed;
    }
    /** 面板初始宽度约 400px（与原浮窗一致），其余宽度留给 SSH 终端 */
    fitPaneRatio(split, pane) {
        // 先修复恢复分屏可能损坏的 ratios，再在归一化后的数据上计算目标比例
        this.repairSplitRatios(split);
        const container = split.getParentOf(pane);
        if (!container) {
            return;
        }
        const index = container.children.indexOf(pane);
        const n = container.children.length;
        if (index < 0 || n < 2) {
            return;
        }
        const desired = Math.min(0.45, Math.max(0.12, 400 / Math.max(1, window.innerWidth)));
        const othersSum = 1 - container.ratios[index];
        container.ratios = container.ratios.map((r, i) => {
            if (i === index) {
                return desired;
            }
            return othersSum > 0.001 ? r * (1 - desired) / othersSum : (1 - desired) / (n - 1);
        });
        split.layout();
    }
    /** 会话所在的分屏容器；Tabby 会把打开的标签包装进 SplitTabComponent，未包装时现场兜底包装 */
    splitOf(tab) {
        if ((tab === null || tab === void 0 ? void 0 : tab.parent) instanceof tabby_core_1.SplitTabComponent) {
            return tab.parent;
        }
        if (!tab) {
            return null;
        }
        // 防御分支：Tabby 常规路径都会包装分屏，仅当拿到裸的顶层标签时在此包装
        const split = this.tabsService.create({ type: tabby_core_1.SplitTabComponent });
        const prevBusy = this.busy;
        this.busy = true;
        try {
            this.app.removeTab(tab);
            const pending = split.addTab(tab, null, 'l');
            this.app.addTabRaw(split);
            void pending.catch(err => console.error('[server-monitor] 包装分屏失败', err));
        }
        finally {
            this.busy = prevBusy;
        }
        return split;
    }
    /** 当前活动的 SSH 标签页（含分屏内的子标签）；找不到时退回第一个 SSH 标签 */
    findActiveSSHTab() {
        const active = this.app.activeTab;
        const inActive = this.findSSHTabIn(active);
        if (inActive) {
            return inActive;
        }
        // 退回：任意一个已连接的 SSH 标签
        for (const tab of this.flattenTabs(this.app.tabs)) {
            if (this.isSSHTab(tab)) {
                return tab;
            }
        }
        return null;
    }
    /** 在给定标签（或其所在的分屏）中找 SSH 会话标签 */
    findSSHTabIn(tab) {
        var _a;
        if (this.isSSHTab(tab)) {
            return tab;
        }
        if (tab instanceof tabby_core_1.SplitTabComponent) {
            return (_a = tab.getAllTabs().find((t) => this.isSSHTab(t))) !== null && _a !== void 0 ? _a : null;
        }
        return null;
    }
    /** 是否为 SSH 配置标签（带 host 且为 SSH 类型；排除 RDP/Telnet 等同样带 host 的配置） */
    isSshProfileTab(tab) {
        var _a;
        const profile = tab === null || tab === void 0 ? void 0 : tab.profile;
        return !!((_a = profile === null || profile === void 0 ? void 0 : profile.options) === null || _a === void 0 ? void 0 : _a.host)
            && ((profile === null || profile === void 0 ? void 0 : profile.type) === 'ssh' || (!!tab && 'sshSession' in tab));
    }
    /** 在给定标签（或其所在的分屏中）找带 SSH 配置的标签（不要求会话已连接，用于即时换绑/自动打开） */
    findSSHProfileTabIn(tab) {
        var _a;
        if (this.isSshProfileTab(tab)) {
            return tab;
        }
        if (tab instanceof tabby_core_1.SplitTabComponent) {
            return (_a = tab.getAllTabs().find((t) => this.isSshProfileTab(t))) !== null && _a !== void 0 ? _a : null;
        }
        return null;
    }
    isSSHTab(tab) {
        var _a, _b;
        return !!(tab === null || tab === void 0 ? void 0 : tab.sshSession) && !!((_b = (_a = tab === null || tab === void 0 ? void 0 : tab.profile) === null || _a === void 0 ? void 0 : _a.options) === null || _b === void 0 ? void 0 : _b.host);
    }
    /** 与 MonitorService.collectTargets 相同的 id 规则，保证面板能找到对应目标 */
    targetIdFor(sshTab) {
        var _a;
        const o = sshTab.profile.options;
        return `ssh:${o.user || 'default'}@${o.host}:${(_a = o.port) !== null && _a !== void 0 ? _a : 22}`;
    }
    flattenTabs(tabs) {
        const result = [];
        for (const tab of tabs) {
            if (tab instanceof tabby_core_1.SplitTabComponent) {
                result.push(...this.flattenTabs(tab.getAllTabs()));
            }
            else {
                result.push(tab);
            }
        }
        return result;
    }
    openStandaloneTab() {
        var _a;
        const existing = this.flattenTabs(this.app.tabs).find(tab => tab instanceof monitorTab_component_1.MonitorTabComponent);
        if (existing) {
            this.app.selectTab((_a = existing.topmostParent) !== null && _a !== void 0 ? _a : existing);
        }
        else {
            this.app.openNewTabRaw({ type: monitorTab_component_1.MonitorTabComponent });
        }
    }
};
MonitorButtonProvider = __decorate([
    (0, core_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof tabby_core_1.AppService !== "undefined" && tabby_core_1.AppService) === "function" ? _a : Object, typeof (_b = typeof tabby_core_1.TabsService !== "undefined" && tabby_core_1.TabsService) === "function" ? _b : Object, typeof (_c = typeof tabby_core_1.HotkeysService !== "undefined" && tabby_core_1.HotkeysService) === "function" ? _c : Object, typeof (_d = typeof monitor_service_1.MonitorService !== "undefined" && monitor_service_1.MonitorService) === "function" ? _d : Object])
], MonitorButtonProvider);
exports.MonitorButtonProvider = MonitorButtonProvider;


/***/ },

/***/ "./src/components/monitorCard.component.ts"
/*!*************************************************!*\
  !*** ./src/components/monitorCard.component.ts ***!
  \*************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorCardComponent = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
const interfaces_1 = __webpack_require__(/*! ../interfaces */ "./src/interfaces.ts");
const monitor_service_1 = __webpack_require__(/*! ../services/monitor.service */ "./src/services/monitor.service.ts");
/** 单个监控目标的卡片视图（监控标签页与分屏面板共用） */
let MonitorCardComponent = class MonitorCardComponent {
    constructor(monitor, config) {
        this.monitor = monitor;
        this.config = config;
        this.target = null;
        /** 未采集到数据时的占位行 */
        this.skeletonLabels = ['公网IP', 'CPU', '内存', '磁盘', '负载', '进程'];
    }
    /** 展示项开关（设置 → 服务器监控 → 展示设置）；缺省视为显示 */
    show(key) {
        var _a, _b;
        return ((_b = (_a = this.config.store.serverMonitor) === null || _a === void 0 ? void 0 : _a.display) === null || _b === void 0 ? void 0 : _b[key]) !== false;
    }
    /** 骨架屏提示语：区分“会话尚未建立”与“会话已就绪、首次采集进行中”（便于定位卡在哪一段） */
    waitingText(t) {
        var _a;
        if (t.kind === 'ssh' && !((_a = t.ref) === null || _a === void 0 ? void 0 : _a.sshSession)) {
            return '正在连接 SSH 会话…';
        }
        return '会话已就绪，首次采集进行中…';
    }
    percent(used, total) {
        if (used === undefined || !total) {
            return 0;
        }
        return Math.max(0, Math.min(100, used / total * 100));
    }
    fmt1(value) {
        return value === null || value === undefined ? '-' : value.toFixed(1);
    }
    fmtBytes(bytes) {
        if (bytes === null || bytes === undefined) {
            return '-';
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        let value = bytes;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)}${units[unit]}`;
    }
    fmtUptime(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) {
            return `${d}天${h}小时`;
        }
        if (h > 0) {
            return `${h}小时${m}分`;
        }
        return `${m}分钟`;
    }
    relTime(ts) {
        const delta = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (delta < 5) {
            return '刚刚';
        }
        return `${delta}s前`;
    }
    /** 负载三行：1/5/15 分钟，按核数换算满载百分比 */
    loadRows(load, cores) {
        const labels = ['1分钟', '5分钟', '15分钟'];
        return load.map((v, i) => ({
            label: labels[i],
            value: (typeof v === 'number' && !isNaN(v)) ? v.toFixed(2) : '-',
            percent: (cores && typeof v === 'number' && !isNaN(v))
                ? Math.max(0, Math.min(100, v / cores * 100))
                : null,
        }));
    }
    /** 占用条颜色：设置里选自定义颜色时用单色，否则按占用分级（绿/橙/红） */
    barColor(percent) {
        const cfg = this.config.store.serverMonitor;
        if ((cfg === null || cfg === void 0 ? void 0 : cfg.barColorMode) === 'custom' && cfg.barColorCustom) {
            return cfg.barColorCustom;
        }
        const p = percent !== null && percent !== void 0 ? percent : 0;
        if (p >= 90) {
            return '#e57373';
        }
        if (p >= 70) {
            return '#ffb74d';
        }
        return '#81c784';
    }
    trackDisk(index, disk) {
        return disk.mount;
    }
    trackProc(index, proc) {
        return proc.pid;
    }
};
__decorate([
    (0, core_1.Input)(),
    __metadata("design:type", typeof (_c = typeof interfaces_1.MonitorTarget !== "undefined" && interfaces_1.MonitorTarget) === "function" ? _c : Object)
], MonitorCardComponent.prototype, "target", void 0);
MonitorCardComponent = __decorate([
    (0, core_1.Component)({
        selector: 'sm-monitor-card',
        template: `
        <div class="sm-card" *ngIf="target as t">
            <div class="sm-card-head">
                <span class="sm-badge" [class.sm-badge-local]='t.kind === "local"'>
                    {{ t.kind === 'local' ? '本机' : 'SSH' }}
                </span>
                <span class="sm-label" [title]='t.label'>{{ t.label }}</span>
                <span class="sm-muted sm-time" *ngIf="t.lastUpdated">{{ relTime(t.lastUpdated) }}</span>
            </div>

            <div class="sm-error" *ngIf="t.error">⚠ {{ t.error }}</div>

            <!-- 未采集到数据：先展示占位列表，数据回来后自动回写 -->
            <ng-container *ngIf="!t.stats">
                <div class="sm-row" *ngFor="let label of skeletonLabels">
                    <span class="sm-key">{{ label }}</span>
                    <div class="sm-bar"><div class="sm-fill sm-skeleton"></div></div>
                    <span class="sm-val sm-muted">-</span>
                </div>
                <div class="sm-note sm-muted">{{ waitingText(t) }}</div>
            </ng-container>

            <ng-container *ngIf="t.stats">
                <div class="sm-row" *ngIf="show('publicIp') && t.stats.publicIp">
                    <span class="sm-key">公网IP</span>
                    <span class="sm-ip" [title]='t.stats.publicIp'>{{ t.stats.publicIp }}</span>
                </div>

                <div class="sm-row" *ngIf="show('cpu') && t.stats.cpuPercent !== null">
                    <span class="sm-key">CPU</span>
                    <div class="sm-bar"><div class="sm-fill"
                        [style.width.%]='t.stats.cpuPercent'
                        [style.background]='barColor(t.stats.cpuPercent)'></div></div>
                    <span class="sm-val">{{ fmt1(t.stats.cpuPercent) }}%</span>
                </div>

                <div class="sm-row" *ngIf="show('mem') && t.stats.mem as mem">
                    <span class="sm-key">内存</span>
                    <div class="sm-bar"><div class="sm-fill"
                        [style.width.%]='percent(mem.used, mem.total)'
                        [style.background]='barColor(percent(mem.used, mem.total))'></div></div>
                    <span class="sm-val">{{ fmtBytes(mem.used) }}/{{ fmtBytes(mem.total) }}</span>
                </div>

                <div class="sm-row" *ngIf="show('swap') && t.stats.swap as swap">
                    <ng-container *ngIf="swap.total > 0">
                        <span class="sm-key">交换</span>
                        <div class="sm-bar"><div class="sm-fill"
                            [style.width.%]='percent(swap.used, swap.total)'
                            [style.background]='barColor(percent(swap.used, swap.total))'></div></div>
                        <span class="sm-val">{{ fmtBytes(swap.used) }}/{{ fmtBytes(swap.total) }}</span>
                    </ng-container>
                </div>

                <!-- 磁盘：单独虚线分区，展示全部挂载点（df -h 式） -->
                <div class="sm-section" *ngIf="show('disk') && t.stats.disks.length">
                    <div class="sm-row" *ngFor="let d of t.stats.disks; trackBy: trackDisk">
                        <span class="sm-key sm-key-disk" [title]='d.mount'>{{ d.mount }}</span>
                        <div class="sm-bar"><div class="sm-fill"
                            [style.width.%]='d.usedPercent'
                            [style.background]='barColor(d.usedPercent)'></div></div>
                        <span class="sm-val" [title]='d.mount + " 已用 " + fmtBytes(d.used) + " / 共 " + fmtBytes(d.total) + "（" + d.usedPercent + "%）"'>
                            {{ fmtBytes(d.used) }}/{{ fmtBytes(d.total) }}
                        </span>
                    </div>
                </div>

                <ng-container *ngIf="show('load') && t.stats.loadAvg as load">
                    <div class="sm-row">
                        <span class="sm-key">负载</span>
                        <span class="sm-muted">1 / 5 / 15 分钟平均值</span>
                    </div>
                    <div class="sm-row" *ngFor="let row of loadRows(load, t.stats.cpuCores)">
                        <span class="sm-key sm-key-sub">{{ row.label }}</span>
                        <div class="sm-bar"><div class="sm-fill"
                            [style.width.%]='row.percent'
                            [style.background]='barColor(row.percent)'></div></div>
                        <span class="sm-val">{{ row.value }}</span>
                    </div>
                    <div class="sm-note sm-muted" *ngIf="t.stats.cpuCores">
                        负载 = 平均等待运行的任务数，{{ t.stats.cpuCores }} 核 CPU 达到 {{ t.stats.cpuCores }} 即满载（100%）
                    </div>
                </ng-container>

                <ng-container *ngIf="show('procs')">
                    <div class="sm-procs" *ngIf="t.stats.cpuTop5?.length">
                        <div class="sm-row">
                            <span class="sm-key">CPU进程</span>
                            <span class="sm-muted">占用倒序 Top5</span>
                        </div>
                        <div class="sm-proc" *ngFor="let p of t.stats.cpuTop5; trackBy: trackProc">
                            <span class="sm-proc-name" [title]='p.name'>{{ p.name }}</span>
                            <span class="sm-proc-meta sm-muted">PID {{ p.pid }}</span>
                            <span class="sm-proc-val">{{ fmt1(p.cpu) }}%</span>
                        </div>
                    </div>

                    <div class="sm-procs" *ngIf="t.stats.memTop5?.length">
                        <div class="sm-row">
                            <span class="sm-key">内存进程</span>
                            <span class="sm-muted">占用倒序 Top5</span>
                        </div>
                        <div class="sm-proc" *ngFor="let p of t.stats.memTop5; trackBy: trackProc">
                            <span class="sm-proc-name" [title]='p.name'>{{ p.name }}</span>
                            <span class="sm-proc-meta sm-muted">PID {{ p.pid }}</span>
                            <span class="sm-proc-val">{{ fmt1(p.mem) }}%</span>
                        </div>
                    </div>
                </ng-container>

                <div class="sm-footer sm-muted" *ngIf="show('uptime')">
                    <span *ngIf="t.stats.uptimeSeconds !== null">已运行 {{ fmtUptime(t.stats.uptimeSeconds) }}</span>
                    <span *ngIf="t.stats.cpuCores">· {{ t.stats.cpuCores }} 核</span>
                </div>
            </ng-container>
        </div>
    `,
        styles: [`
        .sm-card {
            background: rgba(127, 127, 127, .12);
            border: 1px solid rgba(127, 127, 127, .25);
            border-radius: 8px;
            padding: 10px 12px;
        }
        .sm-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .sm-badge {
            font-size: 11px; padding: 1px 6px; border-radius: 4px;
            background: rgba(76, 175, 80, .25); color: #81c784;
        }
        .sm-badge-local { background: rgba(33, 150, 243, .25); color: #64b5f6; }
        .sm-label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sm-time { margin-left: auto; }
        .sm-muted { opacity: .6; font-size: 12px; }
        .sm-error { color: #e57373; font-size: 12px; margin: 4px 0; }
        .sm-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
        .sm-key { width: 42px; flex: none; font-size: 12px; opacity: .8; }
        .sm-key-sub { width: 42px; padding-left: 8px; opacity: .65; }
        .sm-bar {
            flex: 1; height: 8px; border-radius: 4px;
            background: rgba(127, 127, 127, .2); overflow: hidden;
        }
        .sm-fill { height: 100%; border-radius: 4px; transition: width .4s; }
        .sm-val { font-size: 12px; font-variant-numeric: tabular-nums; flex: none; max-width: 55%; text-align: right; }
        .sm-footer { margin-top: 8px; font-size: 11px; }
        .sm-note { margin-top: 4px; font-size: 11px; }
        /* 独立虚线分区（磁盘 / 进程 Top5） */
        .sm-section,
        .sm-procs { margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(127, 127, 127, .25); }
        .sm-ip {
            flex: 1; font-size: 12px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sm-key-disk { width: 76px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sm-proc { display: flex; align-items: center; gap: 8px; font-size: 12px; margin: 2px 0; }
        .sm-proc-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sm-proc-meta { flex: none; font-size: 11px; }
        .sm-proc-val { flex: none; width: 54px; text-align: right; font-variant-numeric: tabular-nums; }
        /* 未采集到数据时的占位行 */
        .sm-skeleton {
            width: 100%; background: rgba(127, 127, 127, .35);
            animation: sm-pulse 1.4s ease-in-out infinite;
        }
        @keyframes sm-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
    `],
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof monitor_service_1.MonitorService !== "undefined" && monitor_service_1.MonitorService) === "function" ? _a : Object, typeof (_b = typeof tabby_core_1.ConfigService !== "undefined" && tabby_core_1.ConfigService) === "function" ? _b : Object])
], MonitorCardComponent);
exports.MonitorCardComponent = MonitorCardComponent;


/***/ },

/***/ "./src/components/monitorPane.component.ts"
/*!*************************************************!*\
  !*** ./src/components/monitorPane.component.ts ***!
  \*************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorPaneComponent = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
const monitor_service_1 = __webpack_require__(/*! ../services/monitor.service */ "./src/services/monitor.service.ts");
const icons_1 = __webpack_require__(/*! ../icons */ "./src/icons.ts");
/**
 * 左侧分屏监控面板：作为 SplitTabComponent 的子标签插入到 SSH 会话左侧，
 * 占据独立布局空间，不再悬浮遮挡终端窗口。
 * 由 buttonProvider 动态创建并管理生命周期。
 */
let MonitorPaneComponent = class MonitorPaneComponent extends tabby_core_1.BaseTabComponent {
    set targetId(value) {
        if (this._targetId === value) {
            return;
        }
        this._targetId = value;
        // 立即从已缓存的目标列表中查找，不等下一轮采集（避免换绑延迟）
        this.resolveTarget();
    }
    get targetId() {
        return this._targetId;
    }
    constructor(monitor, injector) {
        super(injector);
        this.monitor = monitor;
        this.close = new core_1.EventEmitter();
        this.target = null;
        this._targetId = '';
        this.allTargets = [];
        this.setTitle('服务器监控');
        this.icon = icons_1.MONITOR_ICON_SVG;
        this.subscribeUntilDestroyed(monitor.targets$, targets => {
            this.allTargets = targets;
            this.resolveTarget();
        });
    }
    resolveTarget() {
        var _a;
        this.target = (_a = this.allTargets.find(t => t.id === this._targetId)) !== null && _a !== void 0 ? _a : null;
    }
    refreshNow() {
        this.monitor.refresh();
    }
};
__decorate([
    (0, core_1.Input)(),
    __metadata("design:type", String),
    __metadata("design:paramtypes", [String])
], MonitorPaneComponent.prototype, "targetId", null);
__decorate([
    (0, core_1.Output)(),
    __metadata("design:type", Object)
], MonitorPaneComponent.prototype, "close", void 0);
MonitorPaneComponent = __decorate([
    (0, core_1.Component)({
        selector: 'sm-monitor-pane',
        template: `
        <div class="sm-panel">
            <div class="sm-head">
                <strong class="sm-title">服务器监控</strong>
                <span class="sm-host" *ngIf="target">{{ target.label }}</span>
                <span class="sm-muted" *ngIf="monitor.lastRefresh">
                    {{ monitor.lastRefresh | date: 'HH:mm:ss' }}
                </span>
                <button class="btn btn-sm btn-secondary" (click)='refreshNow()'>刷新</button>
                <button class="btn btn-sm btn-secondary" (click)='close.emit()'>✕</button>
            </div>
            <div class="sm-body">
                <sm-monitor-card [target]='target'></sm-monitor-card>
                <div class="sm-empty" *ngIf="!target">
                    正在连接或等待会话就绪…<br>数据就绪后自动显示；若会话已断开，重新打开监控面板即可绑定。
                </div>
            </div>
        </div>
    `,
        styles: [`
        :host {
            display: flex;
            flex-direction: column;
            background: #232326;
            color: #eee;
        }
        .sm-panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
        .sm-head {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(127, 127, 127, .25);
            user-select: none;
            flex: none;
        }
        .sm-title { font-size: 13px; }
        .sm-host {
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 140px;
            opacity: .85;
        }
        .sm-muted { font-size: 11px; opacity: .55; margin-left: auto; }
        .sm-body { padding: 10px; overflow: auto; flex: 1; }
        .sm-empty { opacity: .6; font-size: 12px; line-height: 1.8; text-align: center; padding: 16px; }
    `],
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof monitor_service_1.MonitorService !== "undefined" && monitor_service_1.MonitorService) === "function" ? _a : Object, typeof (_b = typeof core_1.Injector !== "undefined" && core_1.Injector) === "function" ? _b : Object])
], MonitorPaneComponent);
exports.MonitorPaneComponent = MonitorPaneComponent;


/***/ },

/***/ "./src/components/monitorSettings.component.ts"
/*!*****************************************************!*\
  !*** ./src/components/monitorSettings.component.ts ***!
  \*****************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorSettingsComponent = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
/** @hidden */
let MonitorSettingsComponent = class MonitorSettingsComponent {
    constructor(config) {
        this.config = config;
        // 兼容旧配置：补齐新增字段（下次 config.save() 时随配置持久化）
        const s = this.config.store.serverMonitor;
        if (s) {
            if (!s.display) {
                s.display = {
                    publicIp: true,
                    cpu: true,
                    mem: true,
                    swap: true,
                    disk: true,
                    load: true,
                    procs: true,
                    uptime: true,
                };
            }
            if (!s.thresholds) {
                s.thresholds = {};
            }
            if (!s.barColorMode) {
                s.barColorMode = 'auto';
            }
            if (!s.barColorCustom) {
                s.barColorCustom = '#81c784';
            }
        }
    }
};
MonitorSettingsComponent = __decorate([
    (0, core_1.Component)({
        selector: 'sm-monitor-settings',
        template: `
        <h3>服务器状态监控</h3>

        <div class="sm-section">
            <checkbox
                text='启用服务器状态监控'
                [(ngModel)]='config.store.serverMonitor.enabled'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='监控本机'
                [(ngModel)]='config.store.serverMonitor.monitorLocal'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='自动监控已打开的 SSH 标签页'
                [(ngModel)]='config.store.serverMonitor.monitorSSHTabs'
                (ngModelChange)='config.save()'
            ></checkbox>
        </div>

        <h4>展示设置</h4>
        <div class="sm-section">
            <checkbox
                text='显示公网 IP'
                [(ngModel)]='config.store.serverMonitor.display.publicIp'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示 CPU'
                [(ngModel)]='config.store.serverMonitor.display.cpu'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示内存'
                [(ngModel)]='config.store.serverMonitor.display.mem'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示交换分区'
                [(ngModel)]='config.store.serverMonitor.display.swap'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示磁盘（全部挂载点）'
                [(ngModel)]='config.store.serverMonitor.display.disk'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示负载'
                [(ngModel)]='config.store.serverMonitor.display.load'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示进程 Top5（CPU / 内存）'
                [(ngModel)]='config.store.serverMonitor.display.procs'
                (ngModelChange)='config.save()'
            ></checkbox>
            <checkbox
                text='显示运行时长与核数'
                [(ngModel)]='config.store.serverMonitor.display.uptime'
                (ngModelChange)='config.save()'
            ></checkbox>
        </div>

        <div class="sm-section form-inline">
            <label>占用条颜色</label>
            <select class='form-control form-control-sm sm-select'
                [(ngModel)]='config.store.serverMonitor.barColorMode'
                (ngModelChange)='config.save()'>
                <option value='auto'>自动（按占用分级：绿 / 橙 / 红）</option>
                <option value='custom'>自定义颜色</option>
            </select>
            <input *ngIf='config.store.serverMonitor.barColorMode === "custom"'
                type='color' class='sm-color'
                [(ngModel)]='config.store.serverMonitor.barColorCustom'
                (ngModelChange)='config.save()' />
        </div>

        <div class="sm-section form-inline">
            <label>刷新间隔（秒）</label>
            <input type='number' class='form-control form-control-sm' min='2' max='300'
                [(ngModel)]='config.store.serverMonitor.refreshInterval' (change)='config.save()' />
        </div>

        <div class="sm-section form-inline">
            <label>CPU 采样窗口（秒）</label>
            <input type='number' class='form-control form-control-sm' min='1' max='10'
                [(ngModel)]='config.store.serverMonitor.cpuSampleSeconds' (change)='config.save()' />
        </div>

        <div class="sm-section form-inline">
            <label>远端磁盘挂载点</label>
            <input type='text' class='form-control form-control-sm'
                [(ngModel)]='config.store.serverMonitor.diskMount' (change)='config.save()' />
        </div>

        <h4>告警阈值（%，0 = 关闭）</h4>
        <div class="sm-section form-inline">
            <label>CPU</label>
            <input type='number' class='form-control form-control-sm' min='0' max='100'
                [(ngModel)]='config.store.serverMonitor.thresholds.cpu' (change)='config.save()' />

            <label>内存</label>
            <input type='number' class='form-control form-control-sm' min='0' max='100'
                [(ngModel)]='config.store.serverMonitor.thresholds.memory' (change)='config.save()' />

            <label>磁盘</label>
            <input type='number' class='form-control form-control-sm' min='0' max='100'
                [(ngModel)]='config.store.serverMonitor.thresholds.disk' (change)='config.save()' />
        </div>

        <div class="sm-section form-inline">
            <label>告警冷却（秒）</label>
            <input type='number' class='form-control form-control-sm' min='0'
                [(ngModel)]='config.store.serverMonitor.alertCooldown' (change)='config.save()' />
        </div>

        <div class="sm-notes">
            <p>说明：</p>
            <ul>
                <li>SSH 监控通过当前已打开的 SSH 会话执行只读命令（Linux 读 /proc，macOS 用 sysctl/vm_stat/top），不影响终端中的交互会话，也无需 sudo。</li>
                <li>远端需为 Linux 或 macOS；不采集 GPU 数据（显卡品牌繁多，无法统一匹配）。</li>
                <li>公网 IP 约 15 分钟采集一次、进程 Top5 约 30 秒一次，均不随刷新间隔频繁执行，避免影响系统性能。</li>
                <li>可通过快捷键设置中的「打开服务器状态监控」绑定快捷键快速打开面板。</li>
            </ul>
        </div>
    `,
        styles: [`
        .sm-section { margin: 12px 0; }
        .sm-section label { min-width: 130px; margin-right: 8px; }
        .sm-section input[type=number] { width: 100px; margin-right: 16px; }
        .sm-section input[type=text] { width: 200px; }
        .form-inline { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 0; }
        .sm-select { width: 260px; margin-right: 8px; }
        .sm-color {
            width: 64px; height: 30px; padding: 2px;
            border: 1px solid rgba(127, 127, 127, .4); border-radius: 4px;
            background: transparent; cursor: pointer;
        }
        .sm-notes { opacity: .7; font-size: 12px; margin-top: 16px; }
        .sm-notes code { padding: 0 4px; }
    `],
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof tabby_core_1.ConfigService !== "undefined" && tabby_core_1.ConfigService) === "function" ? _a : Object])
], MonitorSettingsComponent);
exports.MonitorSettingsComponent = MonitorSettingsComponent;


/***/ },

/***/ "./src/components/monitorTab.component.ts"
/*!************************************************!*\
  !*** ./src/components/monitorTab.component.ts ***!
  \************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorTabComponent = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
const monitor_service_1 = __webpack_require__(/*! ../services/monitor.service */ "./src/services/monitor.service.ts");
const icons_1 = __webpack_require__(/*! ../icons */ "./src/icons.ts");
/** @hidden */
let MonitorTabComponent = class MonitorTabComponent extends tabby_core_1.BaseTabComponent {
    constructor(monitor, config, injector) {
        super(injector);
        this.monitor = monitor;
        this.config = config;
        this.setTitle('服务器监控');
        this.icon = icons_1.MONITOR_ICON_SVG;
    }
    get intervalSeconds() {
        var _a, _b;
        return Math.max(2, (_b = (_a = this.config.store.serverMonitor) === null || _a === void 0 ? void 0 : _a.refreshInterval) !== null && _b !== void 0 ? _b : 5);
    }
    refreshNow() {
        this.monitor.refresh();
    }
    trackTarget(index, target) {
        return target.id;
    }
};
MonitorTabComponent = __decorate([
    (0, core_1.Component)({
        selector: 'sm-monitor-tab',
        template: `
        <div class="sm-wrap">
            <div class="sm-toolbar">
                <strong>服务器状态监控</strong>
                <span class="sm-muted" *ngIf="monitor.lastRefresh">
                    最后刷新 {{ monitor.lastRefresh | date: 'HH:mm:ss' }}
                </span>
                <span class="sm-muted">每 {{ intervalSeconds }}s 刷新</span>
                <button class="btn btn-sm btn-secondary" (click)='refreshNow()'>立即刷新</button>
            </div>

            <div class="sm-grid" *ngIf="monitor.targets$ | async as targets">
                <sm-monitor-card *ngFor="let t of targets; trackBy: trackTarget" [target]='t'></sm-monitor-card>

                <div class="sm-empty" *ngIf="!targets.length">
                    当前没有可监控的目标。<br>
                    在「设置 → 服务器监控」中启用本地监控，或打开一个 SSH 连接标签页后，这里会自动显示其 CPU、内存、GPU、磁盘和负载。
                </div>
            </div>
        </div>
    `,
        styles: [`
        :host { display: block; height: 100%; overflow: auto; }
        .sm-wrap { padding: 12px 16px; }
        .sm-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .sm-toolbar .sm-muted { margin-right: auto; }
        .sm-muted { opacity: .6; font-size: 12px; }
        .sm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; }
        .sm-empty { opacity: .7; line-height: 1.8; padding: 24px; text-align: center; }
    `],
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof monitor_service_1.MonitorService !== "undefined" && monitor_service_1.MonitorService) === "function" ? _a : Object, typeof (_b = typeof tabby_core_1.ConfigService !== "undefined" && tabby_core_1.ConfigService) === "function" ? _b : Object, typeof (_c = typeof core_1.Injector !== "undefined" && core_1.Injector) === "function" ? _c : Object])
], MonitorTabComponent);
exports.MonitorTabComponent = MonitorTabComponent;


/***/ },

/***/ "./src/config.ts"
/*!***********************!*\
  !*** ./src/config.ts ***!
  \***********************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorConfigProvider = void 0;
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
/** @hidden */
class MonitorConfigProvider extends tabby_core_1.ConfigProvider {
    constructor() {
        super(...arguments);
        this.defaults = {
            serverMonitor: {
                enabled: true,
                /** 是否监控本机（默认关闭） */
                monitorLocal: false,
                /** 是否自动监控已打开的 SSH 标签页 */
                monitorSSHTabs: true,
                /** 刷新间隔（秒），最小 2 */
                refreshInterval: 5,
                /** CPU 采样窗口（秒），同时用于远端命令内 sleep 与本地两次采样间隔 */
                cpuSampleSeconds: 1,
                /** 远端磁盘查询的挂载点（用于告警阈值；展示为全量挂载点） */
                diskMount: '/',
                /** 阈值告警：百分比，0 表示关闭该告警 */
                thresholds: {
                    cpu: 90,
                    memory: 90,
                    disk: 90,
                },
                /** 同一目标同类告警的冷却时间（秒） */
                alertCooldown: 60,
                /** 展示项勾选：控制卡片中各区块是否显示 */
                display: {
                    publicIp: true,
                    cpu: true,
                    mem: true,
                    swap: true,
                    disk: true,
                    load: true,
                    procs: true,
                    uptime: true,
                },
                /** 占用条颜色模式：auto = 按占用分级（绿/橙/红）；custom = 自定义单色 */
                barColorMode: 'auto',
                /** 自定义占用条颜色（barColorMode = custom 时生效） */
                barColorCustom: '#81c784',
            },
            hotkeys: {
                'open-server-monitor': null,
            },
        };
    }
}
exports.MonitorConfigProvider = MonitorConfigProvider;


/***/ },

/***/ "./src/hotkeys.ts"
/*!************************!*\
  !*** ./src/hotkeys.ts ***!
  \************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorHotkeysProvider = void 0;
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
/** @hidden */
class MonitorHotkeysProvider extends tabby_core_1.HotkeyProvider {
    provide() {
        return Promise.resolve([
            { id: 'open-server-monitor', name: '打开服务器状态监控' },
        ]);
    }
}
exports.MonitorHotkeysProvider = MonitorHotkeysProvider;


/***/ },

/***/ "./src/icons.ts"
/*!**********************!*\
  !*** ./src/icons.ts ***!
  \**********************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MONITOR_ICON_SVG = void 0;
/** 工具栏 / 标签页 / 设置页共用的 SVG 图标（三根柱状图，监控/心率风格） */
exports.MONITOR_ICON_SVG = '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" class="svg-inline--fa" aria-hidden="true">'
    + '<path fill="currentColor" d="M48 288a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v144a16 16 0 0 1-16 16H64a16 16 0 0 1-16-16V288zm160-128a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v272a16 16 0 0 1-16 16h-64a16 16 0 0 1-16-16V160zm160-96a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v368a16 16 0 0 1-16 16h-64a16 16 0 0 1-16-16V64z"/>'
    + '</svg>';


/***/ },

/***/ "./src/index.ts"
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorPaneComponent = exports.MonitorCardComponent = exports.MonitorService = exports.MonitorTabComponent = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const common_1 = __webpack_require__(/*! @angular/common */ "@angular/common");
const forms_1 = __webpack_require__(/*! @angular/forms */ "@angular/forms");
const tabby_core_1 = __importStar(__webpack_require__(/*! tabby-core */ "tabby-core"));
const tabby_settings_1 = __webpack_require__(/*! tabby-settings */ "tabby-settings");
const config_1 = __webpack_require__(/*! ./config */ "./src/config.ts");
const hotkeys_1 = __webpack_require__(/*! ./hotkeys */ "./src/hotkeys.ts");
const buttonProvider_1 = __webpack_require__(/*! ./buttonProvider */ "./src/buttonProvider.ts");
const settings_1 = __webpack_require__(/*! ./settings */ "./src/settings.ts");
const monitor_service_1 = __webpack_require__(/*! ./services/monitor.service */ "./src/services/monitor.service.ts");
Object.defineProperty(exports, "MonitorService", { enumerable: true, get: function () { return monitor_service_1.MonitorService; } });
const monitorTab_component_1 = __webpack_require__(/*! ./components/monitorTab.component */ "./src/components/monitorTab.component.ts");
Object.defineProperty(exports, "MonitorTabComponent", { enumerable: true, get: function () { return monitorTab_component_1.MonitorTabComponent; } });
const monitorSettings_component_1 = __webpack_require__(/*! ./components/monitorSettings.component */ "./src/components/monitorSettings.component.ts");
const monitorCard_component_1 = __webpack_require__(/*! ./components/monitorCard.component */ "./src/components/monitorCard.component.ts");
Object.defineProperty(exports, "MonitorCardComponent", { enumerable: true, get: function () { return monitorCard_component_1.MonitorCardComponent; } });
const monitorPane_component_1 = __webpack_require__(/*! ./components/monitorPane.component */ "./src/components/monitorPane.component.ts");
Object.defineProperty(exports, "MonitorPaneComponent", { enumerable: true, get: function () { return monitorPane_component_1.MonitorPaneComponent; } });
let ServerMonitorModule = class ServerMonitorModule {
};
ServerMonitorModule = __decorate([
    (0, core_1.NgModule)({
        imports: [
            common_1.CommonModule,
            forms_1.FormsModule,
            tabby_core_1.default,
        ],
        providers: [
            { provide: tabby_core_1.ConfigProvider, useClass: config_1.MonitorConfigProvider, multi: true },
            { provide: tabby_core_1.HotkeyProvider, useClass: hotkeys_1.MonitorHotkeysProvider, multi: true },
            { provide: tabby_core_1.ToolbarButtonProvider, useClass: buttonProvider_1.MonitorButtonProvider, multi: true },
            { provide: tabby_settings_1.SettingsTabProvider, useClass: settings_1.MonitorSettingsTabProvider, multi: true },
            monitor_service_1.MonitorService,
        ],
        declarations: [
            monitorTab_component_1.MonitorTabComponent,
            monitorSettings_component_1.MonitorSettingsComponent,
            monitorCard_component_1.MonitorCardComponent,
            monitorPane_component_1.MonitorPaneComponent,
        ],
    })
], ServerMonitorModule);
exports["default"] = ServerMonitorModule;


/***/ },

/***/ "./src/interfaces.ts"
/*!***************************!*\
  !*** ./src/interfaces.ts ***!
  \***************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));


/***/ },

/***/ "./src/services/localProbe.ts"
/*!************************************!*\
  !*** ./src/services/localProbe.ts ***!
  \************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.probeLocalAux = exports.probeLocalQuick = void 0;
const os = __importStar(__webpack_require__(/*! os */ "os"));
const child_process_1 = __webpack_require__(/*! child_process */ "child_process");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
const parse_1 = __webpack_require__(/*! ./parse */ "./src/services/parse.ts");
const publicIp_1 = __webpack_require__(/*! ./publicIp */ "./src/services/publicIp.ts");
function sampleCpu() {
    let total = 0;
    let idle = 0;
    for (const cpu of os.cpus()) {
        for (const t of Object.values(cpu.times)) {
            total += t;
        }
        idle += cpu.times.idle;
    }
    return { total, idle };
}
function execFileAsync(cmd, args, timeout = 5000) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)(cmd, args, { timeout, windowsHide: true }, (err, stdout) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(stdout);
            }
        });
    });
}
/** 本地全部挂载点（df -h 式，macOS/Linux）；Windows 暂不采集 */
async function probeLocalDisks() {
    const out = await execFileAsync('df', ['-kP']);
    return (0, parse_1.parseDf)(out);
}
/**
 * 阶段1：本机核心快数据（CPU 900ms 采样 + 内存 + 全量磁盘）。
 * 公网 IP 与进程 Top5 由 probeLocalAux 按 TTL 单独采集，不阻塞本阶段回填。
 */
async function probeLocalQuick(platform) {
    const first = sampleCpu();
    await new Promise(resolve => setTimeout(resolve, 900));
    const second = sampleCpu();
    const cpuPercent = (0, parse_1.cpuPercentBetween)(first, second);
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    let disks = [];
    if (platform !== tabby_core_1.Platform.Web) {
        disks = await probeLocalDisks().catch(() => []);
    }
    return {
        hostname: os.hostname(),
        cpuCores: os.cpus().length,
        cpuPercent: cpuPercent === null ? null : +cpuPercent.toFixed(1),
        loadAvg: os.loadavg(),
        mem: { total: memTotal, available: memFree, used: memTotal - memFree },
        swap: null,
        disk: (0, parse_1.pickDisk)(disks, '/'),
        disks,
        uptimeSeconds: Math.floor(os.uptime()),
    };
}
exports.probeLocalQuick = probeLocalQuick;
/** 阶段2（按 TTL）：本机公网 IP（IPv4 优先）+ 进程 Top5 */
async function probeLocalAux(opts) {
    const result = {};
    if (opts.wantIp) {
        result.publicIp = await (0, publicIp_1.fetchLocalPublicIp)().catch(() => null);
    }
    if (opts.wantProcs) {
        const psOut = await execFileAsync('ps', ['-Ao', 'pid,pcpu,pmem,comm'], 5000).catch(() => '');
        const top = (0, parse_1.topProcs)((0, parse_1.parsePsOutput)(psOut));
        result.cpuTop5 = top.cpu;
        result.memTop5 = top.mem;
    }
    return result;
}
exports.probeLocalAux = probeLocalAux;


/***/ },

/***/ "./src/services/monitor.service.ts"
/*!*****************************************!*\
  !*** ./src/services/monitor.service.ts ***!
  \*****************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MonitorService_1;
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorService = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const rxjs_1 = __webpack_require__(/*! rxjs */ "rxjs");
const operators_1 = __webpack_require__(/*! rxjs/operators */ "rxjs/operators");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
const localProbe_1 = __webpack_require__(/*! ./localProbe */ "./src/services/localProbe.ts");
const remoteProbe_1 = __webpack_require__(/*! ./remoteProbe */ "./src/services/remoteProbe.ts");
/**
 * 监控引擎：
 * - 定时刷新本地与所有已打开 SSH 标签页的 CPU / 内存 / GPU / 磁盘 / 负载
 * - SSH 采集通过会话的 exec 通道执行只读命令，不占用终端输入
 * - 超过阈值时弹出通知（带冷却）
 */
let MonitorService = MonitorService_1 = class MonitorService {
    constructor(app, config, notifications, log, hostApp) {
        this.app = app;
        this.config = config;
        this.notifications = notifications;
        this.hostApp = hostApp;
        this.targets$ = new rxjs_1.BehaviorSubject([]);
        this.lastRefresh = null;
        this.refreshing = false;
        this.timer = null;
        this.alertLastFired = new Map();
        this.stateCache = new Map();
        this.auxCache = new Map();
        this.pendingRefresh = false;
        /** 最近一次采集的目标列表（供任何时机的 notify 推送最新数据，包括后台低频阶段完成时） */
        this.lastDescriptors = [];
        this.logger = log.create('server-monitor');
        this.config.ready$.toPromise().then(() => {
            this.startLoop();
            // 标签页开/关时立即刷新，新打开的 SSH 会话可以马上被发现
            this.app.tabsChanged$.pipe((0, operators_1.debounceTime)(200)).subscribe(() => this.refresh());
        });
    }
    get settings() {
        var _a;
        return (_a = this.config.store.serverMonitor) !== null && _a !== void 0 ? _a : {};
    }
    /** 立即刷新一轮 */
    async refresh() {
        const cfg = this.settings;
        if (!cfg.enabled) {
            this.stateCache.clear();
            this.targets$.next([]);
            this.scheduleNextTick();
            return;
        }
        if (this.refreshing) {
            // 正在探测时收到新请求：排队，当前轮结束后立刻补刷一轮
            this.pendingRefresh = true;
            return;
        }
        this.refreshing = true;
        try {
            const descriptors = this.collectTargets(cfg);
            this.lastDescriptors = descriptors;
            // 先推送目标列表：新打开的 SSH 会话可以立即出现在面板上（骨架屏）
            this.targets$.next(descriptors);
            // 分级回填：各目标、各阶段完成即推送，先查到的先展示（磁盘等快数据不等 CPU/IP/进程）
            const notify = () => this.targets$.next(this.lastDescriptors);
            await Promise.all(descriptors.map(t => this.probeTarget(t, cfg, notify)));
            this.lastRefresh = new Date();
            this.targets$.next(descriptors);
        }
        catch (err) {
            this.logger.error(`刷新失败: ${err}`);
        }
        finally {
            this.refreshing = false;
            // 每轮结束按最新状态重排下一轮：标签恢复/连接就绪触发的刷新也会重排，
            // 避免“状态已变、旧定时器仍在长间隔里等待”的启动缝隙（重启后首填慢的根因）
            if (this.pendingRefresh) {
                this.pendingRefresh = false;
                this.scheduleNextTick(0.05);
            }
            else {
                this.scheduleNextTick();
            }
        }
    }
    /** 收集监控目标：本机 + 每台已连接 SSH 服务器（按主机去重） */
    collectTargets(cfg) {
        var _a, _b, _c, _d, _e;
        const result = [];
        const seen = new Set();
        if (cfg.monitorLocal) {
            const id = 'local';
            seen.add(id);
            result.push(this.merged(id, 'local', '本地主机', undefined));
        }
        if (cfg.monitorSSHTabs && this.hostApp.platform !== tabby_core_1.Platform.Web) {
            // Tabby 会把通过配置选择器打开的标签包装进 SplitTabComponent（分屏容器），
            // 因此必须递归展平分屏子标签，否则新开的 SSH 会话会被漏掉。
            // 按 SSH profile 收集（不要求会话已建立）：标签一打开即入列，
            // 面板立即展示骨架屏，会话就绪后再回写数据（消除秒级等待）。
            for (const tab of this.flattenTabs(this.app.tabs)) {
                const sshTab = tab;
                if (!((_b = (_a = sshTab === null || sshTab === void 0 ? void 0 : sshTab.profile) === null || _a === void 0 ? void 0 : _a.options) === null || _b === void 0 ? void 0 : _b.host)) {
                    continue;
                }
                // 仅 SSH 类型：排除 RDP/Telnet 等同样带 host 的配置
                if (((_c = sshTab.profile) === null || _c === void 0 ? void 0 : _c.type) !== 'ssh' && !('sshSession' in sshTab)) {
                    continue;
                }
                const o = sshTab.profile.options;
                const id = `ssh:${o.user || 'default'}@${o.host}:${(_d = o.port) !== null && _d !== void 0 ? _d : 22}`;
                if (seen.has(id)) {
                    continue; // 多个标签页复用同一会话时只保留一个
                }
                seen.add(id);
                result.push(this.merged(id, 'ssh', `${o.user ? o.user + '@' : ''}${o.host}:${(_e = o.port) !== null && _e !== void 0 ? _e : 22}`, sshTab));
            }
        }
        // 清理已关闭目标的状态与低频数据缓存
        for (const key of [...this.stateCache.keys()]) {
            if (!seen.has(key)) {
                this.stateCache.delete(key);
                this.auxCache.delete(key);
            }
        }
        return result;
    }
    /** 递归展平标签列表：分屏容器展开为其内部的所有子标签 */
    flattenTabs(tabs) {
        const result = [];
        for (const tab of tabs) {
            if (tab instanceof tabby_core_1.SplitTabComponent) {
                result.push(...this.flattenTabs(tab.getAllTabs()));
            }
            else {
                result.push(tab);
            }
        }
        return result;
    }
    merged(id, kind, label, ref) {
        var _a, _b, _c;
        const prev = this.stateCache.get(id);
        const target = {
            id, kind, label, ref,
            stats: (_a = prev === null || prev === void 0 ? void 0 : prev.stats) !== null && _a !== void 0 ? _a : null,
            error: (_b = prev === null || prev === void 0 ? void 0 : prev.error) !== null && _b !== void 0 ? _b : null,
            lastUpdated: (_c = prev === null || prev === void 0 ? void 0 : prev.lastUpdated) !== null && _c !== void 0 ? _c : null,
        };
        this.stateCache.set(id, target);
        return target;
    }
    async probeTarget(target, cfg, notify) {
        var _a, _b, _c;
        // 低频数据（公网 IP / 进程 Top5）按 TTL 采集并缓存，高频刷新轮次只回填不重复执行
        const aux = this.auxFor(target.id);
        const t0 = Date.now();
        const wantIp = t0 - aux.ipAt > (aux.ip ? MonitorService_1.IP_TTL_OK : MonitorService_1.IP_TTL_FAIL);
        const wantProcs = t0 - aux.procAt > MonitorService_1.PROC_TTL;
        const applyAux = (stats) => {
            stats.publicIp = aux.ip;
            stats.cpuTop5 = aux.cpuTop5;
            stats.memTop5 = aux.memTop5;
        };
        const commit = (stats) => {
            target.stats = stats;
            target.error = null;
            target.lastUpdated = Date.now();
            this.checkThresholds(target, stats, cfg);
            notify();
        };
        /** 低频阶段：启动即记时间（防并发重复、失败也按 TTL 退避），后台执行不阻塞刷新周期 */
        const runAuxDetached = (fetcher) => {
            if (wantIp) {
                aux.ipAt = Date.now();
            }
            if (wantProcs) {
                aux.procAt = Date.now();
            }
            void (async () => {
                var _a, _b;
                let extra = null;
                try {
                    extra = await fetcher();
                }
                catch {
                    extra = null;
                }
                if (extra === null || extra === void 0 ? void 0 : extra.publicIp) {
                    aux.ip = extra.publicIp; // 采集失败时保留旧值，不抹掉已展示的 IP
                }
                if ((_a = extra === null || extra === void 0 ? void 0 : extra.cpuTop5) === null || _a === void 0 ? void 0 : _a.length) {
                    aux.cpuTop5 = extra.cpuTop5;
                    aux.memTop5 = (_b = extra.memTop5) !== null && _b !== void 0 ? _b : [];
                }
                // 回填到该目标的最新对象（跨刷新周期仍能写到当前展示的数据）
                const latest = this.stateCache.get(target.id);
                if (latest === null || latest === void 0 ? void 0 : latest.stats) {
                    applyAux(latest.stats);
                    notify();
                }
            })().catch(() => undefined);
        };
        try {
            if (target.kind === 'local') {
                // 阶段1：本机核心快数据先回填
                const stats = await (0, localProbe_1.probeLocalQuick)(this.hostApp.platform);
                applyAux(stats);
                commit(stats);
                // 阶段2：公网 IP / 进程 Top5（按 TTL，后台执行不阻塞刷新周期）
                if ((wantIp || wantProcs) && this.hostApp.platform !== tabby_core_1.Platform.Web) {
                    runAuxDetached(() => (0, localProbe_1.probeLocalAux)({ wantIp, wantProcs }));
                }
                return;
            }
            const session = (_a = target.ref) === null || _a === void 0 ? void 0 : _a.sshSession;
            if (!session) {
                // 连接中（会话尚未建立）：静默跳过探测，不报错，面板保留骨架屏等待就绪
                return;
            }
            // 阶段1：快数据（磁盘/内存/负载等）立即回填，不等 CPU 采样与外网请求
            const quick = await (0, remoteProbe_1.probeSSHQuick)(session, (_b = cfg.diskMount) !== null && _b !== void 0 ? _b : '/');
            applyAux(quick.stats);
            commit(quick.stats);
            // 阶段2：CPU 补采（Linux 本地等待采样窗口；macOS 远端 top -l 2 自带采样）
            try {
                const cpu = await (0, remoteProbe_1.probeSSHCpu)(session, (_c = cfg.cpuSampleSeconds) !== null && _c !== void 0 ? _c : 1, quick);
                if (cpu !== null && target.stats === quick.stats) {
                    quick.stats.cpuPercent = cpu;
                    this.checkThresholds(target, quick.stats, cfg);
                    notify();
                }
            }
            catch {
                // CPU 补采失败：保留已回填的快数据
            }
            // 阶段3：公网 IP / 进程 Top5（按 TTL，后台执行不阻塞快数据与刷新周期）
            if (wantIp || wantProcs) {
                runAuxDetached(() => (0, remoteProbe_1.probeSSHAux)(session, { wantIp, wantProcs }));
            }
        }
        catch (err) {
            target.error = (err === null || err === void 0 ? void 0 : err.message) ? String(err.message) : String(err);
            this.logger.warn(`${target.label}: ${target.error}`);
            notify();
        }
    }
    /** 阈值告警（带冷却） */
    checkThresholds(target, stats, cfg) {
        var _a, _b, _c, _d, _e;
        const thresholds = (_a = cfg.thresholds) !== null && _a !== void 0 ? _a : {};
        const cooldownMs = Math.max(0, (_b = cfg.alertCooldown) !== null && _b !== void 0 ? _b : 60) * 1000;
        const checks = [
            ['CPU', stats.cpuPercent, thresholds.cpu],
            ['内存', this.memPercent(stats), thresholds.memory],
            ['磁盘', (_d = (_c = stats.disk) === null || _c === void 0 ? void 0 : _c.usedPercent) !== null && _d !== void 0 ? _d : null, thresholds.disk],
        ];
        for (const [name, value, threshold] of checks) {
            if (!threshold || value === null || value < threshold) {
                continue;
            }
            const key = `${target.id}:${name}`;
            const now = Date.now();
            if (now - ((_e = this.alertLastFired.get(key)) !== null && _e !== void 0 ? _e : 0) < cooldownMs) {
                continue;
            }
            this.alertLastFired.set(key, now);
            this.notifications.error(`${target.label} ${name}占用 ${Math.round(value)}%`, `已超过告警阈值 ${threshold}%`);
        }
    }
    memPercent(stats) {
        if (!stats.mem || !stats.mem.total) {
            return null;
        }
        return stats.mem.used / stats.mem.total * 100;
    }
    auxFor(id) {
        let aux = this.auxCache.get(id);
        if (!aux) {
            aux = { ip: null, ipAt: 0, procAt: 0, cpuTop5: [], memTop5: [] };
            this.auxCache.set(id, aux);
        }
        return aux;
    }
    /** 是否存在“已有 SSH 配置但会话尚未就绪”的标签（正在连接中） */
    hasConnectingSSHTab() {
        var _a, _b, _c, _d;
        if (!((_a = this.config.store.serverMonitor) === null || _a === void 0 ? void 0 : _a.monitorSSHTabs)) {
            return false;
        }
        for (const tab of this.flattenTabs(this.app.tabs)) {
            const t = tab;
            if (((_c = (_b = t === null || t === void 0 ? void 0 : t.profile) === null || _b === void 0 ? void 0 : _b.options) === null || _c === void 0 ? void 0 : _c.host) && !((_d = t === null || t === void 0 ? void 0 : t.sshSession) === null || _d === void 0 ? void 0 : _d.open)) {
                return true;
            }
        }
        return false;
    }
    /** 有 SSH 目标等待首次数据（连接中或待首次探测）：1 秒快轮询，会话就绪后尽快回填 */
    hasPendingTarget() {
        var _a;
        if (!((_a = this.config.store.serverMonitor) === null || _a === void 0 ? void 0 : _a.monitorSSHTabs)) {
            return false;
        }
        for (const target of this.stateCache.values()) {
            if (target.kind === 'ssh' && !target.stats && !target.error) {
                return true;
            }
        }
        return false;
    }
    /** 统一调度：每轮刷新结束后按最新状态重排下一轮（连接中 1s、待回填 0.5s、否则常规间隔） */
    scheduleNextTick(delaySeconds) {
        var _a;
        if (this.timer) {
            clearTimeout(this.timer);
        }
        const delay = delaySeconds !== null && delaySeconds !== void 0 ? delaySeconds : (this.hasConnectingSSHTab()
            ? 1
            : this.hasPendingTarget()
                ? 0.5
                : Math.max(2, (_a = this.settings.refreshInterval) !== null && _a !== void 0 ? _a : 5));
        this.timer = setTimeout(() => {
            void this.refresh().catch(err => this.logger.error(`监控循环异常: ${err}`));
        }, delay * 1000);
    }
    startLoop() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.scheduleNextTick(0);
    }
};
/** 公网 IP 成功后的复用时长（IP 极少变化） */
MonitorService.IP_TTL_OK = 15 * 60 * 1000;
/** 公网 IP 采集失败后的重试间隔（避免每轮都发外部请求） */
MonitorService.IP_TTL_FAIL = 5 * 60 * 1000;
/** 进程 Top5 采集间隔（ps 为轻量只读命令，但不随 5 秒主循环执行） */
MonitorService.PROC_TTL = 30 * 1000;
MonitorService = MonitorService_1 = __decorate([
    (0, core_1.Injectable)({ providedIn: 'root' }),
    __metadata("design:paramtypes", [typeof (_a = typeof tabby_core_1.AppService !== "undefined" && tabby_core_1.AppService) === "function" ? _a : Object, typeof (_b = typeof tabby_core_1.ConfigService !== "undefined" && tabby_core_1.ConfigService) === "function" ? _b : Object, typeof (_c = typeof tabby_core_1.NotificationsService !== "undefined" && tabby_core_1.NotificationsService) === "function" ? _c : Object, typeof (_d = typeof tabby_core_1.LogService !== "undefined" && tabby_core_1.LogService) === "function" ? _d : Object, typeof (_e = typeof tabby_core_1.HostAppService !== "undefined" && tabby_core_1.HostAppService) === "function" ? _e : Object])
], MonitorService);
exports.MonitorService = MonitorService;


/***/ },

/***/ "./src/services/parse.ts"
/*!*******************************!*\
  !*** ./src/services/parse.ts ***!
  \*******************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseMacUptime = exports.parseMacLoadavg = exports.parseMacSwap = exports.parseMacMem = exports.parseMacTopCpuLine = exports.topProcs = exports.parsePsOutput = exports.isValidIp = exports.pickDisk = exports.parseDf = exports.parseDfLine = exports.swapFromMeminfo = exports.memFromMeminfo = exports.parseMeminfo = exports.cpuPercentBetween = exports.parseCpuStatLine = void 0;
/** 解析 /proc/stat 首行：cpu user nice system idle iowait irq softirq ... */
function parseCpuStatLine(line) {
    var _a, _b;
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== 'cpu') {
        return null;
    }
    const nums = parts.slice(1).map(x => parseInt(x, 10) || 0);
    const total = nums.reduce((a, b) => a + b, 0);
    const idle = ((_a = nums[3]) !== null && _a !== void 0 ? _a : 0) + ((_b = nums[4]) !== null && _b !== void 0 ? _b : 0); // idle + iowait
    return { total, idle };
}
exports.parseCpuStatLine = parseCpuStatLine;
function cpuPercentBetween(first, second) {
    if (!first || !second) {
        return null;
    }
    const total = second.total - first.total;
    const idle = second.idle - first.idle;
    if (total <= 0) {
        return null;
    }
    return Math.max(0, Math.min(100, (total - idle) / total * 100));
}
exports.cpuPercentBetween = cpuPercentBetween;
/** 解析 /proc/meminfo */
function parseMeminfo(text) {
    const result = {};
    for (const line of text.split('\n')) {
        const m = line.match(/^(\w+):\s+(\d+)/);
        if (m) {
            result[m[1]] = parseInt(m[2], 10) * 1024; // kB → bytes
        }
    }
    return result;
}
exports.parseMeminfo = parseMeminfo;
function memFromMeminfo(info) {
    var _a, _b, _c, _d;
    const total = info['MemTotal'];
    if (!total) {
        return null;
    }
    const available = (_a = info['MemAvailable']) !== null && _a !== void 0 ? _a : (((_b = info['MemFree']) !== null && _b !== void 0 ? _b : 0) + ((_c = info['Buffers']) !== null && _c !== void 0 ? _c : 0) + ((_d = info['Cached']) !== null && _d !== void 0 ? _d : 0));
    return { total, available, used: Math.max(0, total - available) };
}
exports.memFromMeminfo = memFromMeminfo;
function swapFromMeminfo(info) {
    const total = info['SwapTotal'];
    const free = info['SwapFree'];
    if (total === undefined || free === undefined) {
        return null;
    }
    return { total, used: Math.max(0, total - free) };
}
exports.swapFromMeminfo = swapFromMeminfo;
/** 解析 `df -kP` 的一行数据（单位 kB）；挂载点可能含空格，取第 6 列起的全部剩余内容 */
function parseDfLine(line) {
    const m = line.trim().match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (!m) {
        return null;
    }
    const blocks = parseInt(m[2], 10);
    const used = parseInt(m[3], 10);
    const capacity = parseInt(m[5], 10);
    if (isNaN(blocks) || isNaN(used)) {
        return null;
    }
    return {
        mount: m[6].trim(),
        total: blocks * 1024,
        used: used * 1024,
        usedPercent: isNaN(capacity) ? 0 : capacity,
    };
}
exports.parseDfLine = parseDfLine;
/** 解析完整 `df -kP` 输出的全部数据行（与 df -h 展示一致）；跳过表头与容量为 0 的行 */
function parseDf(text) {
    const result = [];
    for (const line of text.split('\n')) {
        const d = parseDfLine(line);
        if (d && d.total > 0) {
            result.push(d);
        }
    }
    return result;
}
exports.parseDf = parseDf;
/** 从挂载点列表挑出用于告警的磁盘：精确匹配配置挂载点 → / → 第一行（与原单点 df 语义一致） */
function pickDisk(disks, mount) {
    var _a, _b, _c;
    return (_c = (_b = (_a = disks.find(d => d.mount === mount)) !== null && _a !== void 0 ? _a : disks.find(d => d.mount === '/')) !== null && _b !== void 0 ? _b : disks[0]) !== null && _c !== void 0 ? _c : null;
}
exports.pickDisk = pickDisk;
/** 校验字符串是否为 IPv4/IPv6 地址 */
function isValidIp(value) {
    const v = (value !== null && value !== void 0 ? value : '').trim();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
        return v.split('.').every(p => parseInt(p, 10) <= 255);
    }
    return v.length <= 45 && v.includes(':') && /^[0-9a-fA-F:.]+$/.test(v);
}
exports.isValidIp = isValidIp;
/** 解析 `ps -Ao pid,pcpu,pmem,comm` 输出（跳过表头与异常行，最多取 1000 行封顶） */
function parsePsOutput(text) {
    const result = [];
    for (const line of text.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/);
        if (!m) {
            continue;
        }
        result.push({
            pid: parseInt(m[1], 10),
            cpu: parseFloat(m[2]) || 0,
            mem: parseFloat(m[3]) || 0,
            name: m[4].trim(),
        });
        if (result.length >= 1000) {
            break;
        }
    }
    return result;
}
exports.parsePsOutput = parsePsOutput;
/** 取 CPU / 内存占用倒序 Top5 */
function topProcs(procs) {
    return {
        cpu: [...procs].sort((a, b) => b.cpu - a.cpu).slice(0, 5),
        mem: [...procs].sort((a, b) => b.mem - a.mem).slice(0, 5),
    };
}
exports.topProcs = topProcs;
/**
 * 以下为 macOS（Darwin）解析器，采集命令均为普通用户可执行的只读命令：
 * top -l 2 / vm_stat / sysctl
 */
/** 解析 `top -l 2` 输出中的 CPU 行："CPU usage: 5.23% user, 6.78% sys, 88.99% idle" */
function parseMacTopCpuLine(line) {
    const m = line.match(/([\d.]+)%\s*idle/i);
    if (!m) {
        return null;
    }
    const idle = parseFloat(m[1]);
    if (isNaN(idle)) {
        return null;
    }
    return Math.max(0, Math.min(100, 100 - idle));
}
exports.parseMacTopCpuLine = parseMacTopCpuLine;
/**
 * 解析 macOS 内存：首行为 sysctl hw.memsize（总字节），其余为 vm_stat 输出。
 * 已用 = active + wired + compressor 页（与系统监视器口径近似）
 */
function parseMacMem(text) {
    var _a, _b;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const total = parseInt((_a = lines[0]) !== null && _a !== void 0 ? _a : '', 10);
    if (!total) {
        return null;
    }
    let pageSize = 4096;
    const ps = ((_b = lines.find(l => l.includes('page size of'))) !== null && _b !== void 0 ? _b : '').match(/page size of (\d+)/);
    if (ps) {
        pageSize = parseInt(ps[1], 10);
    }
    const pages = (prefix) => {
        var _a;
        const line = (_a = lines.find(l => l.startsWith(prefix))) !== null && _a !== void 0 ? _a : '';
        const m = line.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
    };
    const usedPages = pages('Pages active:') + pages('Pages wired down:') + pages('Pages occupied by compressor:');
    const used = Math.min(total, usedPages * pageSize);
    return { total, used, available: Math.max(0, total - used) };
}
exports.parseMacMem = parseMacMem;
/** 解析 `sysctl vm.swapusage`："total = 4096.00M used = 512.50M" */
function parseMacSwap(text) {
    var _a, _b;
    const conv = (v, unit) => {
        const n = parseFloat(v);
        switch (unit.toUpperCase()) {
            case 'K': return n * 1024;
            case 'M': return n * 1024 * 1024;
            case 'G': return n * 1024 * 1024 * 1024;
            default: return n;
        }
    };
    const t = text.match(/total\s*=\s*([\d.]+)\s*([KMG]?)/i);
    const u = text.match(/used\s*=\s*([\d.]+)\s*([KMG]?)/i);
    if (!t) {
        return null;
    }
    return { total: conv(t[1], (_a = t[2]) !== null && _a !== void 0 ? _a : ''), used: u ? conv(u[1], (_b = u[2]) !== null && _b !== void 0 ? _b : '') : 0 };
}
exports.parseMacSwap = parseMacSwap;
/** 解析 `sysctl vm.loadavg`："{ 1.90 2.10 2.50 }" */
function parseMacLoadavg(text) {
    var _a;
    const nums = ((_a = text.match(/[\d.]+/g)) !== null && _a !== void 0 ? _a : []).map(Number).slice(0, 3);
    if (nums.length < 3 || nums.some(x => isNaN(x))) {
        return null;
    }
    return [nums[0], nums[1], nums[2]];
}
exports.parseMacLoadavg = parseMacLoadavg;
/** 解析 `sysctl kern.boottime`："{ sec = 1699999999, usec = 123456 }" → 已运行秒数 */
function parseMacUptime(text) {
    const m = text.match(/sec\s*=\s*(\d+)/);
    if (!m) {
        return null;
    }
    const bootSec = parseInt(m[1], 10);
    const up = Math.floor(Date.now() / 1000) - bootSec;
    return up > 0 ? up : null;
}
exports.parseMacUptime = parseMacUptime;


/***/ },

/***/ "./src/services/publicIp.ts"
/*!**********************************!*\
  !*** ./src/services/publicIp.ts ***!
  \**********************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.fetchLocalPublicIp = void 0;
const https = __importStar(__webpack_require__(/*! https */ "https"));
const parse_1 = __webpack_require__(/*! ./parse */ "./src/services/parse.ts");
/** 纯文本 IP 接口：IPv4 优先（api4/ipv4 子域仅返回 A 记录），最后回退任意族 */
const ENDPOINTS = ['api4.ipify.org', 'ipv4.icanhazip.com', 'api.ipify.org'];
/**
 * 获取本机公网 IP：短超时、依次尝试两个接口、失败不在此处重试（重试频率由上层 TTL 控制）。
 * 成功返回 IP，全部失败返回 null；单次最多阻塞 2 × timeoutMs，且仅在 TTL 到期时被调用。
 */
function fetchLocalPublicIp(timeoutMs = 3000) {
    return new Promise(resolve => {
        let index = 0;
        const attempt = () => {
            if (index >= ENDPOINTS.length) {
                resolve(null);
                return;
            }
            const host = ENDPOINTS[index++];
            // timeout 触发 destroy 后会再触发 error，用 handled 保证只走一次
            let handled = false;
            const next = (ip) => {
                if (handled) {
                    return;
                }
                handled = true;
                if (ip !== null) {
                    resolve(ip);
                }
                else {
                    attempt();
                }
            };
            const req = https.get({
                host,
                path: '/',
                timeout: timeoutMs,
                headers: { 'user-agent': 'curl/8.0' },
            }, res => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const ip = Buffer.concat(chunks).toString('utf8').trim();
                    next(res.statusCode && res.statusCode >= 200 && res.statusCode < 300 && (0, parse_1.isValidIp)(ip) ? ip : null);
                });
            });
            req.on('timeout', () => {
                req.destroy();
                next(null);
            });
            req.on('error', () => next(null));
        };
        attempt();
    });
}
exports.fetchLocalPublicIp = fetchLocalPublicIp;


/***/ },

/***/ "./src/services/remoteProbe.ts"
/*!*************************************!*\
  !*** ./src/services/remoteProbe.ts ***!
  \*************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.probeSSHAux = exports.probeSSHCpu = exports.probeSSHQuick = exports.parseRemoteOutput = exports.execRemoteCommand = exports.buildRemoteAuxCommand = exports.buildRemoteCpuCommand = exports.buildRemoteQuickCommand = void 0;
const parse_1 = __webpack_require__(/*! ./parse */ "./src/services/parse.ts");
const M_OS = '#SM#OS';
const M_HOST = '#SM#HOST';
const M_CPU = '#SM#CPU';
const M_STAT1 = '#SM#STAT1';
const M_STAT2 = '#SM#STAT2';
const M_MEM = '#SM#MEM';
const M_LOAD = '#SM#LOAD';
const M_CORES = '#SM#CORES';
const M_UPTIME = '#SM#UPTIME';
const M_SWAP = '#SM#SWAP';
const M_DISK = '#SM#DISK';
const M_IP = '#SM#IP';
const M_PS = '#SM#PS';
const M_END = '#SM#END';
/**
 * 采集分三个阶段，先查到的先回填（不互相等待）：
 * 1. 快数据：无 sleep、无外网请求——磁盘/内存/负载等连接后立即展示；
 * 2. CPU 补采：本地等待采样窗口（Linux 读第二次 /proc/stat；macOS 远端 top -l 2 自带采样）；
 * 3. 低频数据：公网 IP（IPv4 优先）与进程 Top5，仅 TTL 到期时独立执行，不阻塞前两阶段。
 * 所有命令均为普通用户可执行的只读操作，无需 sudo。
 */
/** 阶段1：快速核心采集命令（跨平台，uname 分支） */
function buildRemoteQuickCommand() {
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
    ].join('\n');
}
exports.buildRemoteQuickCommand = buildRemoteQuickCommand;
/** 阶段2：CPU 补采命令（按快阶段识别的 OS 分支） */
function buildRemoteCpuCommand(os, sampleSeconds) {
    const sample = Math.max(1, Math.min(10, Math.round(sampleSeconds)));
    if (/darwin/i.test(os)) {
        return [
            `echo '${M_CPU}'`,
            `top -l 2 -n 0 -s ${sample} 2>/dev/null | grep '^CPU usage' | tail -n 1`,
            `echo '${M_END}'`,
        ].join('\n');
    }
    return [
        `echo '${M_STAT2}'`,
        'head -n 1 /proc/stat 2>/dev/null',
        `echo '${M_END}'`,
    ].join('\n');
}
exports.buildRemoteCpuCommand = buildRemoteCpuCommand;
/** 阶段3：低频数据命令（公网 IP IPv4 优先 + 进程 Top5；仅 TTL 到期时携带对应开关） */
function buildRemoteAuxCommand(opts = {}) {
    const ipCmd = opts.wantIp
        ? `(curl -s --max-time 2 https://api4.ipify.org 2>/dev/null || curl -s --max-time 2 https://ipv4.icanhazip.com 2>/dev/null || curl -s --max-time 2 https://api.ipify.org 2>/dev/null || true)`
        : `true`;
    const psCmd = opts.wantProcs
        ? `ps -Ao pid,pcpu,pmem,comm 2>/dev/null | head -n 1000 || true`
        : `true`;
    return [
        `echo '${M_IP}'`,
        ipCmd,
        `echo '${M_PS}'`,
        psCmd,
        `echo '${M_END}'`,
    ].join('\n');
}
exports.buildRemoteAuxCommand = buildRemoteAuxCommand;
function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        promise.then(value => { clearTimeout(timer); resolve(value); }, err => { clearTimeout(timer); reject(err); });
    });
}
/** 通过 russh 通道执行命令并收集输出（不经过用户终端，不影响交互会话）；整条链路（含通道打开/激活）受超时约束 */
async function execRemoteCommand(sshSession, command, timeoutMs = 25000) {
    const ssh = sshSession.ssh;
    if (!ssh) {
        throw new Error('SSH 连接尚未就绪');
    }
    const openPromise = ssh.openSessionChannel();
    let ch = null;
    try {
        const opened = await withTimeout(openPromise, timeoutMs, 'SSH 通道打开超时');
        ch = await withTimeout(ssh.activateChannel(opened), timeoutMs, 'SSH 通道激活超时');
    }
    catch (err) {
        // 超时后迟到的通道直接关闭，避免泄漏
        openPromise.then((c) => c.close().catch(() => undefined)).catch(() => undefined);
        throw err;
    }
    try {
        return await new Promise((resolve, reject) => {
            const chunks = [];
            const subs = [];
            let settled = false;
            const textSoFar = () => Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
            const finish = (err) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                subs.forEach(s => s.unsubscribe());
                if (err) {
                    reject(err);
                }
                else {
                    resolve(textSoFar());
                }
            };
            const timer = setTimeout(() => finish(new Error('远程采集命令超时')), timeoutMs);
            subs.push(ch.data$.subscribe(d => {
                chunks.push(d);
                // 收到结束标记即完成，不依赖 eof（某些服务器不发送 eof）
                if (textSoFar().includes(M_END)) {
                    finish();
                }
            }));
            subs.push(ch.eof$.subscribe(() => finish()));
            subs.push(ch.closed$.subscribe(() => finish()));
            // 关键：把命令真正发送到远端执行
            ch.requestExec(command).catch(err => finish(err instanceof Error ? err : new Error(String(err))));
        });
    }
    finally {
        ch.close().catch(() => undefined);
    }
}
exports.execRemoteCommand = execRemoteCommand;
function section(out, startMark, endMark) {
    const i = out.indexOf(startMark);
    if (i < 0) {
        return '';
    }
    const start = i + startMark.length;
    const j = out.indexOf(endMark, start);
    return out.slice(start, j < 0 ? undefined : j).trim();
}
function firstLine(text) {
    var _a;
    return ((_a = text.split('\n')[0]) !== null && _a !== void 0 ? _a : '').trim();
}
/** 解析 Linux（/proc）采集输出 */
function parseLinuxOutput(out) {
    const stat1 = (0, parse_1.parseCpuStatLine)(section(out, M_STAT1, M_STAT2));
    const stat2 = (0, parse_1.parseCpuStatLine)(section(out, M_STAT2, M_MEM));
    if (!stat1 && !section(out, M_MEM, M_LOAD)) {
        return null;
    }
    const meminfo = (0, parse_1.parseMeminfo)(section(out, M_MEM, M_LOAD));
    const loadParts = firstLine(section(out, M_LOAD, M_CORES)).split(/\s+/).map(Number);
    const cores = parseInt(firstLine(section(out, M_CORES, M_UPTIME)), 10);
    const uptime = parseFloat(firstLine(section(out, M_UPTIME, M_DISK)));
    const cpuPercent = (0, parse_1.cpuPercentBetween)(stat1, stat2);
    return {
        hostname: firstLine(section(out, M_HOST, M_CPU)) || firstLine(section(out, M_HOST, M_STAT1)) || null,
        cpuCores: isNaN(cores) ? null : cores,
        cpuPercent: cpuPercent === null ? null : +cpuPercent.toFixed(1),
        loadAvg: loadParts.length >= 3 && loadParts.slice(0, 3).every(x => !isNaN(x))
            ? [loadParts[0], loadParts[1], loadParts[2]]
            : null,
        mem: (0, parse_1.memFromMeminfo)(meminfo),
        swap: (0, parse_1.swapFromMeminfo)(meminfo),
        disk: null,
        disks: (0, parse_1.parseDf)(section(out, M_DISK, M_IP)),
        uptimeSeconds: isNaN(uptime) ? null : Math.floor(uptime),
    };
}
/** 解析 macOS（Darwin）采集输出 */
function parseDarwinOutput(out) {
    var _a;
    const cpuSection = section(out, M_CPU, M_MEM);
    const memSection = section(out, M_MEM, M_LOAD);
    if (!cpuSection && !memSection) {
        return null;
    }
    const loadParts = ((_a = section(out, M_LOAD, M_CORES).match(/[\d.]+/g)) !== null && _a !== void 0 ? _a : []).map(Number).slice(0, 3);
    const cores = parseInt(firstLine(section(out, M_CORES, M_UPTIME)), 10);
    const uptime = (0, parse_1.parseMacUptime)(section(out, M_UPTIME, M_SWAP));
    return {
        hostname: firstLine(section(out, M_HOST, M_CPU)) || null,
        cpuCores: isNaN(cores) ? null : cores,
        cpuPercent: (0, parse_1.parseMacTopCpuLine)(cpuSection),
        loadAvg: loadParts.length >= 3 && loadParts.every(x => !isNaN(x))
            ? [loadParts[0], loadParts[1], loadParts[2]]
            : null,
        mem: (0, parse_1.parseMacMem)(memSection),
        swap: (0, parse_1.parseMacSwap)(section(out, M_SWAP, M_DISK)),
        disk: null,
        disks: (0, parse_1.parseDf)(section(out, M_DISK, M_IP)),
        uptimeSeconds: uptime,
    };
}
/** 解析远程采集输出（自动按 OS 分支） */
function parseRemoteOutput(out) {
    const os = firstLine(section(out, M_OS, M_HOST));
    if (/darwin/i.test(os)) {
        return parseDarwinOutput(out);
    }
    if (/linux/i.test(os)) {
        return parseLinuxOutput(out);
    }
    return null;
}
exports.parseRemoteOutput = parseRemoteOutput;
/** 阶段1：快速核心采集——磁盘/内存/负载等立即可回填（无 sleep、无外网请求） */
async function probeSSHQuick(sshSession, diskMount) {
    if (!sshSession.open) {
        throw new Error('SSH 会话未连接');
    }
    const out = await execRemoteCommand(sshSession, buildRemoteQuickCommand(), 10000);
    const stats = parseRemoteOutput(out);
    if (!stats) {
        throw new Error('远程系统不受支持或采集失败（需 Linux 或 macOS，普通用户可读即可）');
    }
    // 全量挂载点已由 parse 得到；告警仍取配置挂载点所在磁盘（与原单点 df 语义一致）
    stats.disk = (0, parse_1.pickDisk)(stats.disks, diskMount || '/');
    return {
        stats,
        os: firstLine(section(out, M_OS, M_HOST)),
        stat1: (0, parse_1.parseCpuStatLine)(section(out, M_STAT1, M_MEM)),
    };
}
exports.probeSSHQuick = probeSSHQuick;
/** 阶段2：CPU 补采（Linux 本地等待采样窗口后读第二次 /proc/stat；macOS 远端 top -l 2 自带采样） */
async function probeSSHCpu(sshSession, sampleSeconds, quick) {
    if (!sshSession.open) {
        return null;
    }
    const sample = Math.max(1, Math.min(10, Math.round(sampleSeconds)));
    const isDarwin = /darwin/i.test(quick.os);
    if (!isDarwin) {
        // Linux：stat1 已在快阶段读取，本地等待采样窗口后再读 stat2
        await new Promise(resolve => setTimeout(resolve, sample * 1000));
    }
    const out = await execRemoteCommand(sshSession, buildRemoteCpuCommand(quick.os, sample), 15000);
    if (isDarwin) {
        const cpu = (0, parse_1.parseMacTopCpuLine)(section(out, M_CPU, M_END));
        return cpu === null ? null : +cpu.toFixed(1);
    }
    const stat2 = (0, parse_1.parseCpuStatLine)(section(out, M_STAT2, M_END));
    const cpu = (0, parse_1.cpuPercentBetween)(quick.stat1, stat2);
    return cpu === null ? null : +cpu.toFixed(1);
}
exports.probeSSHCpu = probeSSHCpu;
/** 阶段3（按 TTL）：公网 IP（IPv4 优先）+ 进程 Top5，独立执行不阻塞快数据 */
async function probeSSHAux(sshSession, opts) {
    if (!sshSession.open) {
        throw new Error('SSH 会话未连接');
    }
    const out = await execRemoteCommand(sshSession, buildRemoteAuxCommand(opts), 20000);
    const result = {};
    if (opts.wantIp) {
        const ip = firstLine(section(out, M_IP, M_PS));
        result.publicIp = (0, parse_1.isValidIp)(ip) ? ip : null;
    }
    if (opts.wantProcs) {
        const top = (0, parse_1.topProcs)((0, parse_1.parsePsOutput)(section(out, M_PS, M_END)));
        result.cpuTop5 = top.cpu;
        result.memTop5 = top.mem;
    }
    return result;
}
exports.probeSSHAux = probeSSHAux;


/***/ },

/***/ "./src/settings.ts"
/*!*************************!*\
  !*** ./src/settings.ts ***!
  \*************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorSettingsTabProvider = void 0;
const tabby_settings_1 = __webpack_require__(/*! tabby-settings */ "tabby-settings");
const monitorSettings_component_1 = __webpack_require__(/*! ./components/monitorSettings.component */ "./src/components/monitorSettings.component.ts");
/** @hidden */
class MonitorSettingsTabProvider extends tabby_settings_1.SettingsTabProvider {
    constructor() {
        super(...arguments);
        this.id = 'server-monitor';
        // 设置侧边栏以 `fa-{{icon}}` 渲染（Font Awesome 类名），不能传 SVG
        this.icon = 'server';
        this.title = '服务器监控';
    }
    getComponentType() {
        return monitorSettings_component_1.MonitorSettingsComponent;
    }
}
exports.MonitorSettingsTabProvider = MonitorSettingsTabProvider;


/***/ },

/***/ "@angular/common"
/*!**********************************!*\
  !*** external "@angular/common" ***!
  \**********************************/
(module) {

module.exports = require("@angular/common");

/***/ },

/***/ "@angular/core"
/*!********************************!*\
  !*** external "@angular/core" ***!
  \********************************/
(module) {

module.exports = require("@angular/core");

/***/ },

/***/ "@angular/forms"
/*!*********************************!*\
  !*** external "@angular/forms" ***!
  \*********************************/
(module) {

module.exports = require("@angular/forms");

/***/ },

/***/ "child_process"
/*!********************************!*\
  !*** external "child_process" ***!
  \********************************/
(module) {

module.exports = require("child_process");

/***/ },

/***/ "https"
/*!************************!*\
  !*** external "https" ***!
  \************************/
(module) {

module.exports = require("https");

/***/ },

/***/ "os"
/*!*********************!*\
  !*** external "os" ***!
  \*********************/
(module) {

module.exports = require("os");

/***/ },

/***/ "rxjs"
/*!***********************!*\
  !*** external "rxjs" ***!
  \***********************/
(module) {

module.exports = require("rxjs");

/***/ },

/***/ "rxjs/operators"
/*!*********************************!*\
  !*** external "rxjs/operators" ***!
  \*********************************/
(module) {

module.exports = require("rxjs/operators");

/***/ },

/***/ "tabby-core"
/*!*****************************!*\
  !*** external "tabby-core" ***!
  \*****************************/
(module) {

module.exports = require("tabby-core");

/***/ },

/***/ "tabby-settings"
/*!*********************************!*\
  !*** external "tabby-settings" ***!
  \*********************************/
(module) {

module.exports = require("tabby-settings");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	const __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		const cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		const module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			const e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	let __webpack_exports__ = __webpack_require__("./src/index.ts");
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=index.js.map