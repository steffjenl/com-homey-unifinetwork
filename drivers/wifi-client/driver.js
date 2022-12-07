'use strict';

const {Driver} = require('homey');
const UnifiConstants = require("../../library/constants");

class WifiClient extends Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this._wifiClientConnectedAppCondition = this.homey.flow.getConditionCard(UnifiConstants.EVENT_WIFI_CLIENT_CONNECTED);
        this._wifiClientDisconnectedAppCondition = this.homey.flow.getConditionCard(UnifiConstants.EVENT_WIFI_CLIENT_DISCONNECTED);

        this._wifiClientConnectedAppCondition.registerRunListener(async ({ device }) => {
            if (device.hasCapability('alarm_connected')) {
                const alarmConnected = device.getCapabilityValue('alarm_connected');
                return Promise.resolve(alarmConnected);
            }
        });

        this._wifiClientDisconnectedAppCondition.registerRunListener(async ({ device }) => {
            if (device.hasCapability('alarm_connected')) {
                const alarmConnected = device.getCapabilityValue('alarm_connected');
                return Promise.resolve(alarmConnected);
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
            let deviceName = this.homey.app.api.getDeviceName(device);

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
            device.onIsConnected(false);
        }
    }

    onConnectedMessage(device) {
        this.homey.app.debug('onConnectedMessage');
        if (Object.prototype.hasOwnProperty.call(device, '_events')) {
            device.onIsConnected(true);
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
