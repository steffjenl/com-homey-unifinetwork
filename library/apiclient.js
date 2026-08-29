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
        // Cleanly shut down old client (stops reconnect loop + terminates socket)
        if (this.websocket) {
            this.websocket.destroy();
        }
        const sslverify = typeof sslVerify === 'boolean' ? sslVerify : false;
        const options = {host: hostName, port: portNumber, sslverify, site: siteName};
        this.websocket = new WebsocketClient(options, this.homey);
    }

    /**
     * Store an optional API key for v1 REST calls.
     * @param {string|null} apiKey
     * @param {string} host
     * @param {string|number} port
     * @param {object} [options]
     * @param {boolean} [options.cloudEnabled]  Route calls via the UniFi Site Manager (api.ui.com) instead of the local host
     * @param {string} [options.consoleId]      Console ID, required when cloudEnabled is true
     */
    setApiKey(apiKey, host, port, options = {}) {
        this._apiKey = apiKey || null;
        this._cloudEnabled = !!options.cloudEnabled;
        this._consoleId = options.consoleId || '';
        this._v1Host = host;
        this._v1Port = port;
        this._v1BaseUrl = this._cloudEnabled
            ? `https://api.ui.com/v1/connector/consoles/${encodeURIComponent(this._consoleId)}/proxy/network/v1`
            : `https://${host}:${port}/proxy/network/v1`;
    }

    /**
     * Whether a Network V2 (API key) credential is currently configured.
     * @returns {boolean}
     */
    hasApiKey() {
        return !!this._apiKey;
    }

    /**
     * Whether Network V2 calls are currently routed via the UniFi Cloud (Site Manager) proxy.
     * @returns {boolean}
     */
    isCloudEnabled() {
        return !!this._cloudEnabled;
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

        // api.ui.com carries a valid public certificate — always verify it, regardless
        // of the local sslverify setting (which only applies to the controller itself).
        const sslVerify = this._cloudEnabled ? true : (this.unifi ? this.unifi._sslverify !== false : false);

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

    /**
     * Restart (reboot) an access point via the UniFi v1 REST API.
     * Requires an API key or valid session cookie.
     * @param {string} deviceId  The UniFi device _id (not the MAC)
     * @param {string} siteId    The site name / id (e.g. 'default')
     */
    async restartAccessPoint(deviceId, siteId) {
        return this._callV1('POST', `/sites/${siteId}/devices/${deviceId}/actions`, { action: 'restart' });
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
            return obj.mac === macAddress;
        });
    }

    /**
     * Fetch per-radio statistics for a specific AP from /stat/device.
     * Returns an object with radio prefix keys: ng-rx_bytes, na-rx_bytes, 6e-rx_bytes, etc.
     * @param {string} mac  AP MAC address
     * @returns {Promise<object|null>}
     */
    async getAccessPointStats(mac) {
        return new Promise((resolve, reject) => {
            this.unifi.getAccessDevices(mac)
                .then(response => {
                    const ap = response.find(obj => obj.mac === mac);
                    if (!ap) return resolve(null);
                    // Extract the flat per-radio stats fields (ng-*, na-*, 6e-*)
                    const stats = {};
                    const radioPrefixes = ['ng', 'na', '6e'];
                    for (const prefix of radioPrefixes) {
                        for (const field of ['rx_bytes', 'tx_bytes', 'rx_packets', 'tx_packets']) {
                            const key = `${prefix}-${field}`;
                            if (typeof ap[key] === 'number') stats[key] = ap[key];
                        }
                    }
                    resolve(stats);
                })
                .catch(error => reject(error));
        });
    }
}

module.exports = ApiClient;
