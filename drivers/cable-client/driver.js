'use strict';

const {Driver} = require('homey');
const UnifiConstants = require("../../library/constants");

class CableClient extends Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this._cableClientBlocked = this.homey.flow.getConditionCard(UnifiConstants.EVENT_CABLE_CLIENT_BLOCKED);

        this._cableClientBlocked.registerRunListener(async (args, state) => {
            const clientBlocked = args.Device.getCapabilityValue('blocked');
            return Promise.resolve(clientBlocked);
        });
        this.log('Cable-Client has been initialized');
    }

    /**
     * onPairListDevices is called when a user is adding a device
     * and the 'list_devices' view is called.
     * This should return an array with the data of devices that are available for pairing.
     */
    async onPairListDevices() {
        const noControllerConnectionError = this.homey.__('pair.errors.no_controller_connection');
        if (!this.homey.app.loggedIn || !this.homey.app.api || !this.homey.app.api.unifi) {
            throw new Error(noControllerConnectionError);
        }

        try {
            return Object.values(await this.homey.app.api.getCableDevices()).map(device => {
                let deviceName = this.homey.app.api.getDeviceName(device);

                return {
                    data: {id: String(device.mac)},
                    name: deviceName,
                };
            });
        } catch (error) {
            this.homey.app.error(`[cable-client][pair] ${error.message || error}`);
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

module.exports = CableClient;
