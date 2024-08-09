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
        try {
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

            const pingpong = setInterval(() => {
                try {
                    this._ws.send('ping');
                } catch (error) {
                    this.homey.error(`${JSON.stringify(error)}`);
                }
            }, this._pingPongInterval);

            this._ws.on('open', () => {
                this.homey.app.debug(`WebSocket: open`);
            });

            this._ws.on('message', (data, isBinary) => {
                // update last websocket message timestamp
                this.lastWebsocketMessage = this.homey.app.toLocalTime(new Date()).toISOString().slice(0,16);
                //
                const message = isBinary ? data : data.toString();
                if (message === 'pong') {
                    this.homey.app.debug(`Websocket: pong`);
                    return;
                }

                try {
                    const parsed = JSON.parse(message);
                    if ('meta' in parsed && Array.isArray(parsed.data)) {
                        for (const entry of parsed.data) {
                            //                       this.homey.app.debug(`${JSON.stringify(entry)}`);
                            this.homey.app.parseWebsocketMessage(entry);
                        }
                    }
                } catch (error) {
                    this.homey.error(`[websocket] [message]: ${JSON.stringify(error)}`);
                }
            });

            this._ws.on('close', () => {
                this.homey.app.debug(`WebSocket: close`);
                clearInterval(pingpong);
                this._reconnect();
            });

            this._ws.on('error', error => {
                this.homey.app.debug(`${JSON.stringify(error)}`);
                clearInterval(pingpong);
                this._reconnect();
            });

            return true;
        } catch(ex) {
            this.homey.error('Exeption in listing()');
            this.homey.error(JSON.stringify(ex));
            return false;
        }
    }

    _reconnect() {
        if (this._isReconnecting === false && this.homey.app.api.unifi._isClosed === false) {
            this._isReconnecting = true;
            setTimeout(async () => {
                this._isReconnecting = false;
                try {
                    await this.listen();
                } catch (error) {
                    this.error('_reconnect() encountered an error: ' + error);
                }
            }, this._autoReconnectInterval);
        }
    }
}

module.exports = WebsocketClient;
