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

        // Subscribe to credentials updates
        this.homey.settings.on('set', key => {
            if (key === UnifiConstants.SETTINGS_KEY) {
                this.settings = this.homey.settings.get(UnifiConstants.SETTINGS_KEY);
                this._appLogin();
            }
        });
        this._appLogin();

        // install timers
        await this._initTimers();

        this._ListingWebsocket();

        this.debug('UnifiNetwork has been initialized');
    }

    _ListingWebsocket() {
        try {
            // this.api.unifi.on('ctrl.*', function () {
            //     that.debug(`${this.event}`);
            // });
            // Listen for disconnected and connected events
            const that = this;
            this.api.unifi.on('events.*', function (payload) {
                that.debug(`${this.event} = ${JSON.stringify(payload)}`);
                /**
                 if (payload[0].key === 'EVT_WU_Roam') {
                                    this.homey.log('event.EVT_WU_Roam = ' + JSON.stringify(payload));
                                }

                 [{"user":"5c:52:30:55:7d:67","ap_from":"d0:21:f9:89:df:f9","ap_to":"d0:21:f9:87:4e:9d","radio_from":"ng","radio_to":"ng","radio":"ng","channel_from":"6","channel_to":"1","channel":"1","ssid":"Paris","key":"EVT_WU_Roam","subsystem":"wlan","is_negative":false,"site_id":"59aaaefee4b0b7776f45c977","time":1672437522587,"datetime":"2022-12-30T21:58:42Z","msg":"User[5c:52:30:55:7d:67] roams from AP[d0:21:f9:89:df:f9] to AP[d0:21:f9:87:4e:9d] from \"channel 6(ng)\" to \"channel 1(ng)\" on \"Paris\"","_id":"63af5f320274390085432736"},{"rc":"ok","message":"events"}]

                 */
                if (Array.isArray(payload)) {
                    // start application flow cards
                    // created a setting because this function has memory overload on Homey
                    if (this.settings && "applicationFlows" in this.settings && this.settings.applicationFlows === "1") {
                        if (payload[0].key === 'EVT_WU_Disconnected') {
                            that.onIsConnected(false, payload[0]);
                        } else if (payload[0].key === 'EVT_WU_Connected') {
                            that.onIsConnected(true, payload[0]);
                        }
                    }

                    // start device flow cards
                    if (payload[0].subsystem === 'wlan') {
                        // get wifi-client driver
                        const driver = that.homey.drivers.getDriver('wifi-client');
                        const device = driver.getUnifiDeviceById(payload[0].user);
                        if (device) {
                            if (payload[0].key === 'EVT_WU_Disconnected') {
                                device.onIsConnected(false, null);
                            } else if (payload[0].key === 'EVT_WU_Connected') {
                                device.onIsConnected(true, payload[0].ssid);
                            }
                        }
                    } else if (payload[0].subsystem === 'lan') {
                        // get cable-client driver
                        const driver = that.homey.drivers.getDriver('cable-client');
                        const device = driver.getUnifiDeviceById(payload[0].user);
                        if (device) {
                            if (payload[0].key === 'EVT_WU_Disconnected') {
                                device.onIsConnected(false);
                            } else if (payload[0].key === 'EVT_WU_Connected') {
                                device.onIsConnected(true);
                            }
                        }
                    }
                }
            });
        } catch (error) {
            this.debug('catch error = ' + JSON.stringify(error));
        }
    }

    /**
     * onUninit is called when the app is shutdown.
     */
    async onUninit() {
        this.loggedIn = false;
        await this.homey.api.unifi.logout();
        this.homey.api.unifi._close();
        delete this.homey.api;
        delete this.homey.accessPointList;
    }

    async _initActionCards() {
        this.debug('UnifiNetwork init Action Cards');
    }

    async _initFlowTriggers() {
        this._clientConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CLIENT_CONNECTED);
        this._clientDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CLIENT_DISCONNECTED);
        this._cableClientConnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_CABLE_CLIENT_CONNECTED);
        this._cableClientDisconnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_CABLE_CLIENT_DISCONNECTED);
        //this._firstDeviceConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_CONNECTED);
        //this._firstDeviceOnline = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_ONLINE);
        //this._lastDeviceOffline = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_LAST_DEVICE_OFFLINE);
        //this._lastDeviceDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_LAST_DEVICE_DISCONNECTED);
        this._guestDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_GUEST_DISCONNECTED);
        this._guestConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_GUEST_CONNECTED);
        this._wifiClientRoamed = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_ROAMED);
        this._wifiClientDisconnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_DISCONNECTED);
        this._wifiClientConnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED);
        this._wifiClientRoamedToAp = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_ROAMED_TO_AP);
        this._wifiClientSignalChanged = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_SIGNAL_CHANGED);

        const wifiBlock = this.homey.flow.getActionCard('wifi_block');
        wifiBlock.registerRunListener(async (args, state) => {
            this.homey.app.api.unifi.blockClient(args.Device.getData().id);
        });

        const wifiUnBlock = this.homey.flow.getActionCard('wifi_unblock');
        wifiUnBlock.registerRunListener(async (args, state) => {
            this.homey.app.api.unifi.unblockClient(args.Device.getData().id);
        });
        this.debug('UnifiNetwork init Flow Triggers');
    }

    async _initTimers() {
        // update device status every x
        this.homey.setInterval(this.checkDevicesState.bind(this), (this.settings && "interval" in this.settings ? (this.settings.interval * 1000) : 15000));
        // update every 12 hours all accessPoints
        this.homey.setInterval(this.updateAccessPointList.bind(this), 43200000);
        //
        this.debug('UnifiNetwork init Timers');
    }

    updateAccessPointList() {
        if (this.loggedIn) {
            this.debug('Execute updateAccessPointList() for updating accessPoint namens.');
            this.accessPointList = [];
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
    }

    getAccessPointName(accessPointId) {
        if (typeof this.accessPointList[accessPointId] === 'undefined') return null;
        return this.accessPointList[accessPointId].name;
    }

    isDeviceInArray(deviceMac, deviceList) {
        let i;
        for (i = 0; i < deviceList.length; i++) {
            if (deviceList[i].mac === deviceMac) {
                return true;
            }
        }
        i = null;
        return false;
    }

    getDeviceFromArray(deviceMac, deviceList) {
        let i;
        for (i = 0; i < deviceList.length; i++) {
            if (deviceList[i].mac === deviceMac) {
                return deviceList[i];
            }
        }
        i = null;
        return false;
    }

    checkDevicesState() {
        if (this.loggedIn) {
            // get all Wi-Fi devices and there information
            const devicesWifi = this.homey.drivers.getDriver('wifi-client').getDevices();
            if (devicesWifi.length > 0) {
                this.api.unifi.getClientDevices().then(clientDevices => {
                    devicesWifi.forEach(device => {
                        const devicePayload = this.getDeviceFromArray(device.getData().id, clientDevices);
                        this.homey.app.debug(`checkDevicesState = ${JSON.stringify(devicePayload)}`);
                        if (this.isDeviceInArray(device.getData().id, clientDevices)) {
                            device.onIsConnected(true, devicePayload.essid);
                            device.onUpdateMessagePayload(devicePayload);
                        } else {
                            device.onIsConnected(false, null);
                            device.onUpdateMessagePayload(devicePayload);
                        }
                    });
                }).catch(this.homey.log);
            }

            // get all Cable devices and there information
            const devicesCable = this.homey.drivers.getDriver('cable-client').getDevices();
            if (devicesCable.length > 0) {
                this.api.unifi.getClientDevices().then(clientDevices => {
                    devicesCable.forEach(device => {
                        if (this.isDeviceInArray(device.getData().id, clientDevices)) {
                            device.onIsConnected(true);
                            device.onUpdateMessagePayload(this.getDeviceFromArray(device.getData().id, clientDevices));
                        } else {
                            device.onIsConnected(false);
                        }
                    });
                    clientDevices = null;
                }).catch(this.homey.log);
            }
        }
    }

    async _appLogin() {
        this.debug('Logging in...');

        // Get Settings object
        const settings = this.homey.settings.get(UnifiConstants.SETTINGS_KEY);
        if (!settings) {
            this.debug('Settings are not set.');
            return;
        }

        if (this.loggedIn) {
            this.loggedIn = false;
            await this.homey.app.api.unifi.logout();
            this.homey.app.api.unifi._close();
        }

        this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, 'Connecting');
        this.api.setUnifiObject(settings.host, settings.port, settings.user, settings.pass, settings.site);

        try {
            // LOGIN
            this.loggedIn = await this.api.unifi.login(settings.user, settings.pass);
            if (this.loggedIn) {
                this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, 'Connected');
                this.setLoggedIn(true);
                this.debug('We are logged in!');

                // get all accesspoints from controller
                this.updateAccessPointList();

                if ("pullmethode" in settings && settings.pullmethode === '1') {
                    // LISTEN for WebSocket events
                    this.api.unifi.listen().then(() => {
                        let that = this;
                        this.debug('WebSocket is connected');
                        this._ListingWebsocket();
                    });
                }
            }

        } catch (error) {
            //this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, JSON.stringify(error));
            this.debug('catch error = ' + JSON.stringify(error));
            this.setLoggedIn(false);
        }
    }

    onIsConnected(isConnected, payload) {
        const deviceName = this.homey.app.api.getDeviceName(payload);
        if (isConnected) {
            const tokens = {
                mac: (payload.user === null || typeof payload.user === 'undefined') ? "" : payload.user,
                name: (deviceName === null || typeof deviceName === 'undefined') ? "" : deviceName,
                essid: (payload.ssid === null || typeof payload.ssid === 'undefined') ? "" : payload.ssid
            };
            this.homey.app._clientConnected.trigger(tokens);

        } else {
            const tokens = {
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
        } catch (exception) {
            // when debug fails, we want a console.log
            this.homey.error(exception);
        }
    }
}

module.exports = UnifiNetwork;
