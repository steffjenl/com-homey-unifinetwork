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

        await this._initFlowTriggers();

        /*

        const _actionTakeSnapshot = this.homey.flow.getActionCard(UfvConstants.ACTION_TAKE_SNAPSHOT);
        _actionTakeSnapshot.registerRunListener(async (args, state) => {
            if (typeof args.device.getData === 'function' && typeof args.device.getData().id !== 'undefined') {
                // Get device from camera id
                const device = args.device.driver.getUnifiDeviceById(args.device.getData().id);
                if (device) {
                    device._createSnapshotImage(true);
                }
            }
            return Promise.resolve(true);
        });


         */

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

        this.debug('UniFiProtect has been initialized');
    }

    async _initFlowTriggers() {
        this._clientConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CLIENT_CONNECTED);
        this._clientDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CLIENT_DISCONNECTED);
        this._cableClientConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CABLE_CLIENT_CONNECTED);
        this._cableClientDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_CABLE_CLIENT_DISCONNECTED);
        this._firstDeviceConnected= this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_CONNECTED);
        this._firstDeviceOnline = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_FIRST_DEVICE_ONLINE);
        this._lastDeviceOffline = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_LAST_DEVICE_OFFLINE);
        this._lastDeviceDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_LAST_DEVICE_DISCONNECTED);
        this._guestDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_GUEST_DISCONNECTED);
        this._guestConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_GUEST_CONNECTED);
        this._wifiClientRoamed = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_ROAMED);
        this._wifiClientDisconnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_DISCONNECTED);
        this._wifiClientConnected = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED);
        this._wifiClientRoamedToAp = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_ROAMED_TO_AP);
        this._wifiClientSignalChanged = this.homey.flow.getTriggerCard(UnifiConstants.EVENT_WIFI_CLIENT_SIGNAL_CHANGED);
    }

    _appLogin() {
        this.debug('Logging in...');

        // Get Settings object
        const settings = this.homey.settings.get(UnifiConstants.SETTINGS_KEY);
        if (!settings) {
            this.debug('Settings are not set.');
            return;
        }

        this.api.setUnifiObject(settings.host, settings.port, settings.user, settings.pass, settings.site);

        (async () => {
            try {
                // LOGIN
                this.loggedIn = await this.api.unifi.login(settings.user, settings.pass);
                if (this.loggedIn) {
                    this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, 'Connected');
                    this.setLoggedIn(true);
                    this.debug('We are logged in!');

                    // LISTEN for WebSocket events
                    const isListening = await this.api.unifi.listen();

                    if (isListening) {
                        this.homey.api.realtime(UnifiConstants.REALTIME_WEBSOCKET, 'Connected');
                        this.debug('We are listening!');

                        const homey = this.homey;

                        this.api.unifi.on('sta:sync.generic', function (payload) {
                            if (Array.isArray(payload)) {
                                if (payload[0].subsystem === 'wlan') {
                                    // get wifi-client driver
                                    const driver = homey.drivers.getDriver('wifi-client');
                                    const device = driver.getUnifiDeviceById(payload[0].user);
                                    if (device) {
                                        // Parse Websocket payload message
                                        driver.onParseWebsocketMessage(device, payload);
                                    }
                                } else if (payload[0].subsystem === 'lan') {
                                    // get cable-client driver
                                    const driver = homey.drivers.getDriver('cable-client');
                                    const device = driver.getUnifiDeviceById(payload[0].user);
                                    if (device) {
                                        // Parse Websocket payload message
                                        driver.onParseWebsocketMessage(device, payload);
                                    }
                                }
                            }
                        });

                        // Listen for disconnected and connected events
                        this.api.unifi.on('events.*', function (payload) {
                            if (Array.isArray(payload)) {
                                if (payload[0].subsystem === 'wlan') {
                                    // get wifi-client driver
                                    const driver = homey.drivers.getDriver('wifi-client');
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
                                    const driver = homey.drivers.getDriver('cable-client');
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
                        });
                    }
                }

            } catch (error) {
                this.homey.api.realtime(UnifiConstants.REALTIME_STATUS, error);
                this.log('error = ' + error);
                this.setLoggedIn(false);
            }
        })();
    }

    async setLoggedIn(loggedIn) {
        this.loggedIn = loggedIn;
    }

    debug() {
        if (Homey.env.DEBUG === 'true') {
            const args = Array.prototype.slice.call(arguments);
            args.unshift('[debug]');
            this.homey.log(args.join(' '));
        }
    }
}

module.exports = UnifiNetwork;
