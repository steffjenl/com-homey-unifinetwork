// eslint-disable-next-line node/no-unpublished-require,strict
'use strict';

const Homey = require('homey');
const {Log} = require('homey-log');
const ApiClient = require('./library/apiclient');
const UnifiConstants = require('./library/constants');

class UnifiNetwork extends Homey.App {
    /**
     * onInit is called when the app is initialized.
     */
    async onInit() {
        this.homeyLog = new Log({homey: this.homey});
        this.api = new ApiClient();
        this.api.setHomeyObject(this.homey);
        this.loggedIn = false;
        this.accessPointList = {};

        // Get Settings object
        this.settings = this.homey.settings.get(UnifiConstants.SETTINGS_KEY);
        if (!this.settings) {
            this.debug('Settings are not set.');
        }

        await this._initFlowTriggers();
        await this._initActionCards();

        this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, 'Initialized');

        // Enable remote debugging, if applicable
        if (Homey.env.DEBUG === 'true') {
            // eslint-disable-next-line global-require
            require('inspector')
                .open(9210, '0.0.0.0');
        }

        // Subscribe to credentials updates
        this.homey.settings.on('set', key => {
            if (key === UnifiConstants.SETTINGS_KEY) {
                this._appLogin();
            }
        });
        this._appLogin();

        this.debug('UnifiNetwork has been initialized');
    }

    async _initActionCards() {
        // this.updateAccessPointList();
        //
        // const _actionWifiClientConnected = this.homey.flow.getActionCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED);
        // _actionWifiClientConnected.registerRunListener(async (args, state) => {
        //     return Promise.resolve(args.device.getCapabilityValue('alarm_connected'));
        // });
        //
        // const _actionWifiClientConnectedWithAp = this.homey.flow.getActionCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED_WITH_AP);
        // _actionWifiClientConnectedWithAp.registerRunListener(async (args, state) => {
        //     return Promise.resolve(args.device.getCapabilityValue('alarm_connected'));
        // });
        //
        // _actionWifiClientConnectedWithAp.registerArgumentAutocompleteListener('accessPoint', async (query, args) => {
        //     let devices = [];
        //     for (var id in this.accessPointList) {
        //         let name = this.getAccessPointName(id);
        //         if (query && name.indexOf(query) === -1) continue;
        //
        //         devices.push({
        //             'name': name,
        //             'icon': '/app/com.ubnt.unifi/assets/accesspoint.svg',
        //             'id': id
        //         });
        //     }
        //     devices.sort((a, b) => {
        //         return a.name > b.name;
        //     })
        //     return Promise.resolve(devices);
        // });


        this.debug('UnifiNetwork init Action Cards');
    }

    async _initFlowTriggers() {
        this._clientConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CLIENT_CONNECTED);
        this._clientDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CLIENT_DISCONNECTED);
        this._cableClientConnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_CABLE_CLIENT_CONNECTED);
        this._cableClientDisconnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_CABLE_CLIENT_DISCONNECTED);
        this._firstDeviceConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_CONNECTED);
        this._firstDeviceOnline = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_ONLINE);
        this._lastDeviceOffline = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_LAST_DEVICE_OFFLINE);
        this._lastDeviceDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_LAST_DEVICE_DISCONNECTED);
        this._guestDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_GUEST_DISCONNECTED);
        this._guestConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_GUEST_CONNECTED);
        this._wifiClientRoamed = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_ROAMED);
        this._wifiClientDisconnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_DISCONNECTED);
        this._wifiClientConnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED);
        this._wifiClientRoamedToAp = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_ROAMED_TO_AP);
        this._wifiClientSignalChanged = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_SIGNAL_CHANGED);
        this.debug('UnifiNetwork init Flow Triggers');
    }

    async _initTimers() {
        const checkDevicesOffline = function () {
            this.checkDevicesOffline();
            this.updateAccessPointList();
        }.bind(this);
        this.homey.setTimeout(checkDevicesOffline, (this.settings.interval ? (this.settings.interval * 1000) : 15000));

        this.debug('UnifiNetwork init Timers');
    }

    updateAccessPointList() {
        this.api.getAccessPoints()
            .then(response => {
                response.forEach(accessPoint => {
                    if (!accessPoint.adopted || accessPoint.type !== 'uap') return;
                    if (this.accessPointList.hasOwnProperty(accessPoint.mac)) return;
                    this.accessPointList[accessPoint.mac] = {
                        name: accessPoint.name,
                        mac: accessPoint.mac,
                        num_clients: null,
                    };
                })
            })
            .catch(err => {
                this.debug('Error while fetching ap list');
                this.debug(err);
            });
    }

    getAccessPointName(accessPointId) {
        if (typeof this.accessPointList[accessPointId] === 'undefined') return null;
        return this.accessPointList[accessPointId].name;
    }

    isSameDevice(device, deviceList) {
        let i;
        for (i = 0; i < deviceList.length; i++) {
            if (deviceList[i].mac === device.mac) {
                return true;
            }
        }

        return false;
    }

    checkDevicesOffline() {
        this.api.unifi.getAllUsers().then(allUsers => {
            this.api.unifi.getClientDevices().then(clientDevices => {
                allUsers.forEach(device => {
                    if (this.isSameDevice(device, clientDevices)) {
                        this.onConnectDevice(device);
                    } else {
                        this.onDisconnectDevice(device);
                    }
                });
            }).catch(this.log);

        }).catch(this.log);

        const checkDevicesOffline = function () {
            this.checkDevicesOffline();
        }.bind(this);
        this.homey.setTimeout(checkDevicesOffline, 15000);
    }

    onDisconnectDevice(deviceArg) {
        if (deviceArg.is_wired) {
            const driver = this.homey.drivers.getDriver('cable-client');
            const device = driver.getUnifiDeviceById(deviceArg.mac);
            if (device) {
                device.onIsConnected(false);
            }
        } else {
            const driver = this.homey.drivers.getDriver('wifi-client');
            const device = driver.getUnifiDeviceById(deviceArg.mac);
            if (device) {
                device.onIsConnected(false);
            }
        }
    }

    onConnectDevice(deviceArg) {
        if (deviceArg.is_wired) {
            const driver = this.homey.drivers.getDriver('cable-client');
            const device = driver.getUnifiDeviceById(deviceArg.mac);
            if (device) {
                device.onIsConnected(true);
            }
        } else {
            const driver = this.homey.drivers.getDriver('wifi-client');
            const device = driver.getUnifiDeviceById(deviceArg.mac);
            if (device) {
                device.onIsConnected(true);
            }
        }
    }

    _appLogin() {
        this.debug('Logging in...');

        // Get Settings object
        const settings = this.homey.settings.get(UnifiConstants.SETTINGS_KEY);
        if (!settings) {
            this.debug('Settings are not set.');
            return;
        }

        this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, 'Connecting');

        this.api.setUnifiObject(settings.host, settings.port, settings.user, settings.pass, settings.site);

        (async () => {
            try {
                // LOGIN
                this.loggedIn = await this.api.unifi.login(settings.user, settings.pass);
                if (this.loggedIn) {
                    this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, 'Connected');
                    this.setLoggedIn(true);
                    this.debug('We are logged in!');

                    await this._initTimers();

                    if (settings.pullmethode === 1) {
                        // LISTEN for WebSocket events
                        const isListening = await this.api.unifi.listen();

                        if (isListening) {
                            this.debug('We are listening!');

                            //let that = this;

                            this.api.unifi.on('sta:sync.generic', function (payload) {
                                if (Array.isArray(payload)) {
                                    if (payload[0].subsystem === 'wlan') {
                                        // get wifi-client driver
                                        const driver = this.homey.drivers.getDriver('wifi-client');
                                        const device = driver.getUnifiDeviceById(payload[0].user);
                                        if (device) {
                                            // Parse Websocket payload message
                                            driver.onParseWebsocketMessage(device, payload);
                                        }
                                    } else if (payload[0].subsystem === 'lan') {
                                        // get cable-client driver
                                        const driver = this.homey.drivers.getDriver('cable-client');
                                        const device = driver.getUnifiDeviceById(payload[0].user);
                                        if (device) {
                                            // Parse Websocket payload message
                                            driver.onParseWebsocketMessage(device, payload);
                                        }
                                    }
                                }
                            }.bind(this));

                            // Listen for disconnected and connected events
                            this.api.unifi.on('events.*', function (payload) {
                                if (Array.isArray(payload)) {
                                    // that.homey.app.debug(`${this.event}`);
                                    // that.homey.app.debug(`${JSON.stringify(payload)}`);
                                    if (this.event === 'events.evt_wu_disconnected') {
                                        this.onIsConnected(false, payload[0]);
                                    } else if (this.event === 'events.evt_wu_connected') {
                                        this.onIsConnected(true, payload[0]);
                                    }


                                    if (payload[0].subsystem === 'wlan') {
                                        // get wifi-client driver
                                        const driver = this.homey.drivers.getDriver('wifi-client');
                                        const device = driver.getUnifiDeviceById(payload[0].user);
                                        if (device) {
                                            if (this.event === 'events.evt_wu_disconnected') {
                                                driver.onDisconnectedMessage(device);
                                            } else if (this.event === 'events.evt_wu_connected') {
                                                driver.onConnectedMessage(device);
                                            }
                                        }
                                    } else if (payload[0].subsystem === 'lan') {
                                        // get cable-client driver
                                        const driver = this.homey.drivers.getDriver('cable-client');
                                        const device = driver.getUnifiDeviceById(payload[0].user);
                                        if (device) {
                                            if (this.event === 'events.evt_wu_disconnected') {
                                                driver.onDisconnectedMessage(device);
                                            } else if (this.event === 'events.evt_wu_connected') {
                                                driver.onConnectedMessage(device);
                                            }
                                        }
                                    }
                                }
                            }.bind(this));
                        }
                    }
                }

            } catch (error) {
                this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, error);
                this.log('error = ' + error);
                this.setLoggedIn(false);
            }
        })();
    }

    onIsConnected(isConnected, payload) {
        this.homey.app.debug('onIsConnected: ' + JSON.stringify(payload));
        if (isConnected) {
            let deviceName = this.homey.app.api.getDeviceName(payload);

            let tokens = {
                mac: (payload.user === null || typeof payload.user === 'undefined') ? "" : payload.user,
                name: (deviceName === null || typeof deviceName === 'undefined') ? "" : deviceName,
                essid: (payload.ssid === null || typeof payload.ssid === 'undefined') ? "" : payload.ssid
            };
            this.homey.app._clientConnected.trigger(tokens);

        } else {
            let deviceName = this.homey.app.api.getDeviceName(payload);

            let tokens = {
                mac: (payload.user === null || typeof payload.user === 'undefined') ? "" : payload.user,
                name: (deviceName === null || typeof deviceName === 'undefined') ? "" : deviceName,
                essid: (payload.ssid === null || typeof payload.ssid === 'undefined') ? "" : payload.ssid
            };
            this.homey.app._clientDisconnected.trigger(tokens);
        }
    }

    async setLoggedIn(loggedIn) {
        this.loggedIn = loggedIn;
    }

    debug() {
        try {
            const debug = this.homey.settings.get(UnifiConstants.SETTINGS_DEBUG_KEY);

            if (Homey.env.DEBUG === 'true' || debug) {
                const args = Array.prototype.slice.call(arguments);
                args.unshift('[debug]');
                this.homey.api.realtime(UnifiConstants.REALTIME_DEBUG, args.join(' '));
                this.homey.log(args.join(' '));
            }
        } catch (exeption) {
            // when debug fails, we want an console.log
            console.log(exeption);
        }
    }
}

module.exports = UnifiNetwork;
