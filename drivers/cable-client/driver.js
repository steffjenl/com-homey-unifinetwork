"use strict";

const Homey = require('homey');
const Settings = Homey.ManagerSettings;
const API = Homey.ManagerApi;
const Unifi = require('ubnt-unifi');

const url = require('url');
const tough = require('tough-cookie')

const CookieJar = tough.CookieJar

const _settingsKey = 'com.ubnt.unifi.settings'
const _statusKey = 'com.ubnt.unifi.status'

const _states = {
    'initializing': 'Initializing driver',
    'initialized': 'initialized',
    'connecting': 'Connecting',
    'connected': 'Connected',
    'disconnected': 'Disconnected',
}

class UnifiDriver extends Homey.Driver {
    onInit() {
        this.initialized = false;

        this.setStatus(_states['initializing']);

        this.getSettings(_settingsKey);

        this.accessPointList = {};
        this.onlineClientList = {};
        this.numClientsOnline = -1;
        this.usergroupList = {};
        this.pollIntervals = [];

        this.setStatus(_states['initialized']);

        this.connected = false;
        this.unifi = null;

        this.flowCards = {};
        this.flowsWithArguments = {
            'first_device_connected': ['accessPoint'],
            'last_device_disconnected': ['accessPoint']
        }

        // this.ready(this.initialize);
        this._initialize();
        this.initialized = true;

        this.firstPollDone = false;
    }

    _initialize() {
        // Intialization is done, start the pollers.
        this.log('initialize pollers');
        setTimeout(function() {
            this._registerFlows();
            this.initializeConnection();
        }.bind(this), 100);

        // One poller for initializing the connection every 60 seconds (if needed)
        this.pollIntervals.push(setInterval(() => {
            this.initializeConnection();
        }, 60 * 1000));

        // Start a poller, to check the device status every 15 secs.
        this.pollIntervals.push(setInterval(() => {
            if (!this.connected) return;
            this.updateClientList();
        }, 15 * 1000));

        // Start a poller, to check the device status every 12 hrs.
        this.pollIntervals.push(setInterval(() => {
            if (!this.connected) return this._debug('There is no connection yet, please check your settings!');
            this._debug('Polling AP\'s (once every 12 hrs)');
        }, (12 * 3600 * 1000)))
    }

    initializeConnection() {
        this.log('initializeConnection called');
        if (this.connected || !this.driverSettings) return;

        this._debug('Connecting to unifi controller', this.driverSettings['host']);
        this.setStatus(_states['connecting'])

        if (this.unifi !== null) {
            // Update to possibly new settings
            this._debug('Updating unifi connection params.')
            this.disconnect();
            this.connected = false;
            this.unifi = null;
        };

        this.unifi = new Unifi({
            host: this.driverSettings['host'],
            port: this.driverSettings['port'],
            username: this.driverSettings['user'],
            password: this.driverSettings['pass'],
            site: this.driverSettings['site'],
            insecure: true,
            unifios: (this.driverSettings['useproxy'] === 'true')
        });

        if (this.driverSettings['useproxy'] !== 'true') {
             // Monkeypatch the _url method.
             this.unifi._url = function(path) {
                 if (path.indexOf('/') === 0) {
                     return this.controller.href + path.substring(1);
                 }
                 return `${this.controller.href}api/s/${this.opts.site}/${path}`;
             }
        }

        this.unifi.on('ctrl.connect', () => {
            this._debug('Connection success!');
            this.connected = true;
            this.setStatus(_states['connected']);
            this.updateClientList();
        });

        // Bind on disconnect events
        this.unifi.on('ctrl.disconnect', () => {
            this._debug('Connection to controller lost!');
            this.setState(_states['disconnected']);
            this.connected = false;
        });

        let that = this;  // make reference to driver
        this.unifi.on('**', function(data) {
            that.log('EVENT:', this.event, data);
        });
        this.unifi.on('ctrl.error', data => {
            that._debug('Error: ', data.error, data);
            that.disconnect(); // The regular interval will reconnect.
        });
        this.unifi.on('wu.*', function(data) {
            that.getDevices().forEach(device => {
                if (data.user == device.getData().id) {
                    device.triggerEvent(this.event, data);
                    that.checkNumClientsConnectedTrigger();  // check if this is the first online device.
                }
            });
        });
    }

    disconnect() {
        this.log('disconnect initialized');
        if (this.connected) {
            this.connected = false;
        }
        if (this.unifi) {
            this.unifi.close();
        }
        this.setStatus(_states['disconnected']);
    }

    _registerFlow(keys, cls) {
        keys.forEach(key => {
            this._debug(`- flow ${key}`);
            this.flowCards[key] = new cls(key).register();
        });
    }
    _registerFlows() {
        this._debug('Registering flows');

        // Register normal triggers
        let triggers = [
            'a_client_connected',
            'a_client_disconnected',
            'a_guest_connected',
            'a_guest_disconnected',
            'first_device_connected',
            'last_device_disconnected',
            'first_device_online',
            'last_device_offline'
        ];
        this._registerFlow(triggers, Homey.FlowCardTrigger);

        // Register device triggers
        triggers = [

        ];
        this._registerFlow(triggers, Homey.FlowCardTriggerDevice);

        // Register conditions
        triggers = [

        ];
        triggers.forEach(key => {
            this._debug(`- flow condition.${key}`);
            this.flowCards[`condition.${key}`] = new Homey.FlowCardCondition(key).register();
        });

        for (var flow in this.flowsWithArguments) {
            this.flowsWithArguments[flow].forEach(arg => {
                this.log(`- Registering autocomplete ${arg} for flow ${flow}`);
                this.flowCards[flow]
                    .getArgument(arg)
                    .registerAutocompleteListener((query, args) => {
                        let devices = [];
                        devices.sort((a,b) => { return a.name > b.name; })
                        return Promise.resolve(devices);
                    })
            });

            // Condition flows are handled separately
            if (flow.indexOf('condition.') !== -1) continue;

            this.log('- Registering runListener for', flow);
            this.flowCards[flow]
                .registerRunListener(( args, state, callback) => {
                    this._debug(`${flow} has been triggered`);

                    if (args.accessPoint.id === state.ap_mac) {
                        return Promise.resolve(true);
                    }
                    return Promise.resolve(false);
                })
        }
    }

    triggerFlow(flow, tokens, device) {
        this._debug(`Triggering flow ${flow} with tokens`, tokens);
        // this.log(this.flowCards[flow])
        if (this.flowCards[flow] instanceof Homey.FlowCardTriggerDevice) {
            this._debug('- device trigger for ', device.getName());
            this.flowCards[flow].trigger(device, tokens, device.state);
        }
        else if (this.flowCards[flow] instanceof Homey.FlowCardTrigger) {
            this._debug('- regular trigger');
            this.flowCards[flow].trigger(tokens);
        }
    }

    sendDeviceUpdates() {
        // Validate information in this.onlineClientList
        // and update our devices based on that.
        this.getDevices().forEach(device => {
            let deviceId = device.getData().id;

            if (this.onlineClientList.hasOwnProperty(deviceId)) {
                return device.updateOnlineState(this.onlineClientList[deviceId]);
            }
            device.setOffline();
        });

        this.checkNumClientsConnectedTrigger();
    }

    checkNumClientsConnectedTrigger() {
        let onlineDeviceCount = 0;
        let deviceName = '';
        this.getDevices().forEach(device => {
            if (device.isOnline()) {
                onlineDeviceCount++;
                deviceName = device.getName();
            }
        });

        this._debug('Checking for *_device_o(n|ff)line')
        // Check if we need to trigger online/offline state.
        let tokens = {};
        let trigger = '';
        if (this.numClientsOnline == 0 && onlineDeviceCount > 0) {
            trigger = 'first_device_online'
            tokens.name = deviceName;
        }
        if (this.numClientsOnline > 0 && onlineDeviceCount == 0) {
            trigger = 'last_device_offline'
        }
        if (trigger) this.triggerFlow(trigger, tokens);
        this._debug(`Clients connected: before:${this.numClientsOnline}, now:${onlineDeviceCount} - ${trigger}`);

        this.numClientsOnline = onlineDeviceCount;
    }


    checkGuestTriggers(newDeviceList) {
        if (!this.firstPollDone) return;

        let knownDeviceIds = new Set();
        this.getDevices().forEach(device => {
            knownDeviceIds.add(device.getData().id);
        })
        for (var deviceId in newDeviceList) {
            if (knownDeviceIds.has(deviceId) || this.onlineClientList.hasOwnProperty(deviceId)) continue;

            // A unknown (to Homey) client has connected
            let tokens = {
                mac: deviceId,
                name: newDeviceList[deviceId].name
            }
            this.triggerFlow('a_guest_connected', tokens);
        }

        // Figure out if guests disconnected
        let oldOnlineClientIds = new Set(Object.keys(this.onlineClientList));
        let newOnlineClientIds = new Set(Object.keys(newDeviceList));
        let disconnected_guests = oldOnlineClientIds.difference(newOnlineClientIds);
        this.log('Disconnected guests:', disconnected_guests);

        if (!disconnected_guests) return;
        disconnected_guests.forEach(deviceId => {
            if (knownDeviceIds.has(deviceId)) return;

            // A unknown (to Homey) client has disconnected
            let tokens = {
                mac: deviceId,
                name: this.onlineClientList[deviceId].name
            }
            this.triggerFlow('a_guest_disconnected', tokens);
        })
    }

    updateClientList () {
        this.log('updateClientList called');
        this.unifi.get('stat/sta').then(res => {
            let devices = {}
            res.data.forEach(client => {
                if (!client.is_wired) return;
                this._debug(`Got client back ${client.name}/${client.hostname} with mac ${client.mac}`)

                let name = client.name
                if (typeof name === 'undefined' && typeof client.hostname !== 'undefined') name = client.hostname;
                if (typeof name === 'undefined') name = client.mac;
                let signal = Math.min(45, Math.max(parseFloat(client.rssi), 5));
                signal = (signal - 5) / 40 * 99;

                let rssi = parseFloat(client.rssi) - 95;

                devices[client.mac] = {
                    'name': name
                };
            });

            this.checkGuestTriggers(devices);
            this.onlineClientList = devices;

            this.sendDeviceUpdates();
            this.updateLastPoll();

            // Update firstPollDone, as we successfully received devices
            this.firstPollDone = true;
        })
        .catch(err => {
            this._debug('Error while fetching client list:');
            this._debug(err);
            this.disconnect();
        });
    }

    // this is the easiest method to overwrite, when only the template 'Drivers-Pairing-System-Views' is being used.
    onPairListDevices( data, callback ) {
        let devices = [];
        for (var id in this.onlineClientList) {
            devices.push({
                name: this.onlineClientList[id]['name'],
                data: {
                    id: id,
                }
            })
        }

        let done = () => {
            if (devices.length == 0) {
                callback({
                    'en': 'No clients were found, please check your credentials and/or controller',
                    'nl': 'Er zijn nog geen kabel clients gedetecteerd, controlleer login gegevens en/of controller.'
                }, null);
            }

            callback(null, devices);
        };

        if (!this.unifi) {
            done();
            return;
        }

        // For pairing, also get all known wifi devices
        this.unifi.get('stat/alluser?within=24')
            .then( res => {
                res.data.forEach(client => {
                    if (!client.is_wired || typeof this.onlineClientList[ client.mac ] !== 'undefined' ) return;
                    this._debug(`Got offline cable-client back ${client.name}/${client.hostname} with mac ${client.mac}`)

                    let name = client.name
                    if (typeof name === 'undefined') name = client.hostname;

                    devices.push({
                        name: name,
                        data: {
                            id: client.mac,
                        }
                    });
                });
                done();
            })
            .catch(err => {
                this._debug("Error during getAllUser", err);
                done();
            });
    }

    getSettings(key) {
        if (key != _settingsKey) return;
        this.log('Getting settings for key', key);

        this.driverSettings = Settings.get(_settingsKey);
        // this._debug('Received new settings:', this.driverSettings);

        if (!this.initialized) return;

        setTimeout(function() {
            this.disconnect();
            this.initializeConnection();
        }.bind(this), 100);
    }

    setStatus(status) {
        this._debug(`Updating status to ${status}`);
        Settings.set(_statusKey, status);
        API.realtime(_statusKey, status);
    }

    updateLastPoll() {
        API.realtime('com.ubnt.unifi.lastPoll', { lastPoll: Date.now() });
    }

    /**
     * Debug method that will enable logging when
     * debug: true is provided in the main options
     * object.
     * @private
     */
    _debug() {
        const args = Array.prototype.slice.call(arguments);
        args.unshift('[debug]');
        API.realtime('com.ubnt.unifi.debug', args.join(' '));
        this.log.apply(null, args);
    }
}

Set.prototype.difference = function(setB) {
    var difference = new Set(this);
    for (var elem of setB) {
        difference.delete(elem);
    }
    return difference;
}

module.exports = UnifiDriver;
