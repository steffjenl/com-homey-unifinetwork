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

function createCard() {
    return {
        trigger: jest.fn().mockResolvedValue(undefined),
        registerArgumentAutocompleteListener: jest.fn(),
        registerRunListener: jest.fn(),
    };
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

describe('UnifiNetwork access-point client count triggers', () => {
    it('registers run listeners for first/last access-point triggers', async () => {
        const app = createApp();
        const cards = new Map();
        const getCard = (id) => {
            if (!cards.has(id)) {
                cards.set(id, createCard());
            }
            return cards.get(id);
        };

        app.accessPointList = {};
        app.homey.flow = {
            getTriggerCard: jest.fn(id => getCard(id)),
            getDeviceTriggerCard: jest.fn(id => getCard(id)),
            getActionCard: jest.fn(id => getCard(id)),
            getConditionCard: jest.fn(id => getCard(id)),
        };

        await app._initFlowTriggers();

        expect(cards.get('first_device_connected').registerRunListener).toHaveBeenCalledTimes(1);
        expect(cards.get('last_device_disconnected').registerRunListener).toHaveBeenCalledTimes(1);
    });

    it('passes AP state when triggering first device connected', () => {
        const app = createApp();
        const firstTrigger = {
            trigger: jest.fn().mockResolvedValue(undefined),
        };

        app.accessPointList = {
            'ap-mac-1': { name: 'AP 1', mac: 'ap-mac-1', num_clients: 0 },
        };
        app.homey.app.debug = jest.fn();
        app.homey.drivers = {
            getDriver: jest.fn().mockReturnValue({
                getDevices: jest.fn().mockReturnValue([]),
            }),
        };
        app._firstDeviceConnected = firstTrigger;
        app._lastDeviceDisconnected = {
            trigger: jest.fn().mockResolvedValue(undefined),
        };

        app.checkAccessPoints([{ ap_mac: 'ap-mac-1' }]);

        expect(firstTrigger.trigger).toHaveBeenCalledWith({}, { ap_mac: 'ap-mac-1' });
    });
});
