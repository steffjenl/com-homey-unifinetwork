'use strict';

jest.mock('homey', () => {
    class App {}
    class SimpleClass {}

    return {
        App,
        SimpleClass,
        env: {},
    };
});

jest.mock('homey-log', () => ({
    Log: class Log {},
}));

const UnifiNetwork = require('../app');

function createApp() {
    const app = new UnifiNetwork();

    app.homey = {
        app,
        error: jest.fn(),
    };
    app.api = {
        getDeviceName: jest.fn(payload => payload.name || payload.hostname || payload.mac || payload.user || 'unknown'),
    };
    app.debug = jest.fn();
    app._clientConnected = {
        trigger: jest.fn().mockResolvedValue(undefined),
    };
    app._clientDisconnected = {
        trigger: jest.fn().mockResolvedValue(undefined),
    };

    return app;
}

describe('UnifiNetwork.onIsConnected()', () => {
    it('triggers the app flow for a newly connected client without querying extra device state', async () => {
        const app = createApp();

        app.onIsConnected(true, {
            client: 'aa:bb:cc:dd:ee:ff',
            hostname: 'New phone',
            ssid: 'Guest WiFi',
            ip: '192.168.1.10',
        });

        await Promise.resolve();

        expect(app._clientConnected.trigger).toHaveBeenCalledWith({
            mac: 'aa:bb:cc:dd:ee:ff',
            name: 'New phone',
            essid: 'Guest WiFi',
            ipAddress: '192.168.1.10',
        });
        expect(app._clientDisconnected.trigger).not.toHaveBeenCalled();
    });

    it('falls back to empty tags instead of crashing when optional fields are missing', async () => {
        const app = createApp();

        app.onIsConnected(false, {});

        await Promise.resolve();

        expect(app._clientDisconnected.trigger).toHaveBeenCalledWith({
            mac: '',
            name: 'unknown',
            essid: '',
            ipAddress: '',
        });
        expect(app._clientConnected.trigger).not.toHaveBeenCalled();
    });
});
