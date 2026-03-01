'use strict';

const {Device} = require('homey');
const PoePowerMixin = require('../../library/poe-power-mixin');

class AccessPointDevice extends PoePowerMixin(Device) {

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        await this.initPoeMeter(); // restore kWh total from store (from PoePowerMixin)
        await this.waitForBootstrap();
        this.log('Access-Point has been initialized');
    }

    async waitForBootstrap() {
        if (this.homey.app.loggedIn === true) {
            await this._createMissingCapabilities();
            await this.getDeviceStatus();
        } else {
            this.homey.setTimeout(this.waitForBootstrap.bind(this), 250);
        }
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log('Access-Point has been added');
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
        this.log('Access-Point settings where changed');
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name) {
        this.log('Access-Point was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.destroyPoeMeter();
        this.log('Access-Point has been deleted');
    }

    async _createMissingCapabilities() {
        if (this.getClass() !== 'sensor') {
            this.homey.app.debug(`changed class to sensor for ${this.getName()}`);
            this.setClass('sensor').catch(this.error);
        }
    }

    getDeviceStatus() {
        if (this.homey.app.loggedIn === true) {
            this.homey.app.api.unifi.getAccessDevices(this.getData().id).then(device => {
                device = device.filter(obj => obj.adopted === true);
                device = device.filter(obj => obj.type === 'uap');
                device = device.filter(obj => obj.mac === this.getData().id);
                this.homey.log(JSON.stringify(device));

                if (device[0]) {
                    // Store uplink switch info and seed initial PoE readings (from PoePowerMixin)
                    // APs use uplink.uplink_mac / uplink.uplink_remote_port
                    this.updatePoeUplink(device[0]);
                    if (this._swMac && this._swPort) {
                        this._fetchPoeData(this._swMac, this._swPort);
                    }
                }
            }).catch(error => this.homey.app.debug(error));
        }
    }

    onUpdateMessagePayload(playloadMessage) {
        if (typeof playloadMessage.ip !== 'undefined') {
            this.onIPChange(playloadMessage);
        }

        // Keep uplink info up to date for real-time device:sync power pushes
        this.updatePoeUplink(playloadMessage);
    }
}

module.exports = AccessPointDevice;
