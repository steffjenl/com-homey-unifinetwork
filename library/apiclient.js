'use strict';

const BaseClass = require('./baseclass');
const Unifi = require('node-unifi');
const UnifiConstants = require('./constants');
const WebsocketClient = require('./websocket');

class ApiClient extends BaseClass {

    constructor({homey}) {
        super();
        this.unifi = null;
        this.websocket = null;
        this.homey = homey;
        this.loggedInStatus = 0;
    }

    setUnifiObject(hostName, portNumber, userName, passWord, siteName) {
        this.unifi = new Unifi.Controller({host: hostName, port: portNumber, sslverify: false, site: siteName});

        return this.unifi;
    }

    setWebSocketObject(hostName, portNumber, userName, passWord, siteName) {
        const options = {host: hostName, port: portNumber, sslverify: false, site: siteName};
        this.websocket = new WebsocketClient(options, this.homey);
    }

    async getAccessPoints() {
        return new Promise((resolve, reject) => {
            this.unifi.getAccessDevices()
                .then(response => {
                    response = response.filter( obj => obj.adopted === true);
                    response = response.filter( obj => obj.type === 'uap');
                    if (response) {
                        return resolve(response);
                    } else {
                        return reject(new Error('Error obtaining AccessPoint devices.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    async getWiFiDevices() {
        return new Promise((resolve, reject) => {
            this.unifi.getClientDevices()
                .then(response => {
                    response = response.filter( obj => obj.is_wired === false);
                    if (response) {
                        return resolve(response);
                    } else {
                        return reject(new Error('Error obtaining WiFi devices.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    async getCableDevices() {
        return new Promise((resolve, reject) => {
            this.unifi.getClientDevices()
                .then(response => {
                    response = response.filter( obj => obj.is_wired === true);
                    if (response) {
                        return resolve(response);
                    } else {
                        return reject(new Error('Error obtaining cable devices.'));
                    }
                })
                .catch(error => reject(error));
        });
    }

    getDeviceName(payload) {
        let deviceName = payload.name
        if (typeof deviceName === 'undefined' && typeof payload.hostname !== 'undefined') deviceName = payload.hostname;
        if (typeof deviceName === 'undefined' && typeof payload.mac !== 'undefined') deviceName = payload.mac;
        if (typeof deviceName === 'undefined' && typeof payload.user !== 'undefined') deviceName = payload.user;
        if (typeof deviceName === 'undefined') deviceName = "unknown";
        return deviceName;
    }
}

module.exports = ApiClient;
