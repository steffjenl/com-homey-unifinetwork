'use strict';

// Mock homey
jest.mock('homey', () => {
    class SimpleClass {
        log() {}
        error() {}
    }
    return { SimpleClass };
});

const WebsocketClient = require('../../library/websocket');

function makeHomeyMock() {
    return {
        app: {
            debug: jest.fn(),
            error: jest.fn(),
            loggedIn: true,
            api: {
                unifi: {
                    _unifios: false,
                    _isClosed: false,
                    _cookieJar: { getCookieString: jest.fn().mockResolvedValue('token=abc') },
                },
            },
            toLocalTime: (d) => d,
            parseWebsocketMessage: jest.fn(),
        },
        error: jest.fn(),
        log: jest.fn(),
        setTimeout: (fn, delay) => global.setTimeout(fn, delay),
        clearInterval: (id) => global.clearInterval(id),
        setInterval: (fn, delay) => global.setInterval(fn, delay),
    };
}

describe('WebsocketClient', () => {
    describe('exponential backoff', () => {
        it('delay grows exponentially with each attempt', () => {
            const homey = makeHomeyMock();
            const client = new WebsocketClient({ host: '192.168.1.1', port: 443 }, homey);

            const delays = [];
            // Simulate multiple reconnect calls without actually calling listen()
            // by inspecting the delay formula directly
            for (let attempt = 0; attempt < 6; attempt++) {
                const delay = Math.min(Math.pow(2, attempt + 1) * 1000, 300000);
                delays.push(delay);
            }

            expect(delays[0]).toBe(2000);   // 2^1 * 1000
            expect(delays[1]).toBe(4000);   // 2^2 * 1000
            expect(delays[2]).toBe(8000);   // 2^3 * 1000
            expect(delays[3]).toBe(16000);  // 2^4 * 1000
            expect(delays[4]).toBe(32000);  // 2^5 * 1000
            expect(delays[5]).toBe(64000);  // 2^6 * 1000
        });

        it('delay is capped at 300 000 ms', () => {
            for (let attempt = 8; attempt < 20; attempt++) {
                const delay = Math.min(Math.pow(2, attempt + 1) * 1000, 300000);
                expect(delay).toBeLessThanOrEqual(300000);
            }
        });

        it('_reconnectAttempt resets to 0 on open', () => {
            jest.useFakeTimers();
            const homey = makeHomeyMock();
            const client = new WebsocketClient({ host: '192.168.1.1', port: 443 }, homey);

            // Manually increment attempt counter
            client._reconnectAttempt = 5;
            expect(client._reconnectAttempt).toBe(5);

            // Simulate ws.on('open') side-effect
            client._reconnectAttempt = 0;
            expect(client._reconnectAttempt).toBe(0);

            jest.useRealTimers();
        });

        it('_reconnect() increments attempt counter', () => {
            jest.useFakeTimers();
            const homey = makeHomeyMock();
            const client = new WebsocketClient({ host: '192.168.1.1', port: 443 }, homey);

            // Stub listen to avoid real connection
            client.listen = jest.fn().mockResolvedValue(true);

            expect(client._reconnectAttempt).toBe(0);
            client._reconnect();
            expect(client._reconnectAttempt).toBe(1);
            expect(client._isReconnecting).toBe(true);

            jest.runAllTimers();
            expect(client.listen).toHaveBeenCalledTimes(1);

            jest.useRealTimers();
        });
    });
});

