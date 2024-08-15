// eslint-disable-next-line node/no-unpublished-require,strict
'use strict';

const Homey = require('homey');
const {Log} = require('homey-log');
const ApiClient = require('./library/apiclient');
const UnifiConstants = require('./library/constants');
const {setFlagsFromString} = require('v8');
const {runInNewContext} = require('vm');
class UnifiNetwork extends Homey.App {
    /**
     * onInit is called when the app is initialized.
     */
    async onInit() {
        this.homeyLog = new Log({homey: this.homey});
        this.api = new ApiClient({homey: this.homey});
        this.loggedIn = false;
        this.accessPointList = {};
        this.onlineClientList = {};

        this.checkDevicesStateInterval = null;
        this.updateAccessPointListInterval = null;

        this._refreshAuthTokensnterval = 60 * 60 * 1000; // 1 hour


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
        await this._appLogin();
        // refresh auth tokens every hour
        await this.refreshAuthTokens();

        this.debug('UnifiNetwork has been initialized');
    }

    /**
     * parseWebsocketMessage
     */
    parseWebsocketMessage(payload) {
        let that = this;
        // start application flow cards
        // created a setting because this function has memory overload on Homey
        if (that.settings && "applicationFlows" in that.settings && that.settings.applicationFlows === "1") {
            if (payload.key === 'EVT_WU_Disconnected') {
                that.homey.log(`EVT_WU_Disconnected : ${JSON.stringify(payload)}`);
                that.onIsConnected(false, payload);
                return;
            } else if (payload.key === 'EVT_WU_Connected') {
                that.homey.log(`EVT_WU_Connected : ${JSON.stringify(payload)}`);
                that.onIsConnected(true, payload);
                return;
            }
        }

        if (payload.type === 'usw') {
            that.homey.log(`[websocket] [usw]: ${JSON.stringify(payload)}`);
            const driver = that.homey.drivers.getDriver('network-switch');
            const deviceMac = payload.mac;
            const device = driver.getUnifiDeviceById(deviceMac);
            //
            if (device) {
                device.onStatusChange(payload);
            }
        }

        // start device flow cards
        if (payload.subsystem === 'wlan') {
            that.homey.log(`[websocket] [wlan]: ${JSON.stringify(payload)}`);
            // get wifi-client driver
            const driver = that.homey.drivers.getDriver('wifi-client');
            const deviceMac = (payload.user === null || typeof payload.user === 'undefined') ? payload.client : payload.user;
            const device = driver.getUnifiDeviceById(deviceMac);
            if (device) {
                that.checkNumClientsConnectedTrigger();

                if (payload.key === 'EVT_WU_Disconnected') {
                    device.onIsConnected(false, null);
                } else if (payload.key === 'EVT_WU_Connected') {
                    device.onIsConnected(true, payload.ssid);
                } else if (payload.key === 'EVT_WC_Blocked') {
                    that.homey.log(`[websocket] [wlan]: ${JSON.stringify(payload)}`);
                    const tokens = {
                        blocked: true,
                    }
                    device.onBlockedChange(tokens);
                } else if (payload.key === 'EVT_WC_Unblocked') {
                    that.homey.log(`[websocket] [wlan]: ${JSON.stringify(payload)}`);
                    const tokens = {
                        blocked: false,
                    }
                    device.onBlockedChange(tokens);
                }
            }
        } else if (payload.subsystem === 'lan') {
            that.homey.log(`[websocket] [cable]: ${JSON.stringify(payload)}`);
            // get cable-client driver
            const driver = that.homey.drivers.getDriver('cable-client');
            const deviceMac = (payload.user === null || typeof payload.user === 'undefined') ? payload.client : payload.user;
            const device = driver.getUnifiDeviceById(deviceMac);
            if (device) {
                if (payload.key === 'EVT_WU_Disconnected') {
                    device.onIsConnected(false);
                } else if (payload.key === 'EVT_WU_Connected') {
                    device.onIsConnected(true);
                } else if (payload.key === 'EVT_LC_Blocked') {
                    const tokens = {
                        blocked: true,
                    }
                    device.onBlockedChange(tokens);
                } else if (payload.key === 'EVT_LC_Unblocked') {
                    const tokens = {
                        blocked: false,
                    }
                    device.onBlockedChange(tokens);
                }
            }
        }
        that = null;
    }

    /**
     * onUninit is called when the app is shutdown.
     */
    async onUninit() {
        this.loggedIn = false;
        this.checkDevicesStateInterval = null;
        this.updateAccessPointListInterval = null;
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
        this._firstDeviceConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_CONNECTED);
        this._firstDeviceConnected.registerArgumentAutocompleteListener('accessPoint', async (query, args) => {
            let results = [];
            Object.values(this.accessPointList).forEach((accessPoint, value, array) => {
                results.push({
                    name: accessPoint.name,
                    description: accessPoint.mac,
                    id: accessPoint.mac,
                });
            });

            // filter based on the query
            return results.filter((result) => {
                return result.name.toLowerCase().includes(query.toLowerCase());
            });
        });
        this._firstDeviceOnline = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_ONLINE);
        this._lastDeviceOffline = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_LAST_DEVICE_OFFLINE);
        this._lastDeviceDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_LAST_DEVICE_DISCONNECTED);
        this._lastDeviceDisconnected.registerArgumentAutocompleteListener('accessPoint', async (query, args) => {
            let results = [];
            Object.values(this.accessPointList).forEach((accessPoint, value, array) => {
                results.push({
                    name: accessPoint.name,
                    description: accessPoint.mac,
                    id: accessPoint.mac,
                });
            });

            // filter based on the query
            return results.filter((result) => {
                return result.name.toLowerCase().includes(query.toLowerCase());
            });
        });
        //this._guestDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_GUEST_DISCONNECTED);
        //this._guestConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_GUEST_CONNECTED);
        this._wifiClientRoamed = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_ROAMED);
        this._wifiClientDisconnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_DISCONNECTED);
        this._wifiClientConnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED);
        this._wifiClientRoamedToAp = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_ROAMED_TO_AP);
        this._wifiClientSignalChanged = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_SIGNAL_CHANGED);

        const wifiBlock = this.homey.flow.getActionCard('wifi_block');
        wifiBlock.registerRunListener(async (args, state) => {
            try {
                this.homey.app.api.unifi.blockClient(args.Device.getData().id);
            } catch {
                this.homey.error(`[wifi_block]: ${JSON.stringify(error)}`);
            }
        });

        const wifiUnBlock = this.homey.flow.getActionCard('wifi_unblock');
        wifiUnBlock.registerRunListener(async (args, state) => {
            try {
                this.homey.app.api.unifi.unblockClient(args.Device.getData().id);
            } catch {
                this.homey.error(`[wifi_unblock]: ${JSON.stringify(error)}`);
            }
        });

        const cableBlock = this.homey.flow.getActionCard('cable_block');
        cableBlock.registerRunListener(async (args, state) => {
            try {
                this.homey.app.api.unifi.blockClient(args.Device.getData().id);
            } catch {
                this.homey.error(`[cable_block]: ${JSON.stringify(error)}`);
            }
        });

        const cableUnBlock = this.homey.flow.getActionCard('cable_unblock');
        cableUnBlock.registerRunListener(async (args, state) => {
            try {
                this.homey.app.api.unifi.unblockClient(args.Device.getData().id);
            } catch (error) {
                this.homey.error(`[cable_unblock]: ${JSON.stringify(error)}`);
            }
        });

        const _powerCycleSwitchPort = this.homey.flow.getActionCard('network_switch_power_cycle_port');
        _powerCycleSwitchPort.registerRunListener(async (args, state) => {
            try {
                if (args.device.hasCapability('ports') && args.port > args.device.getCapabilityValue('ports')) {
                    this.homey.error(`[network_switch_power_cycle_port]: Port ${args.port} is not available on ${args.device.getData().id}`);
                    return;
                }
                this.homey.app.api.unifi.powerCycleSwitchPort(args.device.getData().id, args.port);
            } catch (error) {
                this.homey.error(`[network_switch_power_cycle_port]: ${args.device.getData().id} ${args.port} ${JSON.stringify(error)}`);
            }
        });
        this.debug('UnifiNetwork init Flow Triggers');
    }

    async _initTimers() {
        // clean all interval
        if (this.checkDevicesStateInterval) {
            this.homey.clearInterval(this.checkDevicesStateInterval);
        }
        if (this.updateAccessPointListInterval) {
            this.homey.clearInterval(this.updateAccessPointListInterval);
        }

        // update device status every x
        this.checkDevicesStateInterval = this.homey.setInterval(this.checkDevicesState.bind(this), (this.settings && "interval" in this.settings ? (this.settings.interval * 1000) : 15000));
        // update every 12 hours all accessPoints
        this.updateAccessPointListInterval = this.homey.setInterval(this.updateAccessPointList.bind(this), 43200000);
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
                        if (this.isDeviceInArray(device.getData().id, clientDevices)) {
                            this.homey.app.debug(`Interval Device ${device.getName()} is connected`);
                            device.onIsConnected(true, devicePayload.essid);
                            device.onUpdateMessagePayload(devicePayload);
                        } else {
                            this.homey.app.debug(`Interval Device ${device.getName()} is disconnected`);
                            device.onIsConnected(false, null);
                            device.onUpdateMessagePayload(devicePayload);
                        }
                    });
                }).catch((error) => {
                    if (error.response && "status" in error.response && error.response.status === 401) {
                        this.homey.error(`[checkDevicesState][wlan]: AccessDenied`);
                        this._appLogin();
                    }
                    else {
                        this.homey.app.debug(`[checkDevicesState][wlan]: error when retrieving getClientDevices`);
                    }
                });
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
                }).catch((error) => {
                    this.homey.app.debug(`[checkDevicesState][cable]: error when retrieving getClientDevices`);
                });
            }
        }

        // check for first and last connected devices on accesspoints
        this.checkAccessPoints();

        // clean memory every time we collect some information
        this.gcManual();
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

                // install timers
                await this._initTimers();

                // get all accesspoints from controller
                this.updateAccessPointList();

                if ("pullmethode" in settings && settings.pullmethode === '1') {
                    // LISTEN for WebSocket events
                    this.api.setWebSocketObject(settings.host, settings.port, settings.user, settings.pass, settings.site);
                    this.api.websocket.listen().then((connected) => {
                        if (connected) {
                            this.debug('WebSocket is connected');
                        }
                    });
                }
            }

        } catch (error) {
            //this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, JSON.stringify(error));
            this.debug('catch error = ' + JSON.stringify(error));
            this.setLoggedIn(false);
        }
    }

    async refreshAuthTokens()    {
        const refreshAuthTokens = setInterval(() => {
            try {
                this.debug('Refreshing auth tokens');
                this._appLogin();
            } catch (error) {
                this.homey.error(`${JSON.stringify(error)}`);
            }
        }, this._refreshAuthTokensnterval);
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

    debug(message) {
        try {
            const debug = this.homey.settings.get(UnifiConstants.SETTINGS_DEBUG_KEY);

            if (Homey.env.DEBUG === 'true' || debug) {
                //const args = Array.prototype.slice.call(arguments);
                //args.unshift('[debug]');
                //this.homey.api.realtime(UnifiConstants.REALTIME_DEBUG, args.join(' '));
                //this.homey.log(args.join(' '));
                const debugMessage = `[debug] ${message}`;
                this.homey.api.realtime(debugMessage);
                this.homey.log(debugMessage);
            }
        } catch (exception) {
            // when debug fails, we want a console.log
            this.homey.error(exception);
        }
    }

    checkNumClientsConnectedTrigger() {
        try {
            const wifiDriver = this.homey.drivers.getDriver('wifi-client');
            let onlineDeviceCount = 0;
            let deviceName = '';
            wifiDriver.getDevices().forEach(device => {
                if (device.getCapabilityValue('connected')) {
                    onlineDeviceCount++;
                    deviceName = device.getName();
                }
            });

            let tokens = {};
            if (this.numClientsOnline === 0 && onlineDeviceCount > 0) {
                tokens.name = deviceName;
                this.homey.app._firstDeviceOnline.trigger(tokens);
            }
            if (this.numClientsOnline > 0 && onlineDeviceCount === 0) {
                this.homey.app._lastDeviceOffline.trigger(tokens);
            }
        } catch (error) {
            this.homey.error(`[checkNumClientsConnectedTrigger]: ${JSON.stringify(error)}`);
        }
    }

    checkAccessPoints() {
        let that = this;
        if (!that.accessPointList) return;
        const wifiDriver = that.homey.drivers.getDriver('wifi-client');

        for (var ap_mac in that.accessPointList) {
            let num_clients = 0;

            wifiDriver.getDevices().forEach(device => {
                if (device.getCapabilityValue('ap_mac') === ap_mac) num_clients += 1;
            });
            let ap_name = that.getAccessPointName(ap_mac);
            that.homey.app.debug(`Accesspoint ${ap_name} (${ap_mac}) has ${num_clients} clients`);

            if (num_clients !== that.accessPointList[ap_mac].num_clients && that.accessPointList[ap_mac].num_clients !== null) {
                let tokens = {
                    accessPoint: that.getAccessPointName(ap_mac),
                    last_num: that.accessPointList[ap_mac].num_clients,
                    curr_num: num_clients,
                };

                if (tokens.last_num === 0 && tokens.curr_num >= 0) {
                    that.homey.app.debug("Triggering first_device_connected with state", tokens);
                    that._firstDeviceConnected.trigger(tokens);
                }
                if (tokens.last_num > 0 && tokens.curr_num === 0) {
                    that.homey.app.debug("Triggering last_device_disconnected with state", tokens);
                    that._lastDeviceDisconnected.trigger(tokens);
                }
            }

            // Set num clients for accesspoint
            that.accessPointList[ap_mac].num_clients = num_clients;
        }
        that = null;
    }

    /**
     * Convert a Homey time to a local time
     * @param {Date} homeyTime
     * @returns {Date}
     */
    toLocalTime(homeyTime) {
        const tz = this.homey.clock.getTimezone();
        const localTime = new Date(homeyTime.toLocaleString('en-US', { timeZone: tz }));
        return localTime;
    }

    gcManual() {
        setFlagsFromString('--expose_gc');
        const gc = runInNewContext('gc'); // nocommit
        gc();
    }
}

module.exports = UnifiNetwork;
