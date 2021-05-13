// eslint-disable-next-line node/no-unpublished-require,strict
'use strict';

const Homey = require('homey');
const NetworkAPI = require('./library/networkapi');
const Constants = require('./library/constants');

const ManagerApi = Homey.ManagerApi;

// 2700000 miliseconds is 45 minutes
const RefreshCookieTime = 2700000;

class UnifiNetwork extends Homey.App {
    /**
     * onInit is called when the app is initialized.
     */
    async onInit() {
        this.loggedIn = false;
        this.controllerIp = null;
        this.controllerPort = null;
        this.controllerUsername = null;
        this.controllerPassword = null;
        this.controllerUseProxy = null;
        this.controllerSiteId = null;

        this.accessPoints = [];
        this.usergroupList = [];

        // Enable remote debugging, if applicable
        if (Homey.env.DEBUG === 'true') {
            // eslint-disable-next-line global-require
            require('inspector')
                .open(9229, '0.0.0.0');
        }

        // Single API instance for all devices
        this.api = new NetworkAPI();

        // Subscribe to credentials updates
        Homey.ManagerSettings.on('set', key => {
            if (key === 'ufp:credentials') {
                this._appLogin();
            }
        });
        this._appLogin();


        Homey.app.debug('UniFiNetwork has been initialized');
    }

    _appLogin() {
        Homey.app.debug('App Logging in...');

        // Validate NVR IP address
        const data = Homey.ManagerSettings.get('com.ubnt.unifi.settings');
        if (!data) {
            Homey.app.debug('UniFi Network settings are not set.');
            return;
        }


        // Log in to Unifi Controller
        this.api.login(data['host'], data['port'], data['user'], data['pass'], (data['useproxy'] === 'true'))
            .then(() => {
                Homey.app.debug('Logged in.');

                this.loggedIn = true;
                this.controllerIp = data['host'];
                this.controllerPort = data['port'];
                this.controllerUsername = data['user'];
                this.controllerPassword = data['pass'];
                this.controllerSiteId = data['site'];
                this.controllerUseProxy = (data['useproxy'] === 'true');
                this.api.setSiteId(this.controllerSiteId);

                // _refreshCookie after 45 minutes
                const timeOutFunction = function () {
                    this._refreshCookie();
                }.bind(this);
                setTimeout(timeOutFunction, RefreshCookieTime);

                // get meta information about usergrouplists and accesspoints
                this._refreshMetaInformation();
            })
            .catch(error => this.error(error));
    }

    _refreshCookie() {
        if (this.loggedIn) {
            this.api.login(this.controllerIp, this.controllerPort, this.controllerUsername, this.controllerPassword, this.controllerUseProxy)
                .then(() => {
                    Homey.app.debug('Logged in again to refresh cookie.');
                    this.loggedIn = true;
                    this._refreshMetaInformation();
                })
                .catch(error => this.error(error));
        }

        // _refreshCookie after 45 minutes
        const timeOutFunction = function () {
            this._refreshCookie();
        }.bind(this);
        setTimeout(timeOutFunction, RefreshCookieTime);
    }

    _refreshMetaInformation() {

        this.api.getAccesspoints().then(accessPoints => {
            this.accessPoints = accessPoints;
        }).catch(error => this.error(error));

        this.api.getUserGroupList().then(userGroupList => {
            this.usergroupList = userGroupList;
        }).catch(error => this.error(error));

    }

    debug() {
        const args = Array.prototype.slice.call(arguments);
        args.unshift('[debug]');

        if (Homey.env.DEBUG === 'true') {
            Homey.app.log(args.join(' '));
        }

        ManagerApi.realtime(Constants.EVENT_SETTINGS_DEBUG, args.join(' '));
    }
}

module.exports = UnifiNetwork;
