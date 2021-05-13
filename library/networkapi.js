'use strict';

const Homey = require('homey');
const https = require('https');
const NetworkWebClient = require('./webclient');
const NetworkWebSocket = require('./websocket');
const Constants = require('./constants');

class NetworkAPI {

    constructor() {
        // Single WebSocket instance for all devices
        this.ws = new NetworkWebSocket();
        this.webclient = new NetworkWebClient();

        this._siteId = 'default';
        this._rtspPort = null;
    }

    getProxyCookieToken() {
        return this.webclient.getCookieToken();
    }

    getHost() {
        return this.webclient.getServerHost();
    }

    getSiteId() {
        return this._siteId;
    }

    setSiteId(siteId) {
        this._siteId = siteId;
    }

    getCSRFToken(host, port) {
        Homey.app.debug('Get CSRF Token...');

        return new Promise((resolve, reject) => {
            Homey.ManagerApi.realtime(Constants.EVENT_SETTINGS_STATUS, 'Getting CSRF token');

            if (!host) reject(new Error('Invalid host.'));

            const options = {
                method: 'GET',
                hostname: host,
                port: port,
                path: '/api/users/self',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    Accept: '*/*',
                    'x-csrf-token': 'undefined'
                },
                maxRedirects: 20,
                rejectUnauthorized: false,
                timeout: 2000,
                keepAlive: true,
            };

            const req = https.request(options, res => {
                const body = [];

                res.on('data', chunk => body.push(chunk));
                res.on('end', () => {
                    // Obtain authorization header
                    res.rawHeaders.forEach((item, index) => {
                        if (item.toLowerCase() === 'set-cookie') {
                            this.webclient.setCookieToken(res.rawHeaders[index + 1]);
                        }

                        // X-CSRF-Token
                        if (item.toLowerCase() === 'x-csrf-token') {
                            this.webclient.setCSRFToken(res.rawHeaders[index + 1]);
                        }
                    });

                    // Non proxy controllers don't send any csrf token headers.
                    if (this.webclient.getUseProxy() && this.webclient.getCSRFToken() === null) {
                        reject(new Error('Invalid x-csrf-token header.'));
                        return;
                    }

                    // Connected
                    Homey.ManagerApi.realtime(Constants.EVENT_SETTINGS_STATUS, 'CSRF Token found');
                    //
                    return resolve('We got it!');
                });
            });

            req.on('error', error => {
                Homey.ManagerApi.realtime(Constants.EVENT_SETTINGS_STATUS, 'Disconnected');
                return reject(error);
            });
            req.end();
        });
    }

    login(host, port, username, password, useProxy) {
        Homey.app.debug('Logging in...');

        this.webclient.setServerHost(host);
        this.webclient.setServerPort(port);
        this.webclient.setUseProxy(useProxy);

        return new Promise((resolve, reject) => {

        this.getCSRFToken(host, port).then(response => {

                Homey.ManagerApi.realtime(Constants.EVENT_SETTINGS_STATUS, 'Connecting');

                if (!host) reject(new Error('Invalid host.'));
                if (!username) reject(new Error('Invalid username.'));
                if (!password) reject(new Error('Invalid password.'));

                const credentials = JSON.stringify({
                    username,
                    password,
                });

                const options = {
                    method: 'POST',
                    hostname: host,
                    port: port,
                    path: (useProxy ? '/api/auth/login' : '/api/login'),
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        Accept: 'application/json',
                        'x-csrf-token': this.webclient.getCSRFToken(),
                    },
                    maxRedirects: 20,
                    rejectUnauthorized: false,
                    timeout: 2000,
                    keepAlive: true,
                };

                const req = https.request(options, res => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`Request failed: ${options.path} (status code: ${res.statusCode}) (creds: ${credentials}`));
                    }
                    const body = [];

                    res.on('data', chunk => body.push(chunk));
                    res.on('end', () => {
                        const json = JSON.parse(body);

                        // Obtain authorization header
                        res.rawHeaders.forEach((item, index) => {
                            if (item.toLowerCase() === 'set-cookie') {
                                this.webclient.setCookieToken(res.rawHeaders[index + 1]);
                                console.log(res.rawHeaders[index + 1]);
                            }

                            // X-CSRF-Token
                            if (item.toLowerCase() === 'x-csrf-token') {
                                this.webclient.setCSRFToken(res.rawHeaders[index + 1]);
                            }
                        });

                        if (this.webclient.getCookieToken() === null) {
                            reject(new Error('Invalid set-cookie header.'));
                            return;
                        }

                        // Connected
                        Homey.ManagerApi.realtime(Constants.EVENT_SETTINGS_STATUS, 'Connected');
                        // reconnect websocket listener
                        //this.ws.reconnectUpdatesListener();
                        //
                        return resolve('Logged in...');
                    });
                });

                req.on('error', error => {
                    Homey.ManagerApi.realtime(Constants.EVENT_SETTINGS_STATUS, 'Disconnected');
                    return reject(error);
                });

                req.write(credentials);
                req.end();

        }).catch(error => reject(error));
        });
    }

    getSites() {
        return new Promise((resolve, reject) => {
            this.webclient.get('self/sites')
                .then(response => {
                    const result = JSON.parse(response);
                    if (result) {
                        return resolve(result);
                    } else {
                        return reject(new Error('Error obtaining network sites.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getClients() {
        return new Promise((resolve, reject) => {
            this.webclient.get(`s/${this.getSiteId()}/stat/sta`)
                .then(response => {
                    const result = JSON.parse(response);
                    if (result) {
                        return resolve(result.data);
                    } else {
                        return reject(new Error('Error obtaining network sites.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getWiredClients() {
        return new Promise((resolve, reject) => {
            this.webclient.get(`s/${this.getSiteId()}/stat/alluser?within=24`)
                .then(response => {
                    const result = JSON.parse(response);
                    if (result) {
                        const clients = [];
                        result.data.forEach(client => {
                            if (client.is_wired === true) {
                                clients.push(client);
                            }
                        });
                        return resolve(clients);
                    } else {
                        return reject(new Error('Error obtaining network sites.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getWifiClients() {
        return new Promise((resolve, reject) => {
            this.webclient.get(`s/${this.getSiteId()}/stat/alluser?within=24`)
                .then(response => {
                    const result = JSON.parse(response);
                    if (result) {
                        const clients = [];
                        result.data.forEach(client => {
                            if (client.is_wired === false) {
                                clients.push(client);
                            }
                        });
                        return resolve(clients);
                    } else {
                        return reject(new Error('Error obtaining network sites.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getAccesspoints() {
        return new Promise((resolve, reject) => {
            this.webclient.get(`s/${this.getSiteId()}/stat/sta`)
                .then(response => {
                    const result = JSON.parse(response);
                    if (result) {
                        return resolve(result.data);
                    } else {
                        return reject(new Error('Error obtaining accesspoints.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getUserGroupList() {
        return new Promise((resolve, reject) => {
            this.webclient.get(`s/${this.getSiteId()}/list/usergroup`)
                .then(response => {
                    const result = JSON.parse(response);
                    if (result) {
                        return resolve(result.data);
                    } else {
                        return reject(new Error('Error obtaining user group lists.'));
                    }
                })
                .catch(error => reject(error));
        });
    }




    // OLD ENDPOINTS

    getAccessKey() {
        return new Promise((resolve, reject) => {
            this.webclient.post('auth/access-key')
                .then(response => {
                    const result = JSON.parse(response);
                    this.webclient.setApiKey(result.accessKey);

                    if (result) {
                        return resolve(result);
                    } else {
                        return reject(new Error('Error obtaining access-key.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getDebugInfo() {
        return new Promise((resolve, reject) => {
            this.webclient.get('debug/info')
                .then(response => {
                    const result = JSON.parse(response);

                    if (result) {
                        return resolve(result);
                    } else {
                        return reject(new Error('Error obtaining server.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getServer() {
        return new Promise((resolve, reject) => {
            this.webclient.get('nvr')
                .then(response => {
                    const result = JSON.parse(response);

                    if (result) {
                        return resolve(result);
                    } else {
                        return reject(new Error('Error obtaining server.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    findCameraById(id) {
        return new Promise((resolve, reject) => {
            this.webclient.get(`cameras/${id}`)
                .then(response => {
                    const result = JSON.parse(response);

                    if (result) {
                        return resolve(result);
                    } else {
                        return reject(new Error('Error obtaining cameras.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getCameras() {
        return new Promise((resolve, reject) => {
            this.webclient.get('cameras')
                .then(response => {
                    const result = JSON.parse(response);
                    if (result) {
                        return resolve(result);
                    } else {
                        return reject(new Error('Error obtaining cameras.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    snapshot(id, widthInPixels = 1920) {
        return new Promise((resolve, reject) => {
            if (!id) reject(new Error('Invalid camera identifier.'));

            const height = this.getAspectRatioHeight(id, widthInPixels);

            const params = {
                accessKey: this.webclient.getApiKey(),
                w: widthInPixels,
                h: height,
                force: true,
            };

            let snapshot;
            return this.webclient.download(`cameras/${id}/snapshot`, params)
                .then(buffer => resolve(buffer))
                .catch(error => reject(new Error(`Error obtaining snapshot buffer: ${error}`)));
        });
    }

    setRecordingMode(camera, mode = 'never') {
        return new Promise((resolve, reject) => {
            this.findCameraById(camera.id)
                .then(cameraInfo => {
                    const recordingSettings = cameraInfo.recordingSettings;
                    recordingSettings.mode = mode;

                    const params = {
                        recordingSettings,
                    };
                    return this.webclient.patch(`cameras/${camera.id}`, params)
                        .then(() => resolve('Recording mode successfully set.'))
                        .catch(error => reject(new Error(`Error setting recording mode: ${error}`)));
                })
                .catch(error => reject(new Error(`Error setting recording mode: ${error}`)));
        });
    }

    setMicVolume(camera, volume = 100) {
        return new Promise((resolve, reject) => {
            const params = {
                micVolume: volume,
            };
            return this.webclient.patch(`cameras/${camera.id}`, params)
                .then(() => resolve('Mic volume successfully set.'))
                .catch(error => reject(new Error(`Error setting mic volume: ${error}`)));
        });
    }

    getMotionEvents() {
        return new Promise((resolve, reject) => {
            let start = new Date();
            start.setHours(0, 0, 0, 0);
            let end = new Date();
            end.setHours(23, 59, 59, 999);

            let startTime = (this._lastMotionAt == null ? start.getTime() : this._lastMotionAt);

            this.webclient.get(`events?start=${startTime}&end=${end.getTime()}&type=motion`)
                .then(response => {
                    start = null;
                    end = null;
                    startTime = null;
                    const result = JSON.parse(response);
                    if (result) {
                        return resolve(result);
                    } else {
                        return reject(new Error('Error obtaining motion events.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getStreamUrl(camera) {
        return new Promise((resolve, reject) => {
            let rtspAlias = null;

            this.findCameraById(camera.id)
                .then(cameraInfo => {
                    cameraInfo.channels.forEach(channel => {
                        if (channel.isRtspEnabled) {
                            rtspAlias = channel.rtspAlias;
                        }
                    });

                    if (!rtspAlias) {
                        resolve('');
                    }

                    resolve(`rtsp://${this.webclient.getServerHost()}:${this._rtspPort}/${rtspAlias}`);
                })
                .catch(error => reject(new Error(`Error getting steam url: ${error}`)));
        });
    }
}

module.exports = NetworkAPI;
