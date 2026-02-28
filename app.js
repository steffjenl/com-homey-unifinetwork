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
        this._loginInProgress = false;
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
     * @param {object} payload - the data entry from the WebSocket message
     * @param {object} [meta]  - the meta object from the WebSocket message (contains message type)
     */
    parseWebsocketMessage(payload, meta) {
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

        // device:sync is independent of subsystem — check separately so it is never
        // accidentally swallowed by the wlan/lan branches above
        if (meta && meta.message === 'device:sync' && payload.mac) {
            // Real-time switch status update — debug only to avoid log flooding (~30s cadence per switch)
            that.homey.app.debug(`[websocket] [device:sync]: mac=${payload.mac}`);

            // Update port up/down and PoE on/off state on the switch device itself
            let switchDriver;
            try {
                switchDriver = that.homey.drivers.getDriver('network-switch');
            } catch (e) { /* driver not yet initialised */ }
            if (switchDriver) {
                const switchDevice = switchDriver.getUnifiDeviceById(payload.mac);
                if (switchDevice) {
                    switchDevice.onStatusChange(payload);
                }
            }

            // Push live PoE wattage to any device powered by a port on this switch.
            // Covers cable-clients, access-points, and PoE-powered downstream switches —
            // all use PoePowerMixin and store _swMac/_swPort for exactly this lookup.
            if (payload.port_table) {
                for (const driverName of ['cable-client', 'access-point', 'network-switch']) {
                    let driver;
                    try {
                        driver = that.homey.drivers.getDriver(driverName);
                    } catch (e) { /* driver not yet initialised — skip */ continue; }
                    driver.getDevices().forEach(async device => {
                        if (device._swMac === payload.mac && device._swPort) {
                            const port = payload.port_table[device._swPort - 1];
                            if (port && port.port_poe && typeof port.poe_power !== 'undefined') {
                                if (typeof device._ensurePoeCapabilities === 'function') {
                                    await device._ensurePoeCapabilities(port);
                                }
                                device.onPoeUpdate(port);
                            }
                        }
                    });
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
        if (this.checkDevicesStateInterval) {
            this.homey.clearInterval(this.checkDevicesStateInterval);
            this.checkDevicesStateInterval = null;
        }
        if (this.updateAccessPointListInterval) {
            this.homey.clearInterval(this.updateAccessPointListInterval);
            this.updateAccessPointListInterval = null;
        }
        if (this.api && this.api.websocket) {
            this.api.websocket.destroy();
        }
        if (this.api && this.api.unifi) {
            try { await this.api.unifi.logout(); } catch (e) {}
        }
        delete this.api;
        delete this.accessPointList;
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
            this.homey.app.api.unifi.blockClient(args.Device.getData().id);
        });

        const wifiUnBlock = this.homey.flow.getActionCard('wifi_unblock');
        wifiUnBlock.registerRunListener(async (args, state) => {
            this.homey.app.api.unifi.unblockClient(args.Device.getData().id);
        });

        const cableBlock = this.homey.flow.getActionCard('cable_block');
        cableBlock.registerRunListener(async (args, state) => {
            this.homey.app.api.unifi.blockClient(args.Device.getData().id);
        });

        const cableUnBlock = this.homey.flow.getActionCard('cable_unblock');
        cableUnBlock.registerRunListener(async (args, state) => {
            this.homey.app.api.unifi.unblockClient(args.Device.getData().id);
        });

        const poePowerCycle = this.homey.flow.getActionCard('network_switch_power_cycle_port');
        poePowerCycle.registerRunListener(async (args, state) => {
            this.debug(`Power cycling port ${args.port} on device ${args.device.getData().id}`);
            this.homey.app.api.powerCycleDevice(args.device.getData().id, args.port).catch(this.error);
        });
        const poePowerOff = this.homey.flow.getActionCard('network_switch_power_off_port');
        poePowerOff.registerRunListener(async (args, state) => {
            this.debug(`Power off port ${args.port} on device ${args.device.getData().id}`);
            this.homey.app.api.powerOffDevice(args.device.getData().id, args.port).catch(this.error);
        });
        const poePowerOn = this.homey.flow.getActionCard('network_switch_power_on_port');
        poePowerOn.registerRunListener(async (args, state) => {
            this.debug(`Power on port ${args.port} on device ${args.device.getData().id}`);
            this.homey.app.api.powerOnDevice(args.device.getData().id, args.port).catch(this.error);
        });

        // [{"authorized_by":"none","ap_mac":null,"is_returning":false,"roam_count":0,"ip":"192.168.25.213","start":1761638072,"channel":0,"mac":"4e:9e:45:cf:a7:53","radio":null,"duration":522,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1072749,"site_id":"6550cbaad28ec670541702d5","rx_bytes":209774,"end":1761666872,"_id":"690076b8e38abd4579dccfde","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":862975,"expired":true}]
        // [{"authorized_by":"none","ap_mac":null,"is_returning":false,"roam_count":0,"ip":"192.168.25.213","start":1761638072,"channel":0,"mac":"4e:9e:45:cf:a7:53","radio":null,"duration":522,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1072749,"site_id":"6550cbaad28ec670541702d5","rx_bytes":209774,"end":1761666872,"_id":"690076b8e38abd4579dccfde","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":862975,"expired":true}]
        // [{"authorized_by":"none","hostname":"iPhone","ap_mac":"0c:ea:14:cd:80:13","is_returning":true,"user_id":"6900765fe38abd4579dccfc8","site_id":"6550cbaad28ec670541702d5","start":1761736094,"end":1761764894,"_id":"6901f59ee38abd4579dd5e06","mac":"4e:9e:45:cf:a7:53","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","expired":false,"tx_bytes":26331,"rx_bytes":41517,"bytes":0},{"authorized_by":"none","ap_mac":null,"is_returning":false,"roam_count":0,"ip":"192.168.25.213","start":1761638072,"channel":0,"mac":"4e:9e:45:cf:a7:53","radio":null,"duration":522,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1072749,"site_id":"6550cbaad28ec670541702d5","rx_bytes":209774,"end":1761666872,"_id":"690076b8e38abd4579dccfde","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":862975,"expired":true}]
        // [{"authorized_by":"none","ap_mac":"d0:21:f9:87:4e:9d","is_returning":true,"roam_count":0,"ip":"192.168.25.213","start":1761736094,"channel":44,"mac":"4e:9e:45:cf:a7:53","radio":"na","duration":146,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1349575,"site_id":"6550cbaad28ec670541702d5","rx_bytes":330815,"end":1761764894,"_id":"6901f59ee38abd4579dd5e06","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":1018760,"expired":false},{"authorized_by":"none","ap_mac":null,"is_returning":false,"roam_count":0,"ip":"192.168.25.213","start":1761638072,"channel":0,"mac":"4e:9e:45:cf:a7:53","radio":null,"duration":522,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1072749,"site_id":"6550cbaad28ec670541702d5","rx_bytes":209774,"end":1761666872,"_id":"690076b8e38abd4579dccfde","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":862975,"expired":true}
        const areThereGuests = this.homey.flow.getConditionCard('guests_connected');
        areThereGuests.registerRunListener(async (args, state) => {
            const devices = await this.homey.app.api.unifi.getUsers();
            const guestClients = devices.filter(function(record){
                return record.is_guest === true;
            });
            this.debug(`Guests connected: ${JSON.stringify(guestClients)}`);
            return guestClients.length > 0;
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
                    } else {
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
        if (this._loginInProgress) {
            this.debug('Login already in progress, skipping concurrent call');
            return;
        }
        this._loginInProgress = true;
        try {
            this.debug('Logging in...');

            // Get Settings object
            const settings = this.homey.settings.get(UnifiConstants.SETTINGS_KEY);
            if (!settings) {
                this.debug('Settings are not set.');
                return;
            }

            if (this.loggedIn) {
                this.loggedIn = false;
                try {
                    await this.api.unifi.logout();
                } catch (e) {
                    this.error(`[_appLogin] logout failed: ${e.message || e}`);
                }
            }

            this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, 'Connecting');
            this.api.setUnifiObject(settings.host, settings.port, settings.user, settings.pass, settings.site);

            await (async () => {
                try {
                    // LOGIN
                    await this.api.unifi.login(settings.user, settings.pass);
                    this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, 'Connected');
                    await this.setLoggedIn(true);
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
                        }).catch(
                            (error) => {
                                this.debug(`WebSocket error: ${JSON.stringify(error)}`);
                            }
                        );
                    }
                } catch (error) {
                    await this.setLoggedIn(false);
                    this.error(`${JSON.stringify(error)}`); // we want to see the error in the log
                }
            })();
        } finally {
            this._loginInProgress = false;
        }
    }

    async refreshAuthTokens() {
        const refreshAuthTokens = this.homey.setInterval(async () => {
            try {
                this.debug('Refreshing auth tokens');
                await this._appLogin();
            } catch (error) {
                this.homey.error(`[refreshAuthTokens] ${error.message || error}`);
            }
        }, this._refreshAuthTokensnterval);
    }

    // {"user":"82:74:71:f9:15:25","ssid":"MonkeySoft","hostname":"2001-1c04-352c-6900-4990-fde6-f18d-3d8f.cable.dynamic.v6.ziggo.nl","ap":"d0:21:f9:89:df:f9","duration":1058,"bytes":2527451,"ap_model":"UAP6MP","ap_name":"BenedenAP","ap_displayName":"BenedenAP","key":"EVT_WU_Disconnected","subsystem":"wlan","is_negative":false,"site_id":"6550cbaad28ec670541702d5","time":1761598537000,"datetime":"2025-10-27T20:55:37Z","msg":"User[82:74:71:f9:15:25] disconnected from \"MonkeySoft\" (17m 38s connected, 2.41M bytes, last AP[d0:21:f9:89:df:f9])"}

    // {"user":"ea:5b:28:b2:00:b5","ssid":"Ziggo6322902","ap":"d0:21:f9:89:df:f9","radio":"na","channel":"40","channelWidth":"80","hostname":"iPhone","ap_model":"UAP6MP","ap_name":"BenedenAP","ap_displayName":"BenedenAP","key":"EVT_WU_Connected","subsystem":"wlan","is_negative":false,"site_id":"6550cbaad28ec670541702d5","time":1761598567827,"datetime":"2025-10-27T20:56:07Z","msg":"User[ea:5b:28:b2:00:b5] has connected to AP[d0:21:f9:89:df:f9] with SSID \"Ziggo6322902\" on \"channel 40(na)\""

    onIsConnected(isConnected, payload) {
        const deviceName = this.homey.app.api.getDeviceName(payload);
        this.debug(`Device ${deviceName} (${payload.user}) is ${isConnected ? 'connected' : 'disconnected'}`);
        if (isConnected) {
            const device = this.api.getDeviceByMac(payload.user);
            const tokens = {
                mac: (payload.user === null || typeof payload.user === 'undefined') ? "" : payload.user,
                name: (deviceName === null || typeof deviceName === 'undefined') ? "" : deviceName,
                essid: (payload.ssid === null || typeof payload.ssid === 'undefined') ? "" : payload.ssid,
                ipAddress: (device.last_ip === null || typeof device.last_ip === 'undefined') ? "" : device.last_ip,
            };

            this.homey.app._clientConnected.trigger(tokens);

        } else {
            const device = this.api.getDeviceByMac(payload.user);
            const tokens = {
                mac: (payload.user === null || typeof payload.user === 'undefined') ? "" : payload.user,
                name: (deviceName === null || typeof deviceName === 'undefined') ? "" : deviceName,
                essid: (payload.ssid === null || typeof payload.ssid === 'undefined') ? "" : payload.ssid,
                ipAddress: (device.last_ip === null || typeof device.last_ip === 'undefined') ? "" : device.last_ip,
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
        const localTime = new Date(homeyTime.toLocaleString('en-US', {timeZone: tz}));
        return localTime;
    }

    gcManual() {
        setFlagsFromString('--expose_gc');
        const gc = runInNewContext('gc'); // nocommit
        gc();
    }
}

module.exports = UnifiNetwork;
