'use strict';

// Mock the homey SDK so BaseClass (which extends Homey.SimpleClass) can be instantiated
jest.mock('homey', () => {
    class SimpleClass {
        constructor() {}
        log(...args) {}
        error(...args) {}
        debug(...args) {}
    }
    return { SimpleClass };
});

// Mock node-unifi before requiring ApiClient
jest.mock('node-unifi', () => ({
    Controller: jest.fn().mockImplementation(() => ({
        login: jest.fn().mockResolvedValue(true),
        logout: jest.fn().mockResolvedValue(true),
        getClientDevices: jest.fn().mockResolvedValue([
            { mac: 'aa:bb:cc:dd:ee:ff', is_wired: false, essid: 'TestSSID', hostname: 'MyPhone', ip: '192.168.1.100' },
            { mac: '11:22:33:44:55:66', is_wired: true, hostname: 'MyPC', ip: '192.168.1.101' },
        ]),
        getAccessDevices: jest.fn().mockResolvedValue([
            { mac: 'dd:ee:ff:00:11:22', type: 'uap', adopted: true, name: 'LivingRoomAP', ip: '192.168.1.2' },
            { mac: 'aa:bb:cc:11:22:33', type: 'usw', adopted: true, name: 'MainSwitch', ip: '192.168.1.3' },
        ]),
        blockClient: jest.fn().mockResolvedValue(true),
        unblockClient: jest.fn().mockResolvedValue(true),
        setDeviceSettingsBase: jest.fn().mockResolvedValue(true),
        getAllUsers: jest.fn().mockResolvedValue([
            { mac: 'aa:bb:cc:dd:ee:ff', name: 'MyPhone', is_guest: false },
        ]),
        _unifios: false,
        _isClosed: false,
    })),
}));

// Minimal Homey mock
const mockHomey = {
    app: {
        debug: jest.fn(),
        error: jest.fn(),
        loggedIn: true,
    },
    error: jest.fn(),
    log: jest.fn(),
};

const ApiClient = require('../../library/apiclient');

describe('ApiClient', () => {
    let client;

    beforeEach(() => {
        client = new ApiClient({ homey: mockHomey });
        client.setUnifiObject('192.168.1.1', 443, 'admin', 'password', 'default');
    });

    describe('getWiFiDevices()', () => {
        it('returns only wireless clients (is_wired: false)', async () => {
            const devices = await client.getWiFiDevices();
            expect(devices).toHaveLength(1);
            expect(devices[0].mac).toBe('aa:bb:cc:dd:ee:ff');
            expect(devices[0].is_wired).toBe(false);
        });
    });

    describe('getCableDevices()', () => {
        it('returns only wired clients (is_wired: true)', async () => {
            const devices = await client.getCableDevices();
            expect(devices).toHaveLength(1);
            expect(devices[0].mac).toBe('11:22:33:44:55:66');
            expect(devices[0].is_wired).toBe(true);
        });
    });

    describe('getAccessPoints()', () => {
        it('returns only adopted UAPs', async () => {
            const aps = await client.getAccessPoints();
            expect(aps).toHaveLength(1);
            expect(aps[0].type).toBe('uap');
            expect(aps[0].adopted).toBe(true);
        });
    });

    describe('getNetworkSwitches()', () => {
        it('returns only USW devices', async () => {
            const switches = await client.getNetworkSwitches();
            expect(switches).toHaveLength(1);
            expect(switches[0].type).toBe('usw');
        });
    });

    describe('getDeviceName()', () => {
        it('uses name field first', () => {
            expect(client.getDeviceName({ name: 'MyDevice', hostname: 'host', mac: 'aa:bb' })).toBe('MyDevice');
        });

        it('falls back to hostname when name is undefined', () => {
            expect(client.getDeviceName({ hostname: 'myhost', mac: 'aa:bb' })).toBe('myhost');
        });

        it('falls back to mac when name and hostname are undefined', () => {
            expect(client.getDeviceName({ mac: 'aa:bb:cc:dd:ee:ff' })).toBe('aa:bb:cc:dd:ee:ff');
        });

        it('falls back to user field', () => {
            expect(client.getDeviceName({ user: 'aa:bb:cc:dd:ee:ff' })).toBe('aa:bb:cc:dd:ee:ff');
        });

        it('returns "unknown" when all fields are undefined', () => {
            expect(client.getDeviceName({})).toBe('unknown');
        });
    });

    describe('powerCycleDevice()', () => {
        it('calls setDeviceSettingsBase twice for the target port', async () => {
            const mac = 'dd:ee:ff:00:11:22';
            client.unifi.getAccessDevices.mockResolvedValueOnce([
                { mac, _id: 'device-id-1', type: 'usw', adopted: true, name: 'Switch', port_overrides: [{ port_idx: 1, poe_mode: 'auto' }] },
            ]);
            await client.powerCycleDevice(mac, 1);
            // Allow the internal async chain (incl. 500 ms sleep) to complete
            await new Promise((r) => setTimeout(r, 600));
            // Should have called setDeviceSettingsBase exactly twice (off → auto)
            expect(client.unifi.setDeviceSettingsBase).toHaveBeenCalledTimes(2);
            // Both calls target the same device id
            expect(client.unifi.setDeviceSettingsBase.mock.calls[0][0]).toBe('device-id-1');
            expect(client.unifi.setDeviceSettingsBase.mock.calls[1][0]).toBe('device-id-1');
        });
    });

    describe('_callV1() (Network V2 / official Integration API)', () => {
        // Regression test for a real bug: requests were sent to the wrong base path
        // (missing "/integration" segment) with the wrong auth header ("Authorization: Bearer"
        // instead of "X-API-KEY"), so they always 404'd/401'd against a real UniFi OS console.
        let https;
        let capturedOptions;
        let fakeReq;

        beforeEach(() => {
            https = require('https');
            capturedOptions = null;
            fakeReq = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            jest.spyOn(https, 'request').mockImplementation((options, callback) => {
                capturedOptions = options;
                const res = {
                    on: (event, handler) => {
                        if (event === 'data') handler(Buffer.from('{}'));
                        if (event === 'end') handler();
                    },
                };
                callback(res);
                return fakeReq;
            });
        });

        afterEach(() => {
            https.request.mockRestore();
        });

        it('targets the local /proxy/network/integration/v1 base path with X-API-KEY header', async () => {
            client.setApiKey('my-api-key', '192.168.1.1', 443);
            await client._callV1('GET', '/sites');

            expect(capturedOptions.hostname).toBe('192.168.1.1');
            expect(capturedOptions.path).toBe('/proxy/network/integration/v1/sites');
            expect(capturedOptions.headers['X-API-KEY']).toBe('my-api-key');
            expect(capturedOptions.headers['Authorization']).toBeUndefined();
        });

        it('targets the UniFi Cloud connector proxy when cloudEnabled is set', async () => {
            client.setApiKey('my-api-key', '192.168.1.1', 443, { cloudEnabled: true, consoleId: 'console-123' });
            await client._callV1('GET', '/sites');

            expect(capturedOptions.hostname).toBe('api.ui.com');
            expect(capturedOptions.path).toBe('/v1/connector/consoles/console-123/proxy/network/integration/v1/sites');
            expect(capturedOptions.headers['X-API-KEY']).toBe('my-api-key');
        });
    });
});

