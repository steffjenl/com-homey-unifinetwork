const WebSocket = require("ws");

class WebsocketClient {
    constructor(options, unifi, homeyObject) {
        this.opts = options || {};
        this.opts.host = (typeof (this.opts.host) === 'undefined' ? 'unifi' : this.opts.host);
        this.opts.port = (typeof (this.opts.port) === 'undefined' ? 8443 : this.opts.port);
        this.opts.username = (typeof (this.opts.username) === 'undefined' ? 'admin' : this.opts.username);
        this.opts.password = (typeof (this.opts.password) === 'undefined' ? 'ubnt' : this.opts.password);
        this.opts.site = (typeof (this.opts.site) === 'undefined' ? 'default' : this.opts.site);
        this.opts.sslverify = (typeof (this.opts.sslverify) === 'undefined' ? true : this.opts.sslverify);

        this._baseurl = new URL(`https://${options.host}:${options.port}`);
        this._cookieJar = unifi._cookieJar;
        this._unifios = unifi._unifios;
        this._pingPongInterval = 3 * 1000; // Ms
        this._autoReconnectInterval = 5 * 1000; // Ms

        this.homey = homeyObject;
    }
    async listen() {
        const cookies = await this._cookieJar.getCookieString(this._baseurl.href);

        let eventsUrl = `wss://${this._baseurl.host}/wss/s/${this.opts.site}/events`;
        if (this._unifios) {
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
                this.homey.app.debug(`${JSON.stringify(error)}`);
            }
        }, this._pingPongInterval);

        this._ws.on('open', () => {
            this.homey.app.debug(`WebSocket: open`);
        });

        this._ws.on('message', (data, isBinary) => {
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
                this.homey.app.debug(`${JSON.stringify(error)}`);
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
    }

    _reconnect() {
        if (this._isReconnecting === false && this._isClosed === false) {
            this._isReconnecting = true;
            setTimeout(async () => {
                this._isReconnecting = false;
                try {
                    await this.listen();
                } catch (error) {
                    console.dir('_reconnect() encountered an error: ' + error);
                }
            }, this._autoReconnectInterval);
        }
    }
}

module.exports = WebsocketClient;
