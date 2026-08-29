'use strict';

const {Driver} = require('homey');
const UnifiConstants = require("../../library/constants");
const Homey = require("homey");

class AccessPoint extends Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('Access-Point has been initialized');
    }

    /**
     * onPairListDevices is called when a user is adding a device
     * and the 'list_devices' view is called.
     * This should return an array with the data of devices that are available for pairing.
     */
    async onPairListDevices() {
        const noControllerConnectionError = this.homey.__('pair.errors.no_controller_connection');
        if (!this.homey.app.isV1Available()) {
            throw new Error(noControllerConnectionError);
        }

        try {
            return Object.values(await this.homey.app.api.getAccessPoints()).map(device => {
                let deviceName = this.homey.app.api.getDeviceName(device);

                return {
                    data: {id: String(device.mac)},
                    name: deviceName,
                };
            });
        } catch (error) {
            this.homey.app.error(`[access-point][pair] ${error.message || error}`);
            throw new Error(noControllerConnectionError);
        }
    }

    getUnifiDeviceById(deviceId) {
        try {
            const devices = this.getDevices();
            const device = devices.find(device => String(device.getData().id) === String(deviceId));
            if (!device) return false;
            return device;
        } catch (Error) {
            return false;
        }
    }
}

module.exports = AccessPoint;
