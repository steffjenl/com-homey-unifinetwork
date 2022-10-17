'use strict';

const { Device } = require('homey');

class WiFiDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    await this._createMissingCapabilities();
    await this.onUpdateMessage();
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
  async onSettings({ oldSettings, newSettings, changedKeys }) {
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
      this.setClass('sensor');
    }

    if (!this.hasCapability('wifi_name')) {
      this.addCapability('wifi_name');
      this.homey.app.debug(`created capability wifi_name for ${this.getName()}`);
    }

    if (!this.hasCapability('ap_mac')) {
      this.addCapability('ap_mac');
      this.homey.app.debug(`created capability ap_mac for ${this.getName()}`);
    }

    if (!this.hasCapability('ipAddress')) {
      this.addCapability('ipAddress');
      this.homey.app.debug(`created capability ipAddress for ${this.getName()}`);
    }

    if (!this.hasCapability('radio_proto')) {
      this.addCapability('radio_proto');
      this.homey.app.debug(`created capability radio_proto for ${this.getName()}`);
    }
  }

  onWifiChanged(data) {
    if (this.hasCapability('wifi_name')) {
      this.setCapabilityValue('wifi_name', data.essid);
    }
  }

  onIsConnected(isConnected) {
    if (this.hasCapability('alarm_connected')) {
      this.setCapabilityValue('alarm_connected', isConnected);
    }
    if (isConnected) {
      // this.homey.app._cableClientConnected.trigger();

    } else {
      this.homey.app._wifiClientDisconnected.trigger();
      // this.homey.app._clientDisconnected.trigger();
    }
  }

  onSignalChange(data) {
    if (this.hasCapability('measure_signal')) {
      const oldSignal = this.getCapabilityValue('measure_signal');
      this.setCapabilityValue('measure_signal', data.signal);
      if (data.signal !== oldSignal) {

        const tokens = {
          rssi: data.rssi,
          signal: data.signal,
          radio_proto: data.radio_proto,
          essid: data.essid
        };

        // trigger flow
        this.homey.app._wifiClientSignalChanged.trigger(tokens);
      }
    }
  }

  onRSSIChange(data) {
    if (this.hasCapability('measure_rssi')) {
      this.setCapabilityValue('measure_rssi', data.rssi);
    }
  }

  onAPChange(data) {
    if (this.hasCapability('ap_mac')) {
      const oldApMac = this.getCapabilityValue('ap_mac');
      this.setCapabilityValue('ap_mac', data.ap_mac);
      if (data.ap_mac !== oldApMac) {

        const tokens = {
          rssi: data.rssi,
          signal: data.signal,
          radio_proto: data.radio_proto,
          essid: data.essid
        };

        // trigger floaded ap
        this.homey.app._wifiClientRoamed.trigger(tokens);
        this.homey.app._wifiClientRoamedToAp.trigger(tokens);
      }
    }
  }

  onIPChange(data) {
    if (this.hasCapability('ipAddress')) {
      this.setCapabilityValue('ipAddress', data.ip);
    }
  }

  onRadioProtoChange(data) {
    if (this.hasCapability('radio_proto')) {
      this.setCapabilityValue('radio_proto', data.radio_proto);
    }
  }

  onUpdateMessage() {
    this.homey.app.debug('onUpdateMessage');
    this.homey.app.api.unifi.getClientDevice(this.getData().id).then(device => {

      this.homey.app.debug(JSON.stringify(device));

      if (typeof device[0].essid !== 'undefined') {
        this.onWifiChanged(device[0]);
        this.onIsConnected(true);
      }
      else {
        this.onIsConnected(false);
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

    }).catch(error => this.homey.app.debug(error));
  }
}

module.exports = WiFiDevice;
