'use strict';

const constants = require('../../library/constants');

describe('constants', () => {
    it('all exported values are non-empty strings', () => {
        Object.entries(constants).forEach(([_key, value]) => {
            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
        });
    });

    it('exports expected event constants', () => {
        expect(constants.EVENT_CLIENT_CONNECTED).toBe('a_client_connected');
        expect(constants.EVENT_CLIENT_DISCONNECTED).toBe('a_client_disconnected');
        expect(constants.EVENT_WIFI_CLIENT_CONNECTED).toBe('wifi_client_connected');
        expect(constants.EVENT_NETWORK_SWITCH_POWER_CYCLE_PORT).toBe('network_switch_power_cycle_port');
        expect(constants.EVENT_GUEST_CONNECTED).toBe('a_guest_connected');
        expect(constants.EVENT_GUEST_DISCONNECTED).toBe('a_guest_disconnected');
        expect(constants.EVENT_WIFI_CLIENT_VLAN_CHANGED).toBe('wifi_client_vlan_changed');
        expect(constants.EVENT_CABLE_CLIENT_VLAN_CHANGED).toBe('cable_client_vlan_changed');
        expect(constants.EVENT_CLIENT_VLAN_CHANGED).toBe('a_client_vlan_changed');
        expect(constants.SETTINGS_KEY).toBeDefined();
        expect(constants.REALTIME_STATUS).toBeDefined();
        expect(constants.REALTIME_DEBUG).toBeDefined();
    });
});

