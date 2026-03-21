'use strict';

const {Device} = require('homey');

class AccessPointDevice extends Device {

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        await this.waitForBootstrap();
        this.log('Access-Point has been initialized');
    }

    async waitForBootstrap() {
        if (this.homey.app.loggedIn === true) {
            await this._createMissingCapabilities();
            await this.getDeviceStatus();
        } else {
            this.homey.setTimeout(this.waitForBootstrap.bind(this), 250);
        }
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log('Access-Point has been added');
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({oldSettings, newSettings, changedKeys}) {
        this.log('Access-Point settings where changed');
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name) {
        this.log('Access-Point was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.log('Access-Point has been deleted');
    }

    async _createMissingCapabilities() {
        if (this.getClass() !== 'sensor') {
            this.homey.app.debug(`changed class to sensor for ${this.getName()}`);
            this.setClass('sensor').catch(this.error);
        }
        // Per-radio traffic capabilities are added dynamically in _updatePerRadioStats()
    }

    getDeviceStatus() {
        if (this.homey.app.loggedIn === true) {
            this.homey.app.api.unifi.getAccessDevices(this.getData().id).then(device => {
                device = device.filter(obj => obj.adopted === true);
                device = device.filter(obj => obj.type === 'uap');
                device = device.filter(obj => obj.mac === this.getData().id);
                this.homey.log(JSON.stringify(device));
                if (device.length > 0) {
                    this._updatePerRadioStats(device[0]);
                }
            }).catch(error => this.homey.app.debug(error));
        }
    }

    /**
     * Mapping from UniFi radio-type prefix to capability band suffix.
     * AP stats use: ng = 2.4 GHz, na = 5 GHz, 6e = 6 GHz (confirmed from Wi-Fi 7 payload)
     */
    _radioPrefixToBand(prefix) {
        if (prefix === 'ng') return '2g';
        if (prefix === 'na') return '5g';
        if (prefix === '6e' || prefix === '6g') return '6g';
        return null;
    }

    /**
     * Create/update per-radio traffic capabilities from the AP device payload.
     * Uses ng-/na-/6e- radio-type prefixes which are stable across AP generations
     * (ra0/rai0 on Wi-Fi 5/6 and wifi0/wifi1/wifi2 on Wi-Fi 7 both map to the same prefixes).
     */
    _updatePerRadioStats(apData) {
        const radioPrefixes = ['ng', 'na', '6e'];

        for (const prefix of radioPrefixes) {
            const band = this._radioPrefixToBand(prefix);
            if (!band) continue;

            const rxKey = `${prefix}-rx_bytes`;
            const txKey = `${prefix}-tx_bytes`;

            // Only create capabilities when data is actually present in the API response
            const hasRx = typeof apData[rxKey] === 'number';
            const hasTx = typeof apData[txKey] === 'number';

            if (hasRx) {
                const capRx = `measure_rx_bytes_${band}`;
                if (!this.hasCapability(capRx)) {
                    this.addCapability(capRx).catch(this.error);
                    this.homey.app.debug(`created ${capRx} for ${this.getName()}`);
                }
                const rxMb = Math.round((apData[rxKey] * 0.000001) * 100) / 100;
                this.setCapabilityValue(capRx, rxMb).catch(this.error);
            }

            if (hasTx) {
                const capTx = `measure_tx_bytes_${band}`;
                if (!this.hasCapability(capTx)) {
                    this.addCapability(capTx).catch(this.error);
                    this.homey.app.debug(`created ${capTx} for ${this.getName()}`);
                }
                const txMb = Math.round((apData[txKey] * 0.000001) * 100) / 100;
                this.setCapabilityValue(capTx, txMb).catch(this.error);
            }
        }
    }

    onUpdateMessagePayload(playloadMessage) {
        if (typeof playloadMessage.ip !== 'undefined') {
            this.onIPChange(playloadMessage);
        }
        // Update per-radio stats when device stats come in via polling
        this._updatePerRadioStats(playloadMessage);
    }

    onIPChange(data) {
        if (this.hasCapability('ipAddress')) {
            this.setCapabilityValue('ipAddress', data.ip).catch(this.error);
        }
    }
}

module.exports = AccessPointDevice;
