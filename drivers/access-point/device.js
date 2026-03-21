'use strict';

const {Device} = require('homey');
const PoePowerMixin = require('../../library/poe-power-mixin');

class AccessPointDevice extends PoePowerMixin(Device) {

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        await this.initPoeMeter(); // restore kWh total from store (from PoePowerMixin)
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
        this.destroyPoeMeter();
        this.log('Access-Point has been deleted');
    }

    async _createMissingCapabilities() {
        if (this.getClass() !== 'sensor') {
            this.homey.app.debug(`changed class to sensor for ${this.getName()}`);
            this.setClass('sensor').catch(this.error);
        }

        if (!this.hasCapability('connected')) {
            await this.addCapability('connected');
            this.homey.app.debug(`created capability connected for ${this.getName()}`);
        }

        if (!this.hasCapability('ipAddress')) {
            await this.addCapability('ipAddress');
            this.homey.app.debug(`created capability ipAddress for ${this.getName()}`);
        }

        if (!this.hasCapability('measure_connected_clients')) {
            await this.addCapability('measure_connected_clients');
            this.homey.app.debug(`created capability measure_connected_clients for ${this.getName()}`);
        }

        if (!this.hasCapability('uptime')) {
            await this.addCapability('uptime');
            this.homey.app.debug(`created capability uptime for ${this.getName()}`);
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

                if (device[0]) {
                    const apData = device[0];
                    this._updatePerRadioStats(apData);
                    // Store uplink switch info and seed initial PoE readings (from PoePowerMixin)
                    // APs use uplink.uplink_mac / uplink.uplink_remote_port
                    this.updatePoeUplink(apData);
                    if (this._swMac && this._swPort) {
                        this._fetchPoeData(this._swMac, this._swPort);
                    }
                    // Update state, ip, num_sta and uptime
                    this.onIsConnected(apData.state === 1);
                    if (typeof apData.ip !== 'undefined') this.onIPChange(apData);
                    if (typeof apData.num_sta === 'number') this.onNumClientsChange(apData.num_sta);
                    if (typeof apData.uptime === 'number') this.onUptimeChange(apData.uptime);
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
        if (typeof playloadMessage.state === 'number') {
            this.onIsConnected(playloadMessage.state === 1);
        }
        if (typeof playloadMessage.num_sta === 'number') {
            this.onNumClientsChange(playloadMessage.num_sta);
        }
        if (typeof playloadMessage.uptime === 'number') {
            this.onUptimeChange(playloadMessage.uptime);
        }
        // Update per-radio stats when device stats come in via polling
        this._updatePerRadioStats(playloadMessage);
        // Keep uplink info up to date for real-time device:sync power pushes
        this.updatePoeUplink(playloadMessage);
    }

    onIsConnected(isConnected) {
        const prevConnected = this.getCapabilityValue('connected');

        if (this.hasCapability('connected')) {
            this.setCapabilityValue('connected', isConnected).catch(this.error);
        }

        if (prevConnected !== isConnected) {
            if (isConnected) {
                this.homey.app._accessPointConnected.trigger(this, {}, {}).catch(this.error);
            } else {
                this.homey.app._accessPointDisconnected.trigger(this, {}, {}).catch(this.error);
            }
        }
    }

    onNumClientsChange(numClients) {
        const prevNum = this.getCapabilityValue('measure_connected_clients');

        if (this.hasCapability('measure_connected_clients')) {
            this.setCapabilityValue('measure_connected_clients', numClients).catch(this.error);
        }

        if (prevNum !== null && prevNum !== numClients) {
            const tokens = { num_clients: numClients };
            this.homey.app._accessPointClientCountChanged.trigger(this, tokens, {}).catch(this.error);
        }
    }

    onUptimeChange(uptime) {
        if (this.hasCapability('uptime')) {
            this.setCapabilityValue('uptime', uptime).catch(this.error);
        }
    }

    onIPChange(data) {
        if (this.hasCapability('ipAddress')) {
            this.setCapabilityValue('ipAddress', data.ip).catch(this.error);
        }
    }
}

module.exports = AccessPointDevice;
