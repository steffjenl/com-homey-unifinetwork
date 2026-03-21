'use strict';

const constants = require('../../library/constants');

describe('constants', () => {
    it('all exported values are non-empty strings', () => {
        Object.entries(constants).forEach(([key, value]) => {
            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
        });
    });

    it('exports expected event constants', () => {
        expect(constants.EVENT_CLIENT_CONNECTED).toBe('a_client_connected');
        expect(constants.EVENT_CLIENT_DISCONNECTED).toBe('a_client_disconnected');
        expect(constants.EVENT_WIFI_CLIENT_CONNECTED).toBe('wifi_client_connected');
        expect(constants.EVENT_NETWORK_SWITCH_POWER_CYCLE_PORT).toBe('network_switch_power_cycle_port');
        expect(constants.SETTINGS_KEY).toBeDefined();
        expect(constants.REALTIME_STATUS).toBeDefined();
        expect(constants.REALTIME_DEBUG).toBeDefined();
    });
});

