'use strict';

/**
 * Recorded WebSocket event payloads from a live UniFi controller.
 * Used as fixtures in unit tests.
 */

const EVT_WU_Disconnected = {
    user: '82:74:71:f9:15:25',
    ssid: 'MonkeySoft',
    hostname: '2001-1c04-352c-6900-4990-fde6-f18d-3d8f.cable.dynamic.v6.ziggo.nl',
    ap: 'd0:21:f9:89:df:f9',
    duration: 1058,
    bytes: 2527451,
    ap_model: 'UAP6MP',
    ap_name: 'BenedenAP',
    ap_displayName: 'BenedenAP',
    key: 'EVT_WU_Disconnected',
    subsystem: 'wlan',
    is_negative: false,
    site_id: '6550cbaad28ec670541702d5',
    time: 1761598537000,
    datetime: '2025-10-27T20:55:37Z',
    msg: 'User[82:74:71:f9:15:25] disconnected from "MonkeySoft"',
};

const EVT_WU_Connected = {
    user: 'ea:5b:28:b2:00:b5',
    ssid: 'Ziggo6322902',
    ap: 'd0:21:f9:89:df:f9',
    radio: 'na',
    channel: '40',
    channelWidth: '80',
    hostname: 'iPhone',
    ap_model: 'UAP6MP',
    ap_name: 'BenedenAP',
    ap_displayName: 'BenedenAP',
    key: 'EVT_WU_Connected',
    subsystem: 'wlan',
    is_negative: false,
    site_id: '6550cbaad28ec670541702d5',
    time: 1761598567827,
    datetime: '2025-10-27T20:56:07Z',
    msg: 'User[ea:5b:28:b2:00:b5] has connected to AP[d0:21:f9:89:df:f9]',
};

const EVT_LC_Blocked = {
    user: 'aa:bb:cc:dd:ee:ff',
    key: 'EVT_LC_Blocked',
    subsystem: 'lan',
    is_negative: false,
    site_id: '6550cbaad28ec670541702d5',
    time: 1761598600000,
    datetime: '2025-10-27T21:00:00Z',
};

const WS_ENVELOPE = (events) => ({
    meta: { rc: 'ok', message: 'events' },
    data: Array.isArray(events) ? events : [events],
});

module.exports = {
    EVT_WU_Disconnected,
    EVT_WU_Connected,
    EVT_LC_Blocked,
    WS_ENVELOPE,
};

