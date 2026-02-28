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

        // Fix 3: use this.opts instead of raw options so defaults applied above are respected
        this._baseurl = new URL(`https://${this.opts.host}:${this.opts.port}`);
        this._pingPongInterval = 30 * 1000; // Ms — 30s gives a 90s timeout window before forcing reconnect
        this._autoReconnectInterval = 5 * 1000; // Ms

        this.homey = homey;
        this.lastWebsocketMessage = null;
        this._isReconnecting = false; // must be initialized; undefined !== false breaks the reconnect guard
        this._lastPong = null;
        this._closed = false; // set to true when this client is intentionally replaced, to stop reconnect loops
        this._pingpong = null; // stored on instance so it can be cleared on any exit path
    }

    // Fix 6: was checking undefined _eventListener; now checks _ws readyState directly
    async isWebsocketConnected() {
        return this._ws !== undefined && this._ws !== null && this._ws.readyState === WebSocket.OPEN;
    }

    getLastWebsocketMessageTime() {
        return this.lastWebsocketMessage;
    }

    async listen() {
        // Fix 2: reset _lastPong so a stale timestamp from the previous connection
        // doesn't cause an immediate pong-timeout on the newly opened socket
        this._lastPong = null;

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

            // Fix 1: capture the socket in a local const so event handlers can detect
            // if they belong to a stale (superseded) connection and bail out early
            const currentWs = this._ws;

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

            // Fix 1: register all handlers on currentWs (not this._ws) so they are permanently
            // bound to this specific socket instance and can detect staleness via the guard below
            currentWs.on('open', () => {
                this._lastPong = Date.now(); // reset so timeout doesn't fire immediately on reconnect
                this.homey.app.debug(`WebSocket: open`);
            });

            currentWs.on('message', (data, isBinary) => {
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

            currentWs.on('close', () => {
                // Fix 1: stale-socket guard — a delayed close from a terminated old socket
                // must not trigger a spurious reconnect after _isReconnecting has been reset
                if (this._ws !== currentWs) return; // stale socket from a previous connection — ignore
                this.homey.clearInterval(this._pingpong);
                this._pingpong = null;
                if (this._closed) {
                    this.homey.log('[websocket] connection closed');
                } else {
                    this.homey.log('[websocket] connection closed, reconnecting...');
                    this._reconnect();
                }
            });

            currentWs.on('error', error => {
                // Fix 1: stale-socket guard — errors from a superseded socket should not
                // schedule another reconnect for the already-active new connection
                if (this._ws !== currentWs) return; // stale socket from a previous connection — ignore
                this.homey.log(`[websocket] error: ${error.message || error}`);
                this.homey.clearInterval(this._pingpong);
                this._pingpong = null;
                // A 401 means the session cookie has expired — retrying listen() with the
                // same cookie will loop forever. Stop this client and trigger a full re-login
                // so the cookie jar is refreshed before the next WebSocket connect attempt.
                if (error.message && error.message.includes('401')) {
                    this._closed = true; // prevent this client's _reconnect() from looping
                    this.homey.app._appLogin().catch(e => this.homey.error(`[websocket] re-login failed: ${e.message || e}`));
                } else {
                    this._reconnect();
                }
            });

            return true;
        } catch(ex) {
            // Clear interval on any setup failure so it doesn't leak
            if (this._pingpong) {
                this.homey.clearInterval(this._pingpong);
                this._pingpong = null;
            }
            // Fix 4: terminate and null any partially-assigned socket so it doesn't linger
            if (this._ws) {
                try { this._ws.terminate(); } catch (e) {}
                this._ws = null;
            }
            this.homey.error('Exception in listen()');
            // Fix 5: JSON.stringify loses stack/message on native Error objects
            this.homey.error(ex instanceof Error ? (ex.stack || ex.message) : JSON.stringify(ex));
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
                    const connected = await this.listen();
                    // Keep _isReconnecting true during listen() so a close event on the old socket
                    // (triggered by terminate() inside listen()) can't schedule a second reconnect
                    this._isReconnecting = false;
                    if (!connected) {
                        // listen() caught an internal exception and returned false — retry
                        this._reconnect();
                    }
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
