import * as https from 'https'
import { isValidIp } from './parse'

/** 纯文本 IP 接口：IPv4 优先（api4/ipv4 子域仅返回 A 记录），最后回退任意族 */
const ENDPOINTS = ['api4.ipify.org', 'ipv4.icanhazip.com', 'api.ipify.org']

/**
 * 获取本机公网 IP：短超时、依次尝试两个接口、失败不在此处重试（重试频率由上层 TTL 控制）。
 * 成功返回 IP，全部失败返回 null；单次最多阻塞 2 × timeoutMs，且仅在 TTL 到期时被调用。
 */
export function fetchLocalPublicIp (timeoutMs = 3000): Promise<string|null> {
    return new Promise(resolve => {
        let index = 0
        const attempt = (): void => {
            if (index >= ENDPOINTS.length) {
                resolve(null)
                return
            }
            const host = ENDPOINTS[index++]
            // timeout 触发 destroy 后会再触发 error，用 handled 保证只走一次
            let handled = false
            const next = (ip: string|null): void => {
                if (handled) {
                    return
                }
                handled = true
                if (ip !== null) {
                    resolve(ip)
                } else {
                    attempt()
                }
            }
            const req = https.get({
                host,
                path: '/',
                timeout: timeoutMs,
                headers: { 'user-agent': 'curl/8.0' },
            }, res => {
                const chunks: Buffer[] = []
                res.on('data', (c: Buffer) => chunks.push(c))
                res.on('end', () => {
                    const ip = Buffer.concat(chunks).toString('utf8').trim()
                    next(res.statusCode && res.statusCode >= 200 && res.statusCode < 300 && isValidIp(ip) ? ip : null)
                })
            })
            req.on('timeout', () => {
                req.destroy()
                next(null)
            })
            req.on('error', () => next(null))
        }
        attempt()
    })
}
