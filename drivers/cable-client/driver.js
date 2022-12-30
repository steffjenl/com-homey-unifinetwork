'use strict';

const {Driver} = require('homey');

class CableClient extends Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('Cable-Client has been initialized');
    }

    /**
     * onPairListDevices is called when a user is adding a device
     * and the 'list_devices' view is called.
     * This should return an array with the data of devices that are available for pairing.
     */
    async onPairListDevices() {
        return Object.values(await this.homey.app.api.getCableDevices()).map(device => {
            let deviceName = this.homey.app.api.getDeviceName(device);

            return {
                data: {id: String(device.mac)},
                name: deviceName,
            };
        });
    }

    getUnifiDeviceById(deviceId) {
        try {
            const device = this.getDevice({
                id: deviceId,
            });
            return device;
        } catch (error) {
            return false;
        }
    }
}

module.exports = CableClient;
