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
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorButtonProvider = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
const monitorTab_component_1 = __webpack_require__(/*! ./components/monitorTab.component */ "./src/components/monitorTab.component.ts");
const monitorOverlay_component_1 = __webpack_require__(/*! ./components/monitorOverlay.component */ "./src/components/monitorOverlay.component.ts");
const monitor_service_1 = __webpack_require__(/*! ./services/monitor.service */ "./src/services/monitor.service.ts");
const icons_1 = __webpack_require__(/*! ./icons */ "./src/icons.ts");
/** @hidden */
let MonitorButtonProvider = class MonitorButtonProvider extends tabby_core_1.ToolbarButtonProvider {
    constructor(app, resolver, appRef, injector, hotkeys, 
    // 注入监控服务，使插件加载后即启动监控循环（支持后台告警）
    monitor) {
        super();
        this.app = app;
        this.resolver = resolver;
        this.appRef = appRef;
        this.injector = injector;
        this.monitor = monitor;
        this.overlayRef = null;
        hotkeys.hotkey$.subscribe(hotkey => {
            if (hotkey === 'open-server-monitor') {
                this.open();
            }
        });
        // 切换标签页时，浮动窗立即跟随切换绑定到新的 SSH 会话（不等连接就绪，id 只依赖 profile）
        this.app.activeTabChange$.subscribe(tab => {
            if (!this.overlayRef) {
                return;
            }
            const sshProfileTab = this.findSSHProfileTabIn(tab);
            if (sshProfileTab) {
                this.rebindOverlay(this.targetIdFor(sshProfileTab));
            }
        });
        // 新的 SSH 会话建立后，默认自动弹出浮动窗（插件加载时已有的连接不触发）
        let initialized = false;
        const seen = new Set();
        this.monitor.targets$.subscribe(targets => {
            const sshTargets = targets.filter(t => t.kind === 'ssh');
            if (!initialized) {
                initialized = true;
                sshTargets.forEach(t => seen.add(t.id));
                return;
            }
            const fresh = sshTargets.filter(t => !seen.has(t.id));
            sshTargets.forEach(t => seen.add(t.id));
            if (!fresh.length) {
                return;
            }
            // 取最新的一个新连接
            const newest = fresh[fresh.length - 1];
            if (this.overlayRef) {
                this.rebindOverlay(newest.id);
            }
            else {
                this.createOverlay(newest.id);
            }
        });
    }
    provide() {
        return [{
                icon: icons_1.MONITOR_ICON_SVG,
                title: '服务器状态监控',
                touchBarTitle: 'Monitor',
                weight: 5,
                click: () => this.open(),
            }];
    }
    open() {
        const sshTab = this.findActiveSSHTab();
        if (!sshTab) {
            // 没有 SSH 会话时退回为独立标签页
            this.openStandaloneTab();
            return;
        }
        this.toggleOverlay(sshTab);
    }
    /** 在 SSH 会话上方弹出/关闭浮动监控面板（只展示该会话的服务器） */
    toggleOverlay(sshTab) {
        const targetId = this.targetIdFor(sshTab);
        if (this.overlayRef) {
            if (this.overlayRef.instance.targetId === targetId) {
                this.closeOverlay();
                return;
            }
            // 已有面板但绑定的是别的服务器：切换绑定
            this.rebindOverlay(targetId);
            return;
        }
        this.createOverlay(targetId);
    }
    /** 换绑浮动窗到新的目标并立即刷新 */
    rebindOverlay(targetId) {
        if (!this.overlayRef || this.overlayRef.instance.targetId === targetId) {
            return;
        }
        this.overlayRef.instance.targetId = targetId;
        this.monitor.refresh();
    }
    createOverlay(targetId) {
        if (this.overlayRef) {
            return;
        }
        const factory = this.resolver.resolveComponentFactory(monitorOverlay_component_1.MonitorOverlayComponent);
        const ref = factory.create(this.injector);
        ref.instance.targetId = targetId;
        ref.instance.close.subscribe(() => this.closeOverlay());
        this.appRef.attachView(ref.hostView);
        document.body.appendChild(ref.location.nativeElement);
        this.overlayRef = ref;
        this.monitor.refresh();
    }
    closeOverlay() {
        if (!this.overlayRef) {
            return;
        }
        this.appRef.detachView(this.overlayRef.hostView);
        this.overlayRef.destroy();
        this.overlayRef.location.nativeElement.remove();
        this.overlayRef = null;
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
    /** 在给定标签（或其所在的分屏中）找带 SSH 配置的标签（不要求会话已连接，用于即时换绑） */
    findSSHProfileTabIn(tab) {
        var _a, _b, _c;
        if ((_b = (_a = tab === null || tab === void 0 ? void 0 : tab.profile) === null || _a === void 0 ? void 0 : _a.options) === null || _b === void 0 ? void 0 : _b.host) {
            return tab;
        }
        if (tab instanceof tabby_core_1.SplitTabComponent) {
            return (_c = tab.getAllTabs().find((t) => { var _a, _b; return (_b = (_a = t === null || t === void 0 ? void 0 : t.profile) === null || _a === void 0 ? void 0 : _a.options) === null || _b === void 0 ? void 0 : _b.host; })) !== null && _c !== void 0 ? _c : null;
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
    __metadata("design:paramtypes", [typeof (_a = typeof tabby_core_1.AppService !== "undefined" && tabby_core_1.AppService) === "function" ? _a : Object, typeof (_b = typeof core_1.ComponentFactoryResolver !== "undefined" && core_1.ComponentFactoryResolver) === "function" ? _b : Object, typeof (_c = typeof core_1.ApplicationRef !== "undefined" && core_1.ApplicationRef) === "function" ? _c : Object, typeof (_d = typeof core_1.Injector !== "undefined" && core_1.Injector) === "function" ? _d : Object, typeof (_e = typeof tabby_core_1.HotkeysService !== "undefined" && tabby_core_1.HotkeysService) === "function" ? _e : Object, typeof (_f = typeof monitor_service_1.MonitorService !== "undefined" && monitor_service_1.MonitorService) === "function" ? _f : Object])
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
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MonitorCardComponent = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const interfaces_1 = __webpack_require__(/*! ../interfaces */ "./src/interfaces.ts");
const monitor_service_1 = __webpack_require__(/*! ../services/monitor.service */ "./src/services/monitor.service.ts");
/** 单个监控目标的卡片视图（监控标签页与浮动面板共用） */
let MonitorCardComponent = class MonitorCardComponent {
    constructor(monitor) {
        this.monitor = monitor;
        this.target = null;
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
    barColor(percent) {
        const p = percent !== null && percent !== void 0 ? percent : 0;
        if (p >= 90) {
            return '#e57373';
        }
        if (p >= 70) {
            return '#ffb74d';
        }
        return '#81c784';
    }
};
__decorate([
    (0, core_1.Input)(),
    __metadata("design:type", typeof (_b = typeof interfaces_1.MonitorTarget !== "undefined" && interfaces_1.MonitorTarget) === "function" ? _b : Object)
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

            <ng-container *ngIf="t.stats">
                <div class="sm-row" *ngIf="t.stats.cpuPercent !== null">
                    <span class="sm-key">CPU</span>
                    <div class="sm-bar"><div class="sm-fill"
                        [style.width.%]='t.stats.cpuPercent'
                        [style.background]='barColor(t.stats.cpuPercent)'></div></div>
                    <span class="sm-val">{{ fmt1(t.stats.cpuPercent) }}%</span>
                </div>

                <div class="sm-row" *ngIf="t.stats.mem as mem">
                    <span class="sm-key">内存</span>
                    <div class="sm-bar"><div class="sm-fill"
                        [style.width.%]='percent(mem.used, mem.total)'
                        [style.background]='barColor(percent(mem.used, mem.total))'></div></div>
                    <span class="sm-val">{{ fmtBytes(mem.used) }}/{{ fmtBytes(mem.total) }}</span>
                </div>

                <div class="sm-row" *ngIf="t.stats.swap as swap">
                    <ng-container *ngIf="swap.total > 0">
                        <span class="sm-key">交换</span>
                        <div class="sm-bar"><div class="sm-fill"
                            [style.width.%]='percent(swap.used, swap.total)'
                            [style.background]='barColor(percent(swap.used, swap.total))'></div></div>
                        <span class="sm-val">{{ fmtBytes(swap.used) }}/{{ fmtBytes(swap.total) }}</span>
                    </ng-container>
                </div>

                <div class="sm-row" *ngIf="t.stats.disk as disk">
                    <span class="sm-key">磁盘</span>
                    <div class="sm-bar"><div class="sm-fill"
                        [style.width.%]='disk.usedPercent'
                        [style.background]='barColor(disk.usedPercent)'></div></div>
                    <span class="sm-val" [title]='disk.mount'>
                        {{ fmtBytes(disk.used) }}/{{ fmtBytes(disk.total) }}
                    </span>
                </div>

                <ng-container *ngIf="t.stats.loadAvg as load">
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

                <div class="sm-gpu" *ngFor="let gpu of t.stats.gpus">
                    <div class="sm-row">
                        <span class="sm-key" [title]='gpu.name'>GPU{{ gpu.index }}</span>
                        <div class="sm-bar"><div class="sm-fill"
                            [style.width.%]='gpu.utilPercent ?? 0'
                            [style.background]='barColor(gpu.utilPercent ?? 0)'></div></div>
                        <span class="sm-val">
                            {{ fmt1(gpu.utilPercent) }}%
                            <ng-container *ngIf="gpu.memUsedMB !== null && gpu.memTotalMB">
                                · {{ gpu.memUsedMB }}/{{ gpu.memTotalMB }}MB
                            </ng-container>
                            <ng-container *ngIf="gpu.temperature !== null"> · {{ gpu.temperature }}°C</ng-container>
                            <ng-container *ngIf="gpu.powerDraw !== null"> · {{ fmt1(gpu.powerDraw) }}W</ng-container>
                        </span>
                    </div>
                    <div class="sm-gpu-name sm-muted">{{ gpu.name }}</div>
                </div>

                <div class="sm-footer sm-muted">
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
        .sm-gpu { margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(127, 127, 127, .25); }
        .sm-gpu-name { font-size: 11px; padding-left: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sm-footer { margin-top: 8px; font-size: 11px; }
        .sm-note { margin-top: 4px; font-size: 11px; }
    `],
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof monitor_service_1.MonitorService !== "undefined" && monitor_service_1.MonitorService) === "function" ? _a : Object])
], MonitorCardComponent);
exports.MonitorCardComponent = MonitorCardComponent;


/***/ },

/***/ "./src/components/monitorOverlay.component.ts"
/*!****************************************************!*\
  !*** ./src/components/monitorOverlay.component.ts ***!
  \****************************************************/
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
exports.MonitorOverlayComponent = void 0;
const core_1 = __webpack_require__(/*! @angular/core */ "@angular/core");
const monitor_service_1 = __webpack_require__(/*! ../services/monitor.service */ "./src/services/monitor.service.ts");
/**
 * 浮动监控面板：悬浮在窗口之上，只展示绑定的单个 SSH 会话的服务器状态。
 * 通过 ComponentFactoryResolver 动态创建，挂到 body 上。
 */
let MonitorOverlayComponent = class MonitorOverlayComponent {
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
    constructor(monitor, el) {
        this.monitor = monitor;
        this.el = el;
        this.close = new core_1.EventEmitter();
        this.target = null;
        this._targetId = '';
        this.allTargets = [];
        this.dragCleanup = null;
        this.sub = monitor.targets$.subscribe(targets => {
            this.allTargets = targets;
            this.resolveTarget();
        });
    }
    resolveTarget() {
        var _a;
        this.target = (_a = this.allTargets.find(t => t.id === this._targetId)) !== null && _a !== void 0 ? _a : null;
    }
    ngOnDestroy() {
        var _a;
        this.sub.unsubscribe();
        (_a = this.dragCleanup) === null || _a === void 0 ? void 0 : _a.call(this);
    }
    refreshNow() {
        this.monitor.refresh();
    }
    /** 拖动面板 */
    startDrag(event) {
        event.preventDefault();
        const host = this.el.nativeElement;
        const rect = host.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        const onMove = (e) => {
            // 从 right/bottom 定位切换为 left/top 定位
            host.style.left = `${Math.max(0, Math.min(window.innerWidth - rect.width, e.clientX - offsetX))}px`;
            host.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offsetY))}px`;
            host.style.right = 'auto';
            host.style.bottom = 'auto';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            this.dragCleanup = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        this.dragCleanup = onUp;
    }
};
__decorate([
    (0, core_1.Input)(),
    __metadata("design:type", String),
    __metadata("design:paramtypes", [String])
], MonitorOverlayComponent.prototype, "targetId", null);
__decorate([
    (0, core_1.Output)(),
    __metadata("design:type", Object)
], MonitorOverlayComponent.prototype, "close", void 0);
MonitorOverlayComponent = __decorate([
    (0, core_1.Component)({
        selector: 'sm-monitor-overlay',
        template: `
        <div class="sm-panel">
            <div class="sm-head" (mousedown)='startDrag($event)'>
                <strong class="sm-title">服务器监控</strong>
                <span class="sm-host" *ngIf="target">{{ target.label }}</span>
                <span class="sm-muted" *ngIf="monitor.lastRefresh">
                    {{ monitor.lastRefresh | date: 'HH:mm:ss' }}
                </span>
                <button class="btn btn-sm btn-secondary" (mousedown)='$event.stopPropagation()'
                    (click)='refreshNow()'>刷新</button>
                <button class="btn btn-sm btn-secondary" (mousedown)='$event.stopPropagation()'
                    (click)='close.emit()'>✕</button>
            </div>
            <div class="sm-body">
                <sm-monitor-card [target]='target'></sm-monitor-card>
                <div class="sm-empty" *ngIf="!target">
                    未找到对应的 SSH 会话（可能已断开）。<br>重新打开监控面板即可绑定当前连接。
                </div>
            </div>
        </div>
    `,
        styles: [`
        :host {
            position: fixed;
            right: 24px;
            bottom: 60px;
            z-index: 1050;
            width: 400px;
            max-height: 70vh;
            display: block;
        }
        .sm-panel {
            background: rgba(35, 35, 38, .96);
            border: 1px solid rgba(127, 127, 127, .35);
            border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, .45);
            overflow: hidden;
            color: #eee;
        }
        .sm-head {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(127, 127, 127, .25);
            cursor: move;
            user-select: none;
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
        .sm-body { padding: 10px; overflow: auto; max-height: calc(70vh - 44px); }
        .sm-empty { opacity: .6; font-size: 12px; line-height: 1.8; text-align: center; padding: 16px; }
    `],
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof monitor_service_1.MonitorService !== "undefined" && monitor_service_1.MonitorService) === "function" ? _a : Object, typeof (_b = typeof core_1.ElementRef !== "undefined" && core_1.ElementRef) === "function" ? _b : Object])
], MonitorOverlayComponent);
exports.MonitorOverlayComponent = MonitorOverlayComponent;


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

            <label>GPU</label>
            <input type='number' class='form-control form-control-sm' min='0' max='100'
                [(ngModel)]='config.store.serverMonitor.thresholds.gpu' (change)='config.save()' />

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
                <li>远端需为 Linux 或 macOS；GPU 监控（NVIDIA）需安装 nvidia-smi（仅 Linux 常见）。</li>
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
                /** 是否监控本机 */
                monitorLocal: true,
                /** 是否自动监控已打开的 SSH 标签页 */
                monitorSSHTabs: true,
                /** 刷新间隔（秒），最小 2 */
                refreshInterval: 5,
                /** CPU 采样窗口（秒），同时用于远端命令内 sleep 与本地两次采样间隔 */
                cpuSampleSeconds: 1,
                /** 远端磁盘查询的挂载点 */
                diskMount: '/',
                /** 阈值告警：百分比，0 表示关闭该告警 */
                thresholds: {
                    cpu: 90,
                    memory: 90,
                    gpu: 90,
                    disk: 90,
                },
                /** 同一目标同类告警的冷却时间（秒） */
                alertCooldown: 60,
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
exports.MonitorOverlayComponent = exports.MonitorCardComponent = exports.MonitorService = exports.MonitorTabComponent = void 0;
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
const monitorOverlay_component_1 = __webpack_require__(/*! ./components/monitorOverlay.component */ "./src/components/monitorOverlay.component.ts");
Object.defineProperty(exports, "MonitorOverlayComponent", { enumerable: true, get: function () { return monitorOverlay_component_1.MonitorOverlayComponent; } });
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
            monitorOverlay_component_1.MonitorOverlayComponent,
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
exports.probeLocal = void 0;
const os = __importStar(__webpack_require__(/*! os */ "os"));
const child_process_1 = __webpack_require__(/*! child_process */ "child_process");
const tabby_core_1 = __webpack_require__(/*! tabby-core */ "tabby-core");
const parse_1 = __webpack_require__(/*! ./parse */ "./src/services/parse.ts");
let gpuDisabledUntil = 0;
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
/** 本地磁盘（macOS/Linux）；Windows 暂不采集 */
async function probeLocalDisk() {
    var _a;
    const out = await execFileAsync('df', ['-kP', '/']);
    const line = (_a = out.split('\n').filter(x => x.trim()).pop()) !== null && _a !== void 0 ? _a : '';
    return (0, parse_1.parseDfLine)(line);
}
/** 本机 GPU：尝试 nvidia-smi（Linux/Windows），失败则视为无 GPU */
async function probeLocalGPU() {
    if (Date.now() < gpuDisabledUntil) {
        return [];
    }
    try {
        const out = await execFileAsync('nvidia-smi', parse_1.NVIDIA_SMI_ARGS);
        return (0, parse_1.parseGpuCsv)(out);
    }
    catch {
        // 常见于无 NVIDIA 驱动 / macOS，10 分钟内不再尝试
        gpuDisabledUntil = Date.now() + 10 * 60 * 1000;
        return [];
    }
}
/** 采集本机状态 */
async function probeLocal(platform) {
    const first = sampleCpu();
    await new Promise(resolve => setTimeout(resolve, 900));
    const second = sampleCpu();
    const cpuPercent = (0, parse_1.cpuPercentBetween)(first, second);
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    let disk = null;
    let gpus = [];
    if (platform !== tabby_core_1.Platform.Web) {
        disk = await probeLocalDisk().catch(() => null);
        gpus = await probeLocalGPU().catch(() => []);
    }
    return {
        hostname: os.hostname(),
        cpuCores: os.cpus().length,
        cpuPercent: cpuPercent === null ? null : +cpuPercent.toFixed(1),
        loadAvg: os.loadavg(),
        mem: { total: memTotal, available: memFree, used: memTotal - memFree },
        swap: null,
        disk,
        uptimeSeconds: Math.floor(os.uptime()),
        gpus,
    };
}
exports.probeLocal = probeLocal;


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
let MonitorService = class MonitorService {
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
        this.pendingRefresh = false;
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
            // 先推送目标列表：新打开的 SSH 会话可以立即出现在面板上（探测完成后再推一次带数据的）
            this.targets$.next(descriptors);
            await Promise.all(descriptors.map(t => this.probeTarget(t, cfg)));
            this.lastRefresh = new Date();
            this.targets$.next(descriptors);
        }
        catch (err) {
            this.logger.error(`刷新失败: ${err}`);
        }
        finally {
            this.refreshing = false;
            if (this.pendingRefresh) {
                this.pendingRefresh = false;
                setTimeout(() => this.refresh(), 50);
            }
        }
    }
    /** 收集监控目标：本机 + 每台已连接 SSH 服务器（按主机去重） */
    collectTargets(cfg) {
        var _a, _b, _c, _d;
        const result = [];
        const seen = new Set();
        if (cfg.monitorLocal) {
            const id = 'local';
            seen.add(id);
            result.push(this.merged(id, 'local', '本地主机', undefined));
        }
        if (cfg.monitorSSHTabs && this.hostApp.platform !== tabby_core_1.Platform.Web) {
            // Tabby 会把通过配置选择器打开的标签包装进 SplitTabComponent（分屏容器），
            // 因此必须递归展平分屏子标签，否则新开的 SSH 会话会被漏掉
            for (const tab of this.flattenTabs(this.app.tabs)) {
                const sshTab = tab;
                if (!(sshTab === null || sshTab === void 0 ? void 0 : sshTab.sshSession) || !((_b = (_a = sshTab === null || sshTab === void 0 ? void 0 : sshTab.profile) === null || _a === void 0 ? void 0 : _a.options) === null || _b === void 0 ? void 0 : _b.host)) {
                    continue;
                }
                const o = sshTab.profile.options;
                const id = `ssh:${o.user || 'default'}@${o.host}:${(_c = o.port) !== null && _c !== void 0 ? _c : 22}`;
                if (seen.has(id)) {
                    continue; // 多个标签页复用同一会话时只保留一个
                }
                seen.add(id);
                result.push(this.merged(id, 'ssh', `${o.user ? o.user + '@' : ''}${o.host}:${(_d = o.port) !== null && _d !== void 0 ? _d : 22}`, sshTab));
            }
        }
        // 清理已关闭目标的状态缓存
        for (const key of [...this.stateCache.keys()]) {
            if (!seen.has(key)) {
                this.stateCache.delete(key);
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
    async probeTarget(target, cfg) {
        var _a, _b, _c;
        try {
            let stats;
            if (target.kind === 'local') {
                stats = await (0, localProbe_1.probeLocal)(this.hostApp.platform);
            }
            else {
                const session = (_a = target.ref) === null || _a === void 0 ? void 0 : _a.sshSession;
                if (!session) {
                    throw new Error('SSH 会话已关闭');
                }
                stats = await (0, remoteProbe_1.probeSSH)(session, (_b = cfg.cpuSampleSeconds) !== null && _b !== void 0 ? _b : 1, (_c = cfg.diskMount) !== null && _c !== void 0 ? _c : '/');
            }
            target.stats = stats;
            target.error = null;
            target.lastUpdated = Date.now();
            this.checkThresholds(target, stats, cfg);
        }
        catch (err) {
            target.error = (err === null || err === void 0 ? void 0 : err.message) ? String(err.message) : String(err);
            this.logger.warn(`${target.label}: ${target.error}`);
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
            ['GPU', stats.gpus.length ? Math.max(...stats.gpus.map(g => { var _a; return (_a = g.utilPercent) !== null && _a !== void 0 ? _a : 0; })) : null, thresholds.gpu],
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
    startLoop() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        const tick = async () => {
            var _a;
            try {
                await this.refresh();
            }
            catch (err) {
                this.logger.error(`监控循环异常: ${err}`);
            }
            // 有 SSH 正在连接时用 1 秒快速轮询，连接完成后恢复常规间隔
            const interval = this.hasConnectingSSHTab()
                ? 1
                : Math.max(2, (_a = this.settings.refreshInterval) !== null && _a !== void 0 ? _a : 5);
            this.timer = setTimeout(tick, interval * 1000);
        };
        tick();
    }
};
MonitorService = __decorate([
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
exports.parseMacUptime = exports.parseMacLoadavg = exports.parseMacSwap = exports.parseMacMem = exports.parseMacTopCpuLine = exports.NVIDIA_SMI_ARGS = exports.parseGpuCsv = exports.parseDfLine = exports.swapFromMeminfo = exports.memFromMeminfo = exports.parseMeminfo = exports.cpuPercentBetween = exports.parseCpuStatLine = void 0;
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
/** 解析 `df -kP <mount>` 的数据行（单位 kB） */
function parseDfLine(line) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) {
        return null;
    }
    const blocks = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    const capacity = parseInt(parts[4], 10);
    if (isNaN(blocks) || isNaN(used)) {
        return null;
    }
    return {
        mount: parts[parts.length - 1],
        total: blocks * 1024,
        used: used * 1024,
        usedPercent: isNaN(capacity) ? 0 : capacity,
    };
}
exports.parseDfLine = parseDfLine;
/** 解析 nvidia-smi --format=csv,noheader,nounits 输出 */
function parseGpuCsv(text) {
    const gpus = [];
    const num = (s) => {
        const cleaned = (s !== null && s !== void 0 ? s : '').trim().replace(/^\[|\]$/g, '');
        if (!cleaned || cleaned.toUpperCase().includes('N/A')) {
            return null;
        }
        const v = parseFloat(cleaned);
        return isNaN(v) ? null : v;
    };
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || /no gpu|not found|command not found/i.test(line)) {
            continue;
        }
        const cols = line.split(',').map(x => x.trim());
        if (cols.length < 6) {
            continue;
        }
        const index = parseInt(cols[0], 10);
        if (isNaN(index)) {
            continue;
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
        });
    }
    return gpus;
}
exports.parseGpuCsv = parseGpuCsv;
exports.NVIDIA_SMI_ARGS = [
    '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,fan.speed,power.draw',
    '--format=csv,noheader,nounits',
];
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

/***/ "./src/services/remoteProbe.ts"
/*!*************************************!*\
  !*** ./src/services/remoteProbe.ts ***!
  \*************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.probeSSH = exports.parseRemoteOutput = exports.execRemoteCommand = exports.buildRemoteCommand = void 0;
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
const M_GPU = '#SM#GPU';
const M_END = '#SM#END';
/**
 * 组装远程只读采集命令（跨平台）：
 * 脚本内用 uname -s 自动分支——Linux 读 /proc，macOS 用 sysctl/vm_stat/top -l。
 * 所有命令均为普通用户可执行的只读操作，无需 sudo。
 */
function buildRemoteCommand(sampleSeconds, diskMount) {
    const mount = (diskMount || '/').replace(/'/g, '') || '/';
    const sample = Math.max(1, Math.min(10, Math.round(sampleSeconds)));
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
    ].join('\n');
}
exports.buildRemoteCommand = buildRemoteCommand;
/** 通过 russh 通道执行命令并收集输出（不经过用户终端，不影响交互会话） */
async function execRemoteCommand(sshSession, command, timeoutMs = 25000) {
    const ssh = sshSession.ssh;
    if (!ssh) {
        throw new Error('SSH 连接尚未就绪');
    }
    const ch = await ssh.activateChannel(await ssh.openSessionChannel());
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
        disk: (0, parse_1.parseDfLine)(firstLine(section(out, M_DISK, M_GPU))),
        uptimeSeconds: isNaN(uptime) ? null : Math.floor(uptime),
        gpus: [],
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
        disk: (0, parse_1.parseDfLine)(firstLine(section(out, M_DISK, M_GPU))),
        uptimeSeconds: uptime,
        gpus: [],
    };
}
/** 解析远程采集命令输出（自动按 OS 分支） */
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
/** 对某个 SSH 会话执行一次远程采集 */
async function probeSSH(sshSession, sampleSeconds, diskMount) {
    if (!sshSession.open) {
        throw new Error('SSH 会话未连接');
    }
    const out = await execRemoteCommand(sshSession, buildRemoteCommand(sampleSeconds, diskMount));
    const stats = parseRemoteOutput(out);
    if (!stats) {
        throw new Error('远程系统不受支持或采集失败（需 Linux 或 macOS，普通用户可读即可）');
    }
    return stats;
}
exports.probeSSH = probeSSH;


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
const icons_1 = __webpack_require__(/*! ./icons */ "./src/icons.ts");
/** @hidden */
class MonitorSettingsTabProvider extends tabby_settings_1.SettingsTabProvider {
    constructor() {
        super(...arguments);
        this.id = 'server-monitor';
        this.icon = icons_1.MONITOR_ICON_SVG;
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