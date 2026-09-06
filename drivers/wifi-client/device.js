'use strict';

const {Device} = require('homey');
const ErrorHandler = require('../../library/error-handler');

class WiFiDevice extends Device {

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        await this._createMissingCapabilities();
        await this.getDeviceStatus();

        this.registerCapabilityListener("blocked", async (value) => {
            try {
                this.homey.app.debug(`${JSON.stringify(value)}`);
                if (value) {
                    await this.homey.app.api.unifi.blockClient(this.getData().id);
                    return;
                }
                await this.homey.app.api.unifi.unblockClient(this.getData().id);
            } catch (error) {
                const parsed = ErrorHandler.parseError(error, this.homey);
                this.error(`[blocked] ${parsed.message}`);
                this.homey.app._notifyError(error);
                if (parsed.isAuthError) {
                    await this.homey.app._appLogin();
                }
                throw new Error(parsed.message);
            }
        });

        this.log('WiFiDevice has been initialized');
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log('WiFiDevice has been added');
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
        this.log('WiFiDevice settings where changed');
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name) {
        this.log('WiFiDevice was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.log('WiFiDevice has been deleted');
    }

    async _createMissingCapabilities() {
        if (this.getClass() !== 'sensor') {
            this.homey.app.debug(`changed class to sensor for ${this.getName()}`);
            this.setClass('sensor').catch(this.error);
        }

        if (!this.hasCapability('wifi_name')) {
            this.addCapability('wifi_name').catch(this.error);
            this.homey.app.debug(`created capability wifi_name for ${this.getName()}`);
        }

        if (!this.hasCapability('ap_mac')) {
            this.addCapability('ap_mac').catch(this.error);
            this.homey.app.debug(`created capability ap_mac for ${this.getName()}`);
        }

        if (!this.hasCapability('ap')) {
            this.addCapability('ap').catch(this.error);
            this.homey.app.debug(`created capability ap for ${this.getName()}`);
        }

        if (!this.hasCapability('ipAddress')) {
            this.addCapability('ipAddress').catch(this.error);
            this.homey.app.debug(`created capability ipAddress for ${this.getName()}`);
        }

        if (!this.hasCapability('radio_proto')) {
            this.addCapability('radio_proto').catch(this.error);
            this.homey.app.debug(`created capability radio_proto for ${this.getName()}`);
        }

        if (!this.hasCapability('connected')) {
            this.addCapability('connected').catch(this.error);
            this.homey.app.debug(`created capability connected for ${this.getName()}`);
        }

        if (this.hasCapability('alarm_connected')) {
            this.removeCapability('alarm_connected').catch(this.error);
            this.homey.app.debug(`deleted capability alarm_connected for ${this.getName()}`);
        }

        if (this.hasCapability('onoff')) {
            this.removeCapability('onoff').catch(this.error);
            this.homey.app.debug(`deleted capability onoff for ${this.getName()}`);
        }

        if (!this.hasCapability('blocked')) {
            this.addCapability('blocked').catch(this.error);
            this.homey.app.debug(`created blocked connected for ${this.getName()}`);
        }

        if (!this.hasCapability('measure_rx_bytes')) {
            this.addCapability('measure_rx_bytes').catch(this.error);
            this.homey.app.debug(`created measure_rx_bytes connected for ${this.getName()}`);
        }

        if (!this.hasCapability('measure_tx_bytes')) {
            this.addCapability('measure_tx_bytes').catch(this.error);
            this.homey.app.debug(`created measure_tx_bytes connected for ${this.getName()}`);
        }

        // Per-band RSSI capabilities for MLO (Wi-Fi 7) — added dynamically when API data is present
        // Capabilities are created/removed based on what the UniFi API returns for this device.
        // Existing devices keep measure_rssi as the primary (backward-compatible) value.
    }

    /**
     * Map UniFi radio type prefix to capability suffix.
     * UniFi API uses: ng = 2.4 GHz, na = 5 GHz, 6e = 6 GHz
     */
    _radioPrefixToBand(prefix) {
        if (prefix === 'ng') return '2g';
        if (prefix === 'na') return '5g';
        if (prefix === '6e' || prefix === '6g') return '6g';
        return null;
    }

    /**
     * Update per-band RSSI capabilities from a UniFi client payload.
     * The API uses prefixed fields like ng-rssi, na-rssi, 6e-rssi for MLO clients.
     * Falls back gracefully if per-band data is absent (non-MLO devices).
     */
    onPerBandRssiChange(data) {
        const bands = [
            { prefix: 'ng', cap: 'measure_rssi_2g' },
            { prefix: 'na', cap: 'measure_rssi_5g' },
            { prefix: '6e', cap: 'measure_rssi_6g' },
        ];

        for (const { prefix, cap } of bands) {
            const rssiKey = `${prefix}-rssi`;
            const signalKey = `${prefix}-signal`;
            // Use rssi field if available, fall back to signal
            const value = typeof data[rssiKey] === 'number' ? data[rssiKey]
                        : typeof data[signalKey] === 'number' ? data[signalKey]
                        : null;

            if (value !== null) {
                if (!this.hasCapability(cap)) {
                    this.addCapability(cap).catch(this.error);
                    this.homey.app.debug(`created ${cap} for ${this.getName()}`);
                }
                this.setCapabilityValue(cap, value).catch(this.error);
            }
            // Note: we intentionally do NOT remove the capability when value is absent
            // to avoid flickering when a band is temporarily idle in an MLO session.
        }
    }

    onWifiChanged(data) {
        if (this.hasCapability('wifi_name')) {
            this.setCapabilityValue('wifi_name', data.essid).catch(this.error);
        }
    }

    onIsConnected(isConnected, wifiName) {
        const deviceState = this.getState();

        if (this.hasCapability('connected')) {
            this.setCapabilityValue('connected', isConnected).catch(this.error);
        }

        if (!wifiName) {
            wifiName = deviceState.wifi_name;
        }

        if (deviceState.connected !== isConnected) {
            if (isConnected) {
                const tokens = {
                    rssi: deviceState.measure_rssi,
                    signal: deviceState.measure_signal,
                    radio_proto: deviceState.radio_proto,
                    essid: wifiName
                };
                this.homey.app._wifiClientConnected.trigger(this, tokens, {}).catch(this.homey.log);
            } else {
                this.homey.app._wifiClientDisconnected.trigger(this, {}, {}).catch(this.homey.log);
            }
        }
    }

    onSignalChange(data) {
        if (this.hasCapability('measure_signal')) {
            this.setCapabilityValue('measure_signal', data.signal).catch(this.error);
            if (data.signal !== this.getCapabilityValue('measure_signal')) {

                const tokens = {
                    rssi: data.rssi,
                    signal: data.signal,
                    radio_proto: data.radio_proto,
                    essid: data.essid
                };

                // trigger flow
                this.homey.app._wifiClientSignalChanged.trigger(this, tokens, {}).catch(this.homey.log);
            }
        }
    }

    onRSSIChange(data) {
        if (this.hasCapability('measure_rssi')) {
            this.setCapabilityValue('measure_rssi', data.rssi).catch(this.error);
        }
    }

    onAPChange(data) {
        if (this.hasCapability('ap_mac')) {
            this.setCapabilityValue('ap_mac', data.ap_mac).catch(this.error);
            const accessPointName = this.homey.app.getAccessPointName(data.ap_mac);
            if (this.hasCapability('ap')) {
                this.setCapabilityValue('ap', (accessPointName ? accessPointName : '-')).catch(this.error);
            }

            if (data.ap_mac !== this.getCapabilityValue('ap_mac')) {
                const tokens = {
                    rssi: data.rssi,
                    signal: data.signal,
                    radio_proto: data.radio_proto,
                    essid: data.essid,
                    accessPoint: (accessPointName ? accessPointName : '-'),
                    accessPointMac: data.ap_mac,
                    roam_count: 0
                };

                // trigger floaded ap
                this.homey.app._wifiClientRoamed.trigger(this, tokens, {}).catch(this.homey.log);
                this.homey.app._wifiClientRoamedToAp.trigger(this, tokens, {}).catch(this.homey.log);
            }
        }
    }

    onIPChange(data) {
        if (this.hasCapability('ipAddress')) {
            this.setCapabilityValue('ipAddress', data.ip).catch(this.error);
        }
    }

    onRadioProtoChange(data) {
        if (this.hasCapability('radio_proto')) {
            this.setCapabilityValue('radio_proto', data.radio_proto).catch(this.error);
        }
    }

    onBlockedChange(data) {
        if (this.hasCapability('blocked')) {
            this.setCapabilityValue('blocked', data.blocked).catch(this.error);
        }
    }

    async onVlanChange(data) {
        if (typeof data.network_id === 'undefined') return;
        const previousNetworkId = this.getStoreValue('network_id');
        if (typeof previousNetworkId === 'undefined' || previousNetworkId === null) {
            // first observation (pairing / first poll) — seed store, do not fire
            await this.setStoreValue('network_id', data.network_id);
            return;
        }
        if (previousNetworkId !== data.network_id) {
            const oldName = this.homey.app.getNetworkName(previousNetworkId);
            const newName = this.homey.app.getNetworkName(data.network_id);
            const tokens = {
                old_vlan_name: oldName ? oldName : '-',
                old_vlan_id: previousNetworkId,
                new_vlan_name: newName ? newName : '-',
                new_vlan_id: data.network_id,
            };
            this.homey.app._wifiClientVlanChanged.trigger(this, tokens, {}).catch(this.homey.log);
            this.homey.app._clientVlanChanged.trigger({
                mac: this.getData().id,
                name: this.getName(),
                ...tokens,
            }).catch(this.homey.log);
            await this.setStoreValue('network_id', data.network_id);
        }
    }

    onBytesChange(data) {
        if (this.hasCapability('measure_tx_bytes')) {
            this.setCapabilityValue('measure_tx_bytes', (Math.round((data.tx_bytes * 0.000001) * 100) / 100)).catch(this.error);
        }

        if (this.hasCapability('measure_rx_bytes')) {
            this.setCapabilityValue('measure_rx_bytes', (Math.round((data.rx_bytes * 0.000001) * 100) / 100)).catch(this.error);
        }
    }

    getDeviceStatus() {
        if (this.homey.app.loggedIn === true) {
            this.homey.app.api.unifi.getClientDevice(this.getData().id).then(device => {

                if (typeof device[0].essid !== 'undefined') {
                    this.onWifiChanged(device[0]);
                }

                if (typeof device[0].signal !== 'undefined') {
                    this.onSignalChange(device[0]);
                }

                if (typeof device[0].rssi !== 'undefined') {
                    this.onRSSIChange(device[0]);
                }

                if (typeof device[0].ap_mac !== 'undefined') {
                    this.onAPChange(device[0]);
                }

                if (typeof device[0].ip !== 'undefined') {
                    this.onIPChange(device[0]);
                }

                if (typeof device[0].radio_proto !== 'undefined') {
                    this.onRadioProtoChange(device[0]);
                }

                if (typeof device[0].blocked !== 'undefined') {
                    this.onBlockedChange(device[0]);
                }

                if (typeof device[0].network_id !== 'undefined') {
                    this.onVlanChange(device[0]);
                }

                // Per-band RSSI for MLO (Wi-Fi 7) — always pass full payload
                this.onPerBandRssiChange(device[0]);

            }).catch(error => this.homey.app.debug(error));
        }
    }

    onUpdateMessagePayload(playloadMessage) {
        if (typeof playloadMessage.essid !== 'undefined') {
            this.onWifiChanged(playloadMessage);
        }

        if (typeof playloadMessage.signal !== 'undefined') {
            this.onSignalChange(playloadMessage);
        }

        if (typeof playloadMessage.rssi !== 'undefined') {
            this.onRSSIChange(playloadMessage);
        }

        if (typeof playloadMessage.ap_mac !== 'undefined') {
            this.onAPChange(playloadMessage);
        }

        if (typeof playloadMessage.ip !== 'undefined') {
            this.onIPChange(playloadMessage);
        }

        if (typeof playloadMessage.radio_proto !== 'undefined') {
            this.onRadioProtoChange(playloadMessage);
        }

        if (typeof playloadMessage.blocked !== 'undefined') {
            this.onBlockedChange(playloadMessage);
        }

        if (typeof playloadMessage.network_id !== 'undefined') {
            this.onVlanChange(playloadMessage);
        }

        if (typeof playloadMessage.rx_bytes !== 'undefined' && typeof playloadMessage.tx_bytes !== 'undefined') {
            this.onBytesChange(playloadMessage);
        }

        // Per-band RSSI for MLO (Wi-Fi 7) — check every update cycle
        this.onPerBandRssiChange(playloadMessage);
    }
}

module.exports = WiFiDevice;
