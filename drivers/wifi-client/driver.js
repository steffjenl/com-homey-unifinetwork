'use strict';

const {Driver} = require('homey');
const UnifiConstants = require("../../library/constants");

class WifiClient extends Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this._wifiClientConnected = this.homey.flow.getConditionCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED);
        this._wifiClientRoamedToAp = this.homey.flow.getConditionCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED_WITH_AP);
        this._wifiClientBlocked = this.homey.flow.getConditionCard(UnifiConstants.EVENT_WIFI_CLIENT_BLOCKED);

        this._wifiClientConnected.registerRunListener(async (args, state) => {
            const alarmConnected = args.Device.getCapabilityValue('connected');
            return Promise.resolve(alarmConnected);
        });

        this._wifiClientRoamedToAp.registerRunListener(async (args, state) => {
            const apMac = args.Device.getCapabilityValue('ap_mac').toLowerCase();
            const apName = args.Device.getCapabilityValue('ap').toLowerCase();
            return Promise.resolve(args.accessPoint.toLowerCase() === apMac || args.accessPoint.toLowerCase() === apName);
        });

        this._wifiClientBlocked.registerRunListener(async (args, state) => {
            const clientBlocked = args.Device.getCapabilityValue('blocked');
            return Promise.resolve(clientBlocked);
        });

        this.log('WiFi-Client has been initialized');
    }

    /**
     * onPairListDevices is called when a user is adding a device
     * and the 'list_devices' view is called.
     * This should return an array with the data of devices that are available for pairing.
     */
    async onPairListDevices() {
        return Object.values(await this.homey.app.api.getWiFiDevices()).map(device => {
            const deviceName = this.homey.app.api.getDeviceName(device);

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

module.exports = WifiClient;
