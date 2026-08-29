'use strict';

const UnifiConstants = require('./constants');

/**
 * Shared onRepair implementation for all UniFi Network drivers.
 * Every paired device (access point, switch, wifi/cable client) is listed and
 * kept in sync through the Network V1 (session) connection, so repair always
 * targets the V1 host/port/credentials regardless of which driver called it.
 * @param {object} homey
 * @param {object} session
 * @param {object} [device]
 */
function onRepair(homey, session, device) {
    session.setHandler('get_repair_data', async () => {
        const settings = homey.settings.get(UnifiConstants.SETTINGS_KEY) || {};
        return {
            deviceName: device ? device.getName() : 'UniFi Network',
            host: settings.host || '',
            port: settings.port || 443,
            username: settings.user || '',
            connected: homey.app.isV1Available(),
            status: homey.app.loggedIn ? 'Connected' : 'Disconnected',
        };
    });

    session.setHandler('save_repair_data', async (data) => {
        try {
            if (!data.host || !data.username) {
                throw new Error('Host and username are required');
            }

            const settings = Object.assign({}, homey.settings.get(UnifiConstants.SETTINGS_KEY));
            settings.host = data.host;
            settings.port = data.port || '443';
            settings.user = data.username;
            if (data.password) settings.pass = data.password;
            homey.settings.set(UnifiConstants.SETTINGS_KEY, settings);

            await homey.app._appLogin();

            if (device) {
                await device.setAvailable().catch(homey.error);
            }

            return {status: 'ok', message: 'Connection restored'};
        } catch (error) {
            homey.app.debug(`[onRepair] save_repair_data error: ${error.message || error}`);
            return {status: 'failure', error: error.message || String(error)};
        }
    });

    session.setHandler('validate', async () => 'ok');
}

module.exports = {onRepair};
