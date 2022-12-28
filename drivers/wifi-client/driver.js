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

        this._wifiClientConnected.registerRunListener(async (args, state) => {
            if (args.Device.hasCapability('connected')) {
                 const alarmConnected = args.Device.getCapabilityValue('connected');
                return Promise.resolve(alarmConnected);
            }
        });

        this._wifiClientRoamedToAp.registerRunListener(async (args, state) => {
            if (args.Device.hasCapability('ap_mac')) {
                const apMac = args.Device.getCapabilityValue('ap_mac');
                return Promise.resolve(args.accessPoint === apMac);
            }
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
}

module.exports = WifiClient;
