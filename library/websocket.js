const WebSocket = require("ws");
const BaseClass = require("./baseclass");

class WebsocketClient extends BaseClass {
    constructor(options, homey) {
        super();
        this.opts = options || {};
        this.opts.host = (typeof (this.opts.host) === 'undefined' ? 'unifi' : this.opts.host);
        this.opts.port = (typeof (this.opts.port) === 'undefined' ? 8443 : this.opts.port);
        this.opts.username = (typeof (this.opts.username) === 'undefined' ? 'admin' : this.opts.username);
        this.opts.password = (typeof (this.opts.password) === 'undefined' ? 'ubnt' : this.opts.password);
        this.opts.site = (typeof (this.opts.site) === 'undefined' ? 'default' : this.opts.site);
        this.opts.sslverify = (typeof (this.opts.sslverify) === 'undefined' ? true : this.opts.sslverify);

        this._baseurl = new URL(`https://${options.host}:${options.port}`);
        this._pingPongInterval = 3 * 1000; // Ms
        this._autoReconnectInterval = 5 * 1000; // Ms

        this.homey = homey;
        this.lastWebsocketMessage = null;
        this._isReconnecting = false; // must be initialized; undefined !== false breaks the reconnect guard
        this._lastPong = null;
        this._closed = false; // set to true when this client is intentionally replaced, to stop reconnect loops
        this._pingpong = null; // stored on instance so it can be cleared on any exit path
    }
    async isWebsocketConnected() {
        if (typeof this._ws !== 'undefined' && this._eventListener !== null) {
            if (this._ws.readyState === WebSocket.OPEN) {
                return true;
            }
        }
        return false;
    }
    getLastWebsocketMessageTime() {
        return this.lastWebsocketMessage;
    }
    async listen() {
        // Clear any leftover ping interval from a previous connection
        if (this._pingpong) {
            this.homey.clearInterval(this._pingpong);
            this._pingpong = null;
        }

        try {
            // Close any existing socket before opening a new one to avoid orphan connections
            if (this._ws) {
                try { this._ws.terminate(); } catch (e) {}
            }

            const cookies = await this.homey.app.api.unifi._cookieJar.getCookieString(this._baseurl.href);

            let eventsUrl = `wss://${this._baseurl.host}/wss/s/${this.opts.site}/events`;
            if (this.homey.app.api.unifi._unifios) {
                eventsUrl = `wss://${this._baseurl.host}/proxy/network/wss/s/${this.opts.site}/events`;
            }

            this._ws = new WebSocket(eventsUrl, {
                perMessageDeflate: false,
                rejectUnauthorized: this.opts.sslverify,
                headers: {
                    Cookie: cookies
                }
            });

            this._pingpong = this.homey.setInterval(() => {
                try {
                    // If no pong received within 3 ping intervals, the connection is half-dead — force reconnect
                    if (this._lastPong && Date.now() - this._lastPong > this._pingPongInterval * 3) {
                        this.homey.log('[websocket] pong timeout — forcing reconnect');
                        this._lastPong = null; // prevent double terminate on next tick before close fires
                        this._ws.terminate();
                        return;
                    }
                    this._ws.send('ping');
                } catch (error) {
                    this.homey.error(`${error.message || error}`);
                }
            }, this._pingPongInterval);

            this._ws.on('open', () => {
                this._lastPong = Date.now(); // reset so timeout doesn't fire immediately on reconnect
                this.homey.app.debug(`WebSocket: open`);
            });

            this._ws.on('message', (data, isBinary) => {
                // update last websocket message timestamp
                this.lastWebsocketMessage = this.homey.app.toLocalTime(new Date()).toISOString().slice(0,16);
                //
                const message = isBinary ? data : data.toString();
                if (message === 'pong') {
                    this._lastPong = Date.now(); // track for pong timeout detection
                    this.homey.app.debug(`Websocket: pong`);
                    return;
                }

                try {
                    const parsed = JSON.parse(message);
                    if ('meta' in parsed && Array.isArray(parsed.data)) {
                        for (const entry of parsed.data) {
                            //                       this.homey.app.debug(`${JSON.stringify(entry)}`);
                            // Pass meta so parseWebsocketMessage can identify device:sync events
                            this.homey.app.parseWebsocketMessage(entry, parsed.meta);
                        }
                    }
                } catch (error) {
                    this.homey.error(`[websocket] [message]: ${error.message || error}`);
                }
            });

            this._ws.on('close', () => {
                this.homey.clearInterval(this._pingpong);
                this._pingpong = null;
                if (this._closed) {
                    this.homey.log('[websocket] connection closed');
                } else {
                    this.homey.log('[websocket] connection closed, reconnecting...');
                    this._reconnect();
                }
            });

            this._ws.on('error', error => {
                this.homey.log(`[websocket] error: ${error.message || error}`);
                this.homey.clearInterval(this._pingpong);
                this._pingpong = null;
                this._reconnect();
            });

            return true;
        } catch(ex) {
            // Clear interval on any setup failure so it doesn't leak
            if (this._pingpong) {
                this.homey.clearInterval(this._pingpong);
                this._pingpong = null;
            }
            this.homey.error('Exception in listen()');
            this.homey.error(JSON.stringify(ex));
            return false;
        }
    }

    _reconnect() {
        if (this._isReconnecting === false && this._closed === false) {
            this._isReconnecting = true;
            this.homey.setTimeout(async () => {
                // Re-check _closed after the delay — client may have been replaced while waiting
                if (this._closed) {
                    this._isReconnecting = false;
                    return;
                }
                try {
                    await this.listen();
                    // Keep _isReconnecting true during listen() so a close event on the old socket
                    // (triggered by terminate() inside listen()) can't schedule a second reconnect
                    this._isReconnecting = false;
                } catch (error) {
                    this.homey.error('_reconnect() encountered an error: ' + error);
                    this._isReconnecting = false; // reset before retry so the guard passes
                    this._reconnect();
                }
            }, this._autoReconnectInterval);
        }
    }

    destroy() {
        this._closed = true;
        if (this._pingpong) {
            this.homey.clearInterval(this._pingpong);
            this._pingpong = null;
        }
        if (this._ws) {
            try { this._ws.terminate(); } catch (e) {}
        }
    }
}

module.exports = WebsocketClient;
