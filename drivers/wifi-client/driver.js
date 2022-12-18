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

        this._wifiClientConnected.registerRunListener(async ({ device }) => {
            if (device.hasCapability('alarm_connected')) {
                const alarmConnected = device.getCapabilityValue('alarm_connected');
                return Promise.resolve(alarmConnected);
            }
        });

        this._wifiClientRoamedToAp.registerRunListener(async (args, state) => {
            if (args.device.hasCapability('ap_mac')) {
                const apMac = args.device.getCapabilityValue('ap_mac');
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

    onParseWebsocketMessage(device, payload) {
        if (Object.prototype.hasOwnProperty.call(device, '_events')) {
            device.onUpdateMessage();
        }
    }

    onDisconnectedMessage(device) {
        this.homey.app.debug('onDisconnectedMessage');
        if (Object.prototype.hasOwnProperty.call(device, '_events')) {
            device.onIsConnected(false, null);
        }
    }

    onConnectedMessage(device, wifiName) {
        this.homey.app.debug('onConnectedMessage: ' + wifiName);
        if (Object.prototype.hasOwnProperty.call(device, '_events')) {
            device.onIsConnected(true, wifiName);
        }
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

module.exports = WifiClient;
