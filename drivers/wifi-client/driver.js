'use strict';

const {Driver} = require('homey');
const Unifi = require("node-unifi");

class WifiClient extends Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('WiFi-Client has been initialized');
    }

    /**
     * onPairListDevices is called when a user is adding a device
     * and the 'list_devices' view is called.
     * This should return an array with the data of devices that are available for pairing.
     */
    async onPairListDevices() {
        return Object.values(await this.homey.app.api.getWiFiDevices()).map(device => {
            let deviceName = device.name
            if (typeof deviceName === 'undefined' && typeof device.hostname !== 'undefined') deviceName = device.hostname;
            if (typeof deviceName === 'undefined') deviceName = device.mac;

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
