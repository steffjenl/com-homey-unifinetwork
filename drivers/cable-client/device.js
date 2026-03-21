'use strict';

const {Device} = require('homey');
const PoePowerMixin = require('../../library/poe-power-mixin');

class CableDevice extends PoePowerMixin(Device) {

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        await this.initPoeMeter(); // restore kWh total from store (from PoePowerMixin)
        await this._createMissingCapabilities();
        this.getDeviceStatus();

        this.registerCapabilityListener("blocked", async (value) => {
            this.homey.app.debug(`${JSON.stringify(value)}`);
            if (value) {
                this.homey.app.api.unifi.blockClient(this.getData().id);
                return;
            }
            this.homey.app.api.unifi.unblockClient(this.getData().id);
        });

        this.log('CableDevice has been initialized');
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log('CableDevice has been added');
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({oldSettings, newSettings, changedKeys}) {
        this.log('CableDevice settings where changed');
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name) {
        this.log('CableDevice was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.destroyPoeMeter();
        this.log('CableDevice has been deleted');
    }

    async _createMissingCapabilities() {
        if (this.getClass() !== 'sensor') {
            this.homey.app.debug(`changed class to sensor for ${this.getName()}`);
            this.setClass('sensor').catch(this.error);
        }

        if (this.hasCapability('wifi_name')) {
            this.removeCapability('wifi_name').catch(this.error);
            this.homey.app.debug(`removed capability wifi_name for ${this.getName()}`);
        }

        if (this.hasCapability('ap_mac')) {
            this.removeCapability('ap_mac').catch(this.error);
            this.homey.app.debug(`removed capability ap_mac for ${this.getName()}`);
        }

        if (!this.hasCapability('ipAddress')) {
            this.addCapability('ipAddress').catch(this.error);
            this.homey.app.debug(`created capability ipAddress for ${this.getName()}`);
        }

        if (!this.hasCapability('connected')) {
            this.addCapability('connected').catch(this.error);
            this.homey.app.debug(`created capability connected for ${this.getName()}`);
        }

        if (this.hasCapability('alarm_connected')) {
            this.removeCapability('alarm_connected');
            this.homey.app.debug(`deleted capability alarm_connected for ${this.getName()}`);
        }

        if (this.hasCapability('onoff')) {
            this.removeCapability('onoff').catch(this.error);
            this.homey.app.debug(`deleted capability onoff for ${this.getName()}`);
        }

        if (!this.hasCapability('blocked')) {
            this.addCapability('blocked').catch(this.error);
            this.homey.app.debug(`created blocked connected for ${this.getName()}`);
        }
    }

    onIsConnected(isConnected) {
        let deviceState = this.getState();

        if (this.hasCapability('connected')) {
            this.setCapabilityValue('connected', isConnected).catch(this.error);
        }

        if (deviceState.connected !== isConnected) {
            if (isConnected) {
                this.homey.app._cableClientConnected.trigger(this, {}, {}).catch(this.homey.app.debug);
            } else {
                this.homey.app._cableClientDisconnected.trigger(this, {}, {}).catch(this.homey.app.debug);
            }
        }
    }

    onIPChange(data) {
        if (this.hasCapability('ipAddress')) {
            this.setCapabilityValue('ipAddress', data.ip).catch(this.error);
        }
    }

    getDeviceStatus() {
        if (this.homey.app.loggedIn === true) {
            this.homey.app.api.unifi.getClientDevice(this.getData().id).then(device => {
                if (typeof device[0].ip !== 'undefined') {
                    this.onIPChange(device[0]);
                }

                if (typeof device[0].blocked !== 'undefined') {
                    this.onBlockedChange(device[0]);
                }

                // Normalise uplink fields and seed initial PoE readings (from PoePowerMixin)
                this.updatePoeUplink(device[0]);
                if (this._swMac && this._swPort) {
                    this._fetchPoeData(this._swMac, this._swPort);
                }
            }).catch(error => this.homey.app.debug(error));
        }
    }

    // _fetchPoeData, _ensurePoeCapabilities, onPoeUpdate all live in PoePowerMixin

    onBlockedChange(data) {
        if (this.hasCapability('blocked')) {
            this.setCapabilityValue('blocked', data.blocked).catch(this.error);
        }
    }

    onUpdateMessagePayload(playloadMessage) {
        if (typeof playloadMessage.ip !== 'undefined') {
            this.onIPChange(playloadMessage);
        }

        if (typeof playloadMessage.blocked !== 'undefined') {
            this.onBlockedChange(playloadMessage);
        }

        // Keep uplink info up to date — used by device:sync handler for real-time power pushes
        this.updatePoeUplink(playloadMessage);
    }
}

module.exports = CableDevice;
