'use strict';

const BaseClass = require('./baseclass');
const Unifi = require('node-unifi');
const UnifiConstants = require('./constants');
const WebsocketClient = require('./websocket');

class ApiClient extends BaseClass {

    constructor({homey}) {
        super();
        this.unifi = null;
        this.websocket = null;
        this.homey = homey;
        this.loggedInStatus = 0;
        this._apiKey = null;
        this._v1BaseUrl = null;
    }

    setUnifiObject(hostName, portNumber, userName, passWord, siteName, sslVerify) {
        // Migration shim: if sslVerify is undefined (existing installs) default to false
        const sslverify = typeof sslVerify === 'boolean' ? sslVerify : false;
        this.unifi = new Unifi.Controller({host: hostName, port: portNumber, sslverify, site: siteName});

        return this.unifi;
    }

    setWebSocketObject(hostName, portNumber, userName, passWord, siteName, sslVerify) {
        const sslverify = typeof sslVerify === 'boolean' ? sslVerify : false;
        const options = {host: hostName, port: portNumber, sslverify, site: siteName};
        this.websocket = new WebsocketClient(options, this.homey);
    }

    /**
     * Store an optional API key for v1 REST calls.
     * @param {string|null} apiKey
     * @param {string} host
     * @param {string|number} port
     */
    setApiKey(apiKey, host, port) {
        this._apiKey = apiKey || null;
        this._v1BaseUrl = `https://${host}:${port}/proxy/network/v1`;
    }

    /**
     * Make an authenticated call to the UniFi v1 REST API.
     * Uses Bearer token if an API key is configured, otherwise falls back to
     * the session cookie maintained by node-unifi.
     *
     * @param {string} method  HTTP method (GET, POST, PATCH, DELETE)
     * @param {string} path    Path relative to /proxy/network/v1 (e.g. '/sites')
     * @param {object|null} body  Optional request body
     * @returns {Promise<object>}
     */
    async _callV1(method, path, body = null) {
        const https = require('https');
        const url = `${this._v1BaseUrl}${path}`;

        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        if (this._apiKey) {
            headers['Authorization'] = `Bearer ${this._apiKey}`;
        } else {
            // Fallback: use session cookie from node-unifi cookie jar
            try {
                const baseUrl = new URL(this._v1BaseUrl);
                const cookies = await this.unifi._cookieJar.getCookieString(baseUrl.origin);
                if (cookies) headers['Cookie'] = cookies;
            } catch (_e) {
                // Cookie fallback unavailable — request will proceed without auth
            }
        }

        const sslVerify = this.unifi ? this.unifi._sslverify !== false : false;

        return new Promise((resolve, reject) => {
            const reqUrl = new URL(url);
            const payload = body ? JSON.stringify(body) : null;
            if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

            const options = {
                hostname: reqUrl.hostname,
                port: reqUrl.port || 443,
                path: reqUrl.pathname + reqUrl.search,
                method,
                headers,
                rejectUnauthorized: sslVerify,
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (_e) {
                        resolve(data);
                    }
                });
            });

            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        });
    }

    async getAccessPoints() {
        return new Promise((resolve, reject) => {
            this.unifi.getAccessDevices()
                .then(response => {
                    response = response.filter(obj => obj.adopted === true);
                    response = response.filter(obj => obj.type === 'uap');
                    if (response) {
                        return resolve(response);
                    } else {
                        return reject(new Error('Error obtaining AccessPoint devices.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    async getWiFiDevices() {
        return new Promise((resolve, reject) => {
            this.unifi.getClientDevices()
                .then(response => {
                    response = response.filter(obj => obj.is_wired === false);
                    if (response) {
                        return resolve(response);
                    } else {
                        return reject(new Error('Error obtaining WiFi devices.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    async getCableDevices() {
        return new Promise((resolve, reject) => {
            this.unifi.getClientDevices()
                .then(response => {
                    response = response.filter(obj => obj.is_wired === true);
                    if (response) {
                        return resolve(response);
                    } else {
                        return reject(new Error('Error obtaining cable devices.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    async getNetworkSwitches() {
        return new Promise((resolve, reject) => {
            this.unifi.getAccessDevices()
                .then(response => {
                    response = response.filter(obj => obj.type === 'usw');
                    if (response) {
                        return resolve(response);
                    } else {
                        return reject(new Error('Error obtaining network switches.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    async powerOnDevice(macAddress, portIndex) {
        this.unifi.getAccessDevices(macAddress).then(async (deviceData) => {
            const device = deviceData.filter(obj => {
                return obj.mac === macAddress
            });
            const deviceId = device[0]._id;
            const portOverrides = device[0].port_overrides;
            // turn the poe back on
            for (const item of portOverrides) {
                if (item.port_idx === Number.parseInt(portIndex, 10)) {
                    item.poe_mode = 'auto';
                }
            }
            await this.unifi.setDeviceSettingsBase(deviceId, {port_overrides: portOverrides});
        }).catch(error => this.homey.app.error(error));
    }

    async powerOffDevice(macAddress, portIndex) {
        this.unifi.getAccessDevices(macAddress).then(async (deviceData) => {
            const device = deviceData.filter(obj => {
                return obj.mac === macAddress
            });
            const deviceId = device[0]._id;
            const portOverrides = device[0].port_overrides;
            // Set PoE mode to 'off' for the specified port
            for (const item of portOverrides) {
                if (item.port_idx === Number.parseInt(portIndex, 10)) {
                    item.poe_mode = 'off';
                }
            }
            await this.unifi.setDeviceSettingsBase(deviceId, {port_overrides: portOverrides});
        }).catch(error => this.homey.app.error(error));
    }



    async powerCycleDevice(macAddress, portIndex) {
        this.unifi.getAccessDevices(macAddress).then(async (deviceData) => {
            const device = deviceData.filter(obj => {
                return obj.mac === macAddress
            });
            const deviceId = device[0]._id;
            const portOverrides = device[0].port_overrides;
            // Set PoE mode to 'off' for the specified port
            for (const item of portOverrides) {
                if (item.port_idx === Number.parseInt(portIndex, 10)) {
                    item.poe_mode = 'off';
                }
            }
            await this.unifi.setDeviceSettingsBase(deviceId, {port_overrides: portOverrides});
            // sleep for 1 second
            await new Promise(resolve => setTimeout(resolve, 500));
            // turn the poe back on
            for (const item of portOverrides) {
                if (item.port_idx === Number.parseInt(portIndex, 10)) {
                    item.poe_mode = 'auto';
                }
            }
            await this.unifi.setDeviceSettingsBase(deviceId, {port_overrides: portOverrides});
        }).catch(error => this.homey.app.error(error));
    }

    getDeviceName(payload) {
        let deviceName = payload.name
        if (typeof deviceName === 'undefined' && typeof payload.hostname !== 'undefined') deviceName = payload.hostname;
        if (typeof deviceName === 'undefined' && typeof payload.mac !== 'undefined') deviceName = payload.mac;
        if (typeof deviceName === 'undefined' && typeof payload.user !== 'undefined') deviceName = payload.user;
        if (typeof deviceName === 'undefined') deviceName = "unknown";
        return deviceName;
    }

    async getDeviceByMac(macAddress) {
        const users = await this.unifi.getAllUsers();
        return users.filter(obj => {
            return obj.mac === macAddress
        });
    }
}

module.exports = ApiClient;
