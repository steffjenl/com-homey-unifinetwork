'use strict';

const Homey = require('homey');
const ApiClient = require('./library/apiclient');
const UnifiConstants = require('./library/constants');
const {formatForLog} = require('./library/sanitise');
const ErrorHandler = require('./library/error-handler');

class UnifiNetwork extends Homey.App {
    /**
     * onInit is called when the app is initialized.
     */
    async onInit() {
        this.api = new ApiClient({homey: this.homey});
        this.loggedIn = false;
        this._loginInProgress = false;
        this.accessPointList = {};

        this.checkDevicesStateInterval = null;
        this.updateAccessPointListInterval = null;

        this._recentEventIds = new Set();
        this.onUninit = this.onUninit.bind(this);

        this._refreshAuthTokensnterval = 60 * 60 * 1000; // 1 hour


        // Get Settings object
        this.settings = this.homey.settings.get(UnifiConstants.SETTINGS_KEY);
        if (!this.settings) {
            this.debug('Settings are not set.');
        }

        this._migrateSettings();

        await this._initFlowTriggers();
        await this._initActionCards();

        // Clear dedup event Set every 60 s to avoid unbounded growth
        this.homey.setInterval(() => {
            this._recentEventIds.clear();
        }, 60 * 1000);

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

        // Ignore non-event payloads (no key field) — these are stats syncs, not events
        if (!payload.key) return;

        // Deduplication guard — skip events already processed within the last 60 s
        const dedupKey = `${payload.key}_${payload.user ?? payload.client ?? ''}_${payload.time ?? ''}`;
        if (this._recentEventIds.has(dedupKey)) {
            this.debug(`[dedup] Skipping duplicate event: ${dedupKey}`);
            return;
        }
        this._recentEventIds.add(dedupKey);

        // start application flow cards
        // created a setting because this function has memory overload on Homey
        if (that.settings && "applicationFlows" in that.settings && that.settings.applicationFlows === "1") {
            if (payload.key === 'EVT_WU_Disconnected') {
                that.homey.log(`EVT_WU_Disconnected : ${formatForLog(payload)}`);
                that.onIsConnected(false, payload);
                return;
            } else if (payload.key === 'EVT_WU_Connected') {
                that.homey.log(`EVT_WU_Connected : ${formatForLog(payload)}`);
                that.onIsConnected(true, payload);
                return;
            }
        }

        // WAN up/down events (subsystem: wan)
        if (payload.subsystem === 'wan') {
            if (payload.key === 'EVT_WAN_Up') {
                that.homey.log(`EVT_WAN_Up: ${formatForLog(payload)}`);
                that._wanUp.trigger({ wan_ip: payload.wan_ip || '' }).catch(that.homey.log);
            } else if (payload.key === 'EVT_WAN_Down') {
                that.homey.log(`EVT_WAN_Down: ${formatForLog(payload)}`);
                that._wanDown.trigger({}).catch(that.homey.log);
            }
            return;
        }

        // start device flow cards
        if (payload.subsystem === 'wlan') {            that.homey.log(`[websocket] [wlan]: ${formatForLog(payload)}`);
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
                    that.homey.log(`[websocket] [wlan]: ${formatForLog(payload)}`);
                    const tokens = {
                        blocked: true,
                    }
                    device.onBlockedChange(tokens);
                } else if (payload.key === 'EVT_WC_Unblocked') {
                    that.homey.log(`[websocket] [wlan]: ${formatForLog(payload)}`);
                    const tokens = {
                        blocked: false,
                    }
                    device.onBlockedChange(tokens);
                }
            }
        } else if (payload.subsystem === 'lan') {
            that.homey.log(`[websocket] [cable]: ${formatForLog(payload)}`);
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
        } else if (payload.subsystem === 'ap') {
            that.homey.log(`[websocket] [ap]: ${formatForLog(payload)}`);
            const apMac = payload.ap || payload.device || payload.mac;
            if (apMac) {
                let apDriver;
                try { apDriver = that.homey.drivers.getDriver('access-point'); } catch (e) { /* not ready */ }
                if (apDriver) {
                    const apDevice = apDriver.getUnifiDeviceById(apMac);
                    if (apDevice) {
                        if (payload.key === 'EVT_AP_Connected') {
                            apDevice.onIsConnected(true);
                        } else if (payload.key === 'EVT_AP_Disconnected') {
                            apDevice.onIsConnected(false);
                        }
                    }
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

            // Push real-time state/client-count/uptime updates to access-point devices
            let apDriver;
            try { apDriver = that.homey.drivers.getDriver('access-point'); } catch (e) { /* not ready */ }
            if (apDriver) {
                const apDevice = apDriver.getUnifiDeviceById(payload.mac);
                if (apDevice) {
                    apDevice.onUpdateMessagePayload(payload);
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
    // eslint-disable-next-line no-unused-vars
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

    /**
     * Broadcast a user-friendly error message via realtime
     * @param {Error} error
     */
    _notifyError(error) {
        const parsed = ErrorHandler.parseError(error);
        this.homey.api.realtime(UnifiConstants.REALTIME_ERROR, {
            message: parsed.message,
            isAuthError: parsed.isAuthError,
            isTimeout: parsed.isTimeout,
            timestamp: new Date().toISOString(),
        });
    }

    async _initActionCards() {
        this.debug('UnifiNetwork init Action Cards');

        // WLAN toggle action (v2.6) — requires API key + UniFi OS 7+
        const toggleWlan = this.homey.flow.getActionCard(UnifiConstants.ACTION_TOGGLE_WLAN);
        toggleWlan.registerArgumentAutocompleteListener('wlan_id', async (query) => {
            try {
                const site = this.settings && this.settings.site ? this.settings.site : 'default';
                const response = await this.api._callV1('GET', `/sites/${site}/wifi/broadcasts`);
                const broadcasts = Array.isArray(response.data) ? response.data : (Array.isArray(response) ? response : []);
                return broadcasts
                    .filter(w => !query || w.name.toLowerCase().includes(query.toLowerCase()))
                    .map(w => ({ id: w.id, name: w.name, description: w.enabled ? 'Enabled' : 'Disabled' }));
            } catch (err) {
                this.error('toggle_wlan autocomplete error:', err.message);
                return [];
            }
        });

        toggleWlan.registerRunListener(async (args) => {
            try {
                const site = this.settings && this.settings.site ? this.settings.site : 'default';
                const enabled = args.enabled === 'true';
                await this.api._callV1('PATCH', `/sites/${site}/wifi/broadcasts/${args.wlan_id.id}`, { enabled });
                this.debug(`toggle_wlan: set ${args.wlan_id.name} enabled=${enabled}`);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[toggle_wlan] ${parsed.message}`);
                this._notifyError(error);
                if (parsed.isAuthError) {
                    await this._appLogin();
                }
                throw new Error(parsed.message);
            }
        });

        // Access-point restart action
        const apRestart = this.homey.flow.getActionCard(UnifiConstants.ACTION_ACCESS_POINT_RESTART);
        apRestart.registerRunListener(async (args) => {
            try {
                const site = this.settings && this.settings.site ? this.settings.site : 'default';
                const deviceMac = args.device.getData().id;
                // Resolve the device _id from the MAC via the UniFi API
                const devices = await this.api.unifi.getAccessDevices(deviceMac);
                const ap = devices.find(d => d.mac === deviceMac);
                if (!ap) throw new Error(`Access point ${deviceMac} not found`);
                await this.api.restartAccessPoint(ap._id, site);
                this.debug(`access_point_restart: restarted ${args.device.getName()} (${deviceMac})`);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[access_point_restart] ${parsed.message}`);
                this._notifyError(error);
                if (parsed.isAuthError) {
                    await this._appLogin();
                }
                throw new Error(parsed.message);
            }
        });
    }

    async _initFlowTriggers() {
        this._clientConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CLIENT_CONNECTED);
        this._clientDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CLIENT_DISCONNECTED);
        this._cableClientConnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_CABLE_CLIENT_CONNECTED);
        this._cableClientDisconnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_CABLE_CLIENT_DISCONNECTED);
        this._firstDeviceConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_CONNECTED);
        this._firstDeviceConnected.registerArgumentAutocompleteListener('accessPoint', async (query) => {
            let results = [];
            Object.values(this.accessPointList).forEach((accessPoint) => {
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
        this._lastDeviceDisconnected.registerArgumentAutocompleteListener('accessPoint', async (query) => {
            let results = [];
            Object.values(this.accessPointList).forEach((accessPoint) => {
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

        // WAN up/down triggers (v2.6)
        this._wanUp = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_WAN_UP);
        this._wanDown = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_WAN_DOWN);

        // Access-point device triggers
        this._accessPointConnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_ACCESS_POINT_CONNECTED);
        this._accessPointDisconnected = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_ACCESS_POINT_DISCONNECTED);
        this._accessPointClientCountChanged = this.homey.flow.getDeviceTriggerCard(UnifiConstants.EVENT_ACCESS_POINT_CLIENT_COUNT_CHANGED);

        const wifiBlock = this.homey.flow.getActionCard('wifi_block');
        wifiBlock.registerRunListener(async (args) => {
            try {
                await this.homey.app.api.unifi.blockClient(args.Device.getData().id);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[wifi_block] ${parsed.message}`);
                this.homey.app._notifyError(error);
                if (parsed.isAuthError) {
                    await this.homey.app._appLogin();
                }
                throw new Error(parsed.message);
            }
        });

        const wifiUnBlock = this.homey.flow.getActionCard('wifi_unblock');
        wifiUnBlock.registerRunListener(async (args) => {
            try {
                await this.homey.app.api.unifi.unblockClient(args.Device.getData().id);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[wifi_unblock] ${parsed.message}`);
                this.homey.app._notifyError(error);
                if (parsed.isAuthError) {
                    await this.homey.app._appLogin();
                }
                throw new Error(parsed.message);
            }
        });

        const cableBlock = this.homey.flow.getActionCard('cable_block');
        cableBlock.registerRunListener(async (args) => {
            try {
                await this.homey.app.api.unifi.blockClient(args.Device.getData().id);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[cable_block] ${parsed.message}`);
                this.homey.app._notifyError(error);
                if (parsed.isAuthError) {
                    await this.homey.app._appLogin();
                }
                throw new Error(parsed.message);
            }
        });

        const cableUnBlock = this.homey.flow.getActionCard('cable_unblock');
        cableUnBlock.registerRunListener(async (args) => {
            try {
                await this.homey.app.api.unifi.unblockClient(args.Device.getData().id);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[cable_unblock] ${parsed.message}`);
                this.homey.app._notifyError(error);
                if (parsed.isAuthError) {
                    await this.homey.app._appLogin();
                }
                throw new Error(parsed.message);
            }
        });

        const poePowerCycle = this.homey.flow.getActionCard('network_switch_power_cycle_port');
        poePowerCycle.registerRunListener(async (args) => {
            try {
                this.debug(`Power cycling port ${args.port} on device ${args.device.getData().id}`);
                await this.homey.app.api.powerCycleDevice(args.device.getData().id, args.port);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[power_cycle] ${parsed.message}`);
                this.homey.app._notifyError(error);
                if (parsed.isAuthError) {
                    await this.homey.app._appLogin();
                }
            }
        });

        const poePowerOff = this.homey.flow.getActionCard('network_switch_power_off_port');
        poePowerOff.registerRunListener(async (args) => {
            try {
                this.debug(`Power off port ${args.port} on device ${args.device.getData().id}`);
                await this.homey.app.api.powerOffDevice(args.device.getData().id, args.port);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[power_off] ${parsed.message}`);
                this.homey.app._notifyError(error);
                if (parsed.isAuthError) {
                    await this.homey.app._appLogin();
                }
            }
        });

        const poePowerOn = this.homey.flow.getActionCard('network_switch_power_on_port');
        poePowerOn.registerRunListener(async (args) => {
            try {
                this.debug(`Power on port ${args.port} on device ${args.device.getData().id}`);
                await this.homey.app.api.powerOnDevice(args.device.getData().id, args.port);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error);
                this.error(`[power_on] ${parsed.message}`);
                this.homey.app._notifyError(error);
                if (parsed.isAuthError) {
                    await this.homey.app._appLogin();
                }
            }
        });

        // [{"authorized_by":"none","ap_mac":null,"is_returning":false,"roam_count":0,"ip":"192.168.25.213","start":1761638072,"channel":0,"mac":"4e:9e:45:cf:a7:53","radio":null,"duration":522,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1072749,"site_id":"6550cbaad28ec670541702d5","rx_bytes":209774,"end":1761666872,"_id":"690076b8e38abd4579dccfde","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":862975,"expired":true}]
        // [{"authorized_by":"none","ap_mac":null,"is_returning":false,"roam_count":0,"ip":"192.168.25.213","start":1761638072,"channel":0,"mac":"4e:9e:45:cf:a7:53","radio":null,"duration":522,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1072749,"site_id":"6550cbaad28ec670541702d5","rx_bytes":209774,"end":1761666872,"_id":"690076b8e38abd4579dccfde","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":862975,"expired":true}]
        // [{"authorized_by":"none","hostname":"iPhone","ap_mac":"0c:ea:14:cd:80:13","is_returning":true,"user_id":"6900765fe38abd4579dccfc8","site_id":"6550cbaad28ec670541702d5","start":1761736094,"end":1761764894,"_id":"6901f59ee38abd4579dd5e06","mac":"4e:9e:45:cf:a7:53","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","expired":false,"tx_bytes":26331,"rx_bytes":41517,"bytes":0},{"authorized_by":"none","ap_mac":null,"is_returning":false,"roam_count":0,"ip":"192.168.25.213","start":1761638072,"channel":0,"mac":"4e:9e:45:cf:a7:53","radio":null,"duration":522,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1072749,"site_id":"6550cbaad28ec670541702d5","rx_bytes":209774,"end":1761666872,"_id":"690076b8e38abd4579dccfde","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":862975,"expired":true}]
        // [{"authorized_by":"none","ap_mac":"d0:21:f9:87:4e:9d","is_returning":true,"roam_count":0,"ip":"192.168.25.213","start":1761736094,"channel":44,"mac":"4e:9e:45:cf:a7:53","radio":"na","duration":146,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1349575,"site_id":"6550cbaad28ec670541702d5","rx_bytes":330815,"end":1761764894,"_id":"6901f59ee38abd4579dd5e06","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":1018760,"expired":false},{"authorized_by":"none","ap_mac":null,"is_returning":false,"roam_count":0,"ip":"192.168.25.213","start":1761638072,"channel":0,"mac":"4e:9e:45:cf:a7:53","radio":null,"duration":522,"hostname":"iPhone","user_id":"6900765fe38abd4579dccfc8","bytes":1072749,"site_id":"6550cbaad28ec670541702d5","rx_bytes":209774,"end":1761666872,"_id":"690076b8e38abd4579dccfde","user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148","tx_bytes":862975,"expired":true}
        const areThereGuests = this.homey.flow.getConditionCard('guests_connected');
        areThereGuests.registerRunListener(async () => {
            const devices = await this.homey.app.api.unifi.getUsers();
            const guestClients = devices.filter(function(record){
                return record.is_guest === true;
            });
            this.debug(`Guests connected: ${formatForLog(guestClients)}`);
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

        // update device status every x seconds (minimum 10 s)
        const rawInterval = this.settings && 'interval' in this.settings ? parseInt(this.settings.interval, 10) : 15;
        const intervalMs = Math.max(10, rawInterval) * 1000;
        this.checkDevicesStateInterval = this.homey.setInterval(this.checkDevicesState.bind(this), intervalMs);
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
                        if (Object.prototype.hasOwnProperty.call(this.accessPointList, accessPoint.mac)) return;
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
            const devicesWifi = this.homey.drivers.getDriver('wifi-client').getDevices();
            const devicesCable = this.homey.drivers.getDriver('cable-client').getDevices();

            // Single getClientDevices call — used for both device updates and per-AP client counting
            this.api.unifi.getClientDevices().then(clientDevices => {
                // Update all paired Wi-Fi client devices
                devicesWifi.forEach(device => {
                    const devicePayload = this.getDeviceFromArray(device.getData().id, clientDevices);
                    if (this.isDeviceInArray(device.getData().id, clientDevices)) {
                        this.homey.app.debug(`Interval Device ${device.getName()} is connected`);
                        device.onIsConnected(true, devicePayload.essid);
                        device.onUpdateMessagePayload(devicePayload);
                    } else {
                        this.homey.app.debug(`Interval Device ${device.getName()} is disconnected`);
                        device.onIsConnected(false, null);
                    }
                });

                // Update all paired cable client devices
                devicesCable.forEach(device => {
                    if (this.isDeviceInArray(device.getData().id, clientDevices)) {
                        device.onIsConnected(true);
                        device.onUpdateMessagePayload(this.getDeviceFromArray(device.getData().id, clientDevices));
                    } else {
                        device.onIsConnected(false);
                    }
                });

                // Update per-AP client counts from ALL connected UniFi clients (not just paired)
                // and fire first/last connected flow triggers if the count changed
                this.checkAccessPoints(clientDevices);
            }).catch((error) => {
                const parsed = ErrorHandler.parseError(error);
                if (parsed.isAuthError) {
                    this.homey.error(`[checkDevicesState]: AccessDenied - attempting re-login`);
                    this._appLogin();
                } else if (parsed.isTimeout) {
                    this.homey.app.debug(`[checkDevicesState]: Connection timeout`);
                } else {
                    this.homey.app.debug(`[checkDevicesState]: error when retrieving getClientDevices - ${parsed.message}`);
                }
            });

            // Poll all paired access-point devices for state/client-count/uptime
            let apDriver;
            try { apDriver = this.homey.drivers.getDriver('access-point'); } catch (e) { /* not ready */ }
            if (apDriver && apDriver.getDevices().length > 0) {
                this.api.unifi.getAccessDevices().then(apDevices => {
                    apDriver.getDevices().forEach(device => {
                        const apData = apDevices.find(d => d.mac === device.getData().id);
                        if (apData) {
                            device.onUpdateMessagePayload(apData);
                        } else {
                            device.onIsConnected(false);
                        }
                    });
                }).catch(err => {
                    const parsed = ErrorHandler.parseError(err);
                    if (parsed.isAuthError) {
                        this.homey.app.debug(`[checkDevicesState] AP poll: AuthError - attempting re-login`);
                        this._appLogin();
                    } else if (parsed.isTimeout) {
                        this.homey.app.debug(`[checkDevicesState] AP poll: Connection timeout`);
                    } else {
                        this.homey.app.debug(`[checkDevicesState] AP poll error: ${parsed.message}`);
                    }
                });
            }
        }
    }

    /**
     * One-shot migration: split the Network V2 (API key) host/port out from the
     * Network V1 (username/password) host/port, which it previously reused implicitly.
     * Existing installs get v2host/v2port defaulted from the legacy host/port so the
     * API key keeps working against the same controller until changed independently.
     */
    _migrateSettings() {
        if (!this.settings) return;
        if (this.settings.migrations && this.settings.migrations.v2HostSplit) return;

        if (!this.settings.v2host && this.settings.host) {
            this.settings.v2host = this.settings.host;
        }
        if (!this.settings.v2port && this.settings.port) {
            this.settings.v2port = this.settings.port;
        }
        this.settings.migrations = Object.assign({}, this.settings.migrations, {v2HostSplit: true});

        this.homey.settings.set(UnifiConstants.SETTINGS_KEY, this.settings);
        this.debug('Migrated settings: v2HostSplit');
    }

    /**
     * Network V1 (username/password) stack is logged in and usable.
     * @returns {boolean}
     */
    isV1Available() {
        return this.loggedIn === true && !!(this.api && this.api.unifi);
    }

    /**
     * Network V2 (API key) stack has a key configured.
     * @returns {boolean}
     */
    isV2Available() {
        return !!(this.api && this.api.hasApiKey());
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
            this.api.setUnifiObject(settings.host, settings.port, settings.user, settings.pass, settings.site, settings.sslverify === true);
            this.api.setApiKey(settings.apiKey || null, settings.v2host || settings.host, settings.v2port || settings.port);

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
                        this.api.setWebSocketObject(settings.host, settings.port, settings.user, settings.pass, settings.site, settings.sslverify === true);
                        this.api.websocket.listen().then((connected) => {
                            if (connected) {
                                this.debug('WebSocket is connected');
                            }
                        }).catch(
                            (error) => {
                                this.debug(`WebSocket error: ${formatForLog(error)}`);
                            }
                        );
                    }
                } catch (error) {
                    await this.setLoggedIn(false);
                    this.error(formatForLog(error)); // we want to see the error in the log
                }
            })();
        } finally {
            this._loginInProgress = false;
        }
    }

    async refreshAuthTokens() {
        this.homey.setInterval(async () => {
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
                this.homey.api.realtime(UnifiConstants.REALTIME_DEBUG, debugMessage);
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
            this.homey.error(`[checkNumClientsConnectedTrigger]: ${formatForLog(error)}`);
        }
    }

    checkAccessPoints(clientDevices) {
        let that = this;
        if (!that.accessPointList) return;
        const wifiDriver = that.homey.drivers.getDriver('wifi-client');

        for (const ap_mac in that.accessPointList) {
            let num_clients = 0;

            if (Array.isArray(clientDevices)) {
                // Count ALL connected UniFi clients per AP (not just paired Homey devices)
                clientDevices.forEach(client => {
                    if (client.ap_mac === ap_mac) num_clients += 1;
                });
            } else {
                // Fallback: count paired Homey wifi-client devices (old behaviour)
                wifiDriver.getDevices().forEach(device => {
                    if (device.getCapabilityValue('ap_mac') === ap_mac) num_clients += 1;
                });
            }

            const ap_name = that.getAccessPointName(ap_mac);
            that.homey.app.debug(`Accesspoint ${ap_name} (${ap_mac}) has ${num_clients} clients`);

            if (num_clients !== that.accessPointList[ap_mac].num_clients && that.accessPointList[ap_mac].num_clients !== null) {
                const tokens = {
                    accessPoint: that.getAccessPointName(ap_mac),
                    last_num: that.accessPointList[ap_mac].num_clients,
                    curr_num: num_clients,
                };

                if (tokens.last_num === 0 && tokens.curr_num > 0) {
                    that.homey.app.debug('Triggering first_device_connected with state', tokens);
                    that._firstDeviceConnected.trigger(tokens);
                }
                if (tokens.last_num > 0 && tokens.curr_num === 0) {
                    that.homey.app.debug('Triggering last_device_disconnected with state', tokens);
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
        return new Date(homeyTime.toLocaleString('en-US', {timeZone: tz}));
    }
}

module.exports = UnifiNetwork;
