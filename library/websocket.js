'use strict';

const Homey = require('homey');
const WebSocket = require('ws');
const zlib = require('zlib');
const Constants = require('./constants');

const ManagerApi = Homey.ManagerApi;

// 15000 miliseconds is 0.25 minute
const SendPingPongMessageTime = 15000;

class NetworkWebSocket {
    constructor() {
        this._userAgent = 'com.ubnt.unifi';
        this._eventListener = null;
        this._pingPong = null;
    }

    // Return the realtime update events API URL.
    updatesUrl() {
        if (!Homey.app.api.webclient.getUseProxy()) {
            return `wss://${Homey.app.api.getHost()}/wss/s/${Homey.app.api.getSiteId()}/events`;
        }
        return `wss://${Homey.app.api.getHost()}/proxy/network/wss/s/${Homey.app.api.getSiteId()}/events`;
    }

    // Connect to the realtime update events API.
    launchUpdatesListener() {

        // If we already have a listener, we're already all set.
        if (this._eventListener) {
            return true;
        }

        //const params = new URLSearchParams({ lastUpdateId: Homey.app.api._lastUpdateId });

        Homey.app.debug('Update listener: ' + this.updatesUrl());

        try {
            ManagerApi.realtime(Constants.EVENT_SETTINGS_WEBSOCKET_STATUS, 'Connecting');

            console.log(Homey.app.api.getProxyCookieToken());

            const _ws = new WebSocket(this.updatesUrl(), {
                headers: {
                    'User-Agent': this._userAgent,
                    Cookie: Homey.app.api.getProxyCookieToken()
                },
                perMessageDeflate: false,
                rejectUnauthorized: false,
            });

            if (!_ws) {
                Homey.app.debug('Unable to connect to the realtime update events API. Will retry again later.');
                delete this._eventListener;
                this._eventListenerConfigured = false;
                return false;
            }

            this._eventListener = _ws;

            this._pingPong = setInterval(() => {
                this.sendPingPongMessage();
            }, SendPingPongMessageTime);

            // Received pong
            this._eventListener.on('pong', (event) => {
                // update lastPong variable
                let lastPong = new Date().toLocaleString('nl-NL');
                ManagerApi.realtime(Constants.EVENT_SETTINGS_WEBSOCKET_LASTPONG, lastPong);
                Homey.app.debug('Received pong from websocket.');
            });

            // Received ping
            this._eventListener.on('message', (event) => {
                // update lastPong variable
                let lastMessage = new Date().toLocaleString('nl-NL');
                ManagerApi.realtime(Constants.EVENT_SETTINGS_WEBSOCKET_LASTMESSAGE, lastMessage);
            });

            // Connection opened
            this._eventListener.on('open', (event) => {
                Homey.app.debug('Connected to the UniFi realtime update events API.');
                ManagerApi.realtime(Constants.EVENT_SETTINGS_WEBSOCKET_STATUS, 'Connected');
            });

            this._eventListener.on('close', () => {
                // terminate and cleanup websocket connection and timers
                delete this._eventListener;
                this._eventListenerConfigured = false;
                clearInterval(this._pingPong);
                ManagerApi.realtime(Constants.EVENT_SETTINGS_WEBSOCKET_STATUS, 'Disconnected');
                this.reconnectUpdatesListener();
            });

            this._eventListener.on('error', (error) => {
                Homey.app.debug(error);

                // If we're closing before fully established it's because we're shutting down the API - ignore it.
                if (error.message !== 'WebSocket was closed before the connection was established') {
                    Homey.app.debug(Homey.app.api.getHost(), +': ' + error);
                }

                ManagerApi.realtime(Constants.EVENT_SETTINGS_WEBSOCKET_STATUS, error.message);
            });
        } catch (error) {
            Homey.app.debug('Error connecting to the realtime update events API: ' + error);
            ManagerApi.realtime(Constants.EVENT_SETTINGS_WEBSOCKET_STATUS, error);
        }

        return true;
    }

    disconnectEventListener() {
        return new Promise((resolve, reject) => {
            if (typeof this._eventListener !== 'undefined' && this._eventListener !== null) {
                Homey.app.debug('Called terminate websocket');
                this._eventListener.close();
            }
            this._eventListenerConfigured = false;
            resolve(true);
        });
    }

    reconnectUpdatesListener() {
        Homey.app.debug('Called reconnectUpdatesListener');
        this.disconnectEventListener().then((res) => {
            this.launchUpdatesListener();
            this.configureUpdatesListener(this);
        }).catch();
    }

    sendPingPongMessage() {
        if (this._eventListener !== null) {
            this._eventListener.send('ping');
            Homey.app.debug('Send ping to websocket.');
        }
    }

    // Configure the realtime update events API listener to trigger events on accessories, like motion.
    configureUpdatesListener() {
        // Only configure the event listener if it exists and it's not already configured.
        if (!this._eventListener || this._eventListenerConfigured) {
            return true;
        }

        // Listen for any messages coming in from our listener.
        this._eventListener.on('message', (event) => {

            if (event === 'pong') {
                return;
            }

            try {
                const parsed = JSON.parse(event);
                if (parsed.meta.message === 'sta:sync') {
                    // unifi clients
                    parsed.data.forEach(client => {

                        if (client.is_wired === true) {
                            // get wired-client driver
                            const driver = Homey.ManagerDrivers.getDriver('wired-client');

                            // Get device from client id
                            const device = driver.getDeviceById(client.mac);
                            if (!device) {
                                Homey.app.debug('We gaan niet verder... of toch wel? A');
                                return;
                            }

                            // Parse Websocket payload message
                            driver.onParseWesocketMessage(device, client);
                        }

                        if (client.is_wired === false) {
                            // get wired-client driver
                            const driver = Homey.ManagerDrivers.getDriver('wifi-client');

                            // Get device from client id
                            const device = driver.getDeviceById(client.mac);
                            if (!device) {
                                Homey.app.debug('We gaan niet verder... of toch wel? B');
                                return;
                            }

                            // Parse Websocket payload message
                            driver.onParseWesocketMessage(device, client);
                        }

                    });
                }


            } catch (err) {
                Homey.app.debug(err);
            }
        });
        this._eventListenerConfigured = true;
        return true;
    }
}

module.exports = NetworkWebSocket;
