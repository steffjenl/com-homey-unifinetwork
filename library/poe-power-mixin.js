'use strict';

/**
 * PoePowerMixin — adds PoE power reporting to any Homey device that is itself
 * powered via a PoE switch port (cable-clients, access points, PoE-powered switches).
 *
 * Usage:
 *   const PoePowerMixin = require('../../library/poe-power-mixin');
 *   class MyDevice extends PoePowerMixin(Device) { ... }
 *
 * Each device must call:
 *   await this.initPoeMeter()   — in onInit, before getDeviceStatus()
 *   this.updatePoeUplink(data)  — whenever a UniFi payload arrives, so the
 *                                 device:sync handler can push real-time updates
 *
 * UniFi uses two different field layouts depending on device type:
 *   Client devices      → { sw_mac, sw_port }
 *   Infrastructure devs → { uplink: { uplink_mac, uplink_remote_port } }
 * updatePoeUplink() normalises both into this._swMac / this._swPort.
 */
const PoePowerMixin = (Base) => class extends Base {

    // Call from onInit to restore the accumulated kWh total from persistent storage.
    // Data survives app restarts and Homey reboots; lost only if the device is deleted + re-paired.
    // Also starts a 5-minute polling fallback — UniFi device:sync events only carry PoE data when
    // something changes on the switch, which can be infrequent on stable devices.
    async initPoeMeter() {
        this._meterPower = await this.getStoreValue('meter_power') || 0;
        this._lastPowerTs = null; // null = first reading this session; gap while app was down is skipped
        this._poePollingInterval = this.homey.setInterval(() => {
            if (this._swMac && this._swPort) {
                this._fetchPoeData(this._swMac, this._swPort);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    // Call from onDeleted to stop the polling interval.
    destroyPoeMeter() {
        if (this._poePollingInterval) {
            this.homey.clearInterval(this._poePollingInterval);
            this._poePollingInterval = null;
        }
    }

    // Extract the upstream switch MAC + port from whichever field layout UniFi uses,
    // and store on the instance so the device:sync handler can look us up.
    updatePoeUplink(payload) {
        if (payload.sw_mac && payload.sw_port) {
            // Client devices (cable-client)
            this._swMac = payload.sw_mac;
            this._swPort = payload.sw_port;
        } else if (payload.uplink && payload.uplink.uplink_mac && payload.uplink.uplink_remote_port) {
            // Infrastructure devices (access-point, network-switch).
            // _fetchPoeData will confirm whether the port actually delivers PoE; if not,
            // it removes any stale capabilities left over from previous runs.
            this._swMac = payload.uplink.uplink_mac;
            this._swPort = payload.uplink.uplink_remote_port;
        }
    }

    // One-time API lookup on boot to seed the initial PoE readings.
    // Also cleans up stale PoE capabilities on devices that are not actually PoE-powered
    // (e.g. a mains-powered switch whose upstream port has port_poe: false).
    async _fetchPoeData(swMac, swPort) {
        try {
            const devices = await this.homey.app.api.unifi.getAccessDevices(swMac);
            const sw = devices.find(d => d.mac === swMac);
            if (!sw || !sw.port_table) return;
            const port = sw.port_table[swPort - 1];
            if (!port || !port.port_poe) {
                // Upstream port is not a PoE port — this device is not PoE-powered.
                // Remove any stale PoE capabilities left over from a previous buggy run.
                await this._removePoeCapabilities();
                // Clear uplink tracking so polling stops trying
                this._swMac = null;
                this._swPort = null;
                return;
            }
            if (typeof port.poe_power === 'undefined') return; // No reading yet; polling will retry
            await this._ensurePoeCapabilities();
            this.onPoeUpdate(port);
        } catch (error) {
            this.homey.app.debug(error);
        }
    }

    // Add the four PoE capabilities sequentially.
    // Homey SDK can error if you fire multiple addCapability calls in parallel.
    // Throws on failure so _fetchPoeData can catch it cleanly rather than silently
    // leaving capabilities half-added and setCapabilityValue calls failing.
    async _ensurePoeCapabilities() {
        for (const cap of ['measure_power', 'measure_voltage', 'measure_current', 'meter_power']) {
            if (!this.hasCapability(cap)) {
                await this.addCapability(cap);
            }
        }
    }

    // Remove PoE capabilities that were incorrectly added (e.g. when a previous bug caused
    // a mains-powered device to be treated as PoE-powered).
    async _removePoeCapabilities() {
        for (const cap of ['measure_power', 'measure_voltage', 'measure_current', 'meter_power']) {
            if (this.hasCapability(cap)) {
                this.log(`removing stale PoE capability '${cap}' from ${this.getName()}`);
                await this.removeCapability(cap).catch(this.error);
            }
        }
    }

    // Update all four PoE capability values from a UniFi port_table entry.
    // Called from _fetchPoeData (boot) and the device:sync handler in app.js (real-time).
    onPoeUpdate(port) {
        const watts = parseFloat(port.poe_power  || '0');
        const volts = parseFloat(port.poe_voltage || '0');
        const amps  = parseFloat(port.poe_current || '0') / 1000; // UniFi reports mA; Homey wants A

        // Accumulate kWh — skip the gap while the app was not running (_lastPowerTs === null)
        const now = Date.now();
        if (this._lastPowerTs !== null) {
            const hoursElapsed = (now - this._lastPowerTs) / 3600000;
            this._meterPower += (watts / 1000) * hoursElapsed;
            this.setStoreValue('meter_power', this._meterPower).catch(this.error);
        }
        this._lastPowerTs = now;

        if (this.hasCapability('measure_power'))  this.setCapabilityValue('measure_power',  watts).catch(this.error);
        if (this.hasCapability('measure_voltage')) this.setCapabilityValue('measure_voltage', volts).catch(this.error);
        if (this.hasCapability('measure_current')) this.setCapabilityValue('measure_current', amps).catch(this.error);
        if (this.hasCapability('meter_power'))     this.setCapabilityValue('meter_power',     this._meterPower).catch(this.error);
    }
};

module.exports = PoePowerMixin;
