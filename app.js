"use strict";

const Homey = require('homey')
const Settings = Homey.ManagerSettings;

const _settingsKey = 'com.ubnt.unifi.settings'

class UnifiApp extends Homey.App {

    onInit() {
        this.log('com.ubnt.unifi started...');
        this.setStatus('Offline');
        this.initSettings();

        Homey.app.debug('- Loaded settings', this.appSettings)
    }

    initSettings() {
        let settingsInitialized = false;
        Settings.getKeys().forEach(key => {
            if (key == _settingsKey) {
                settingsInitialized = true;
            }
        });

        if (settingsInitialized) {
            Homey.app.debug('Found settings key', _settingsKey)
            this.appSettings = Settings.get(_settingsKey);
            return;
        }

        this.log('Freshly initializing com.ubnt.unifi.settings with some defaults')
        this.updateSettings({
            'host': 'unifi',
            'port': '443',
            'user': 'ubnt',
            'pass': 'ubnt',
            'site': 'default',
            'useproxy': 'true'
        });
    }

    updateSettings(settings) {
        Homey.app.debug('Got new settings:', settings)
        this.appSettings = settings;
        this.saveSettings();
        Homey.ManagerDrivers.getDriver('wifi-client').getSettings(_settingsKey);
    }

    saveSettings() {
        if (typeof this.appSettings === 'undefined') {
            Homey.app.debug('Not saving settings; settings empty!');
            return;
        }

        this.log('Save settings.');
        Settings.set(_settingsKey, this.appSettings)
    }

    setStatus(status) {
        Settings.set('com.ubnt.unifi.status', status);
    }

    debug() {
        const args = Array.prototype.slice.call(arguments);
        args.unshift('[debug]');

        if (Homey.env.DEBUG === 'true') {
            Homey.app.log(args.join(' '));
        }

        Homey.ManagerApi.realtime('com.ubnt.unifi.debug', args.join(' '));
    }
}

module.exports = UnifiApp;
