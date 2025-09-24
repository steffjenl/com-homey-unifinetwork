'use strict';

const {Driver} = require('homey');
const UnifiConstants = require("../../library/constants");
const Homey = require("homey");

class NetworkSwitch extends Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('Network-Switch has been initialized');
    }

    /**
     * onPairListDevices is called when a user is adding a device
     * and the 'list_devices' view is called.
     * This should return an array with the data of devices that are available for pairing.
     */
    async onPairListDevices() {
        return Object.values(await this.homey.app.api.getNetworkSwitches()).map(device => {
            let deviceName = this.homey.app.api.getDeviceName(device);

            return {
                data: {id: String(device.mac)},
                name: deviceName,
            };
        });
    }

    /**
     * getUnifiDeviceById is called to get the Device class from an mac address.
     *
     * @param deviceId
     * @returns {Device|boolean}
     */
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

module.exports = NetworkSwitch;
