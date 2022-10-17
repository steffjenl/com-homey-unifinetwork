'use strict';

const { Device } = require('homey');

class CableDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    await this._createMissingCapabilities();
    await this.onUpdateMessage();
    this.log('CableDevice has been initialized');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('CableDevice has been added');
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
    this.log('CableDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('CableDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('CableDevice has been deleted');
  }

  async _createMissingCapabilities() {
    if (this.getClass() !== 'sensor') {
      this.homey.app.debug(`changed class to sensor for ${this.getName()}`);
      this.setClass('sensor');
    }

    if (this.hasCapability('wifi_name')) {
      this.removeCapability('wifi_name');
      this.homey.app.debug(`removed capability wifi_name for ${this.getName()}`);
    }

    if (this.hasCapability('ap_mac')) {
      this.removeCapability('ap_mac');
      this.homey.app.debug(`removed capability ap_mac for ${this.getName()}`);
    }

    if (!this.hasCapability('ipAddress')) {
      this.addCapability('ipAddress');
      this.homey.app.debug(`created capability ipAddress for ${this.getName()}`);
    }
  }

  onIsConnected(isConnected) {
    if (this.hasCapability('alarm_connected')) {
      this.setCapabilityValue('alarm_connected', isConnected);
    }

    if (isConnected) {
      this.homey.app._cableClientConnected.trigger();
    } else {
      this.homey.app._cableClientDisconnected.trigger();
    }
  }

  onIPChange(ipAddress) {
    if (this.hasCapability('ipAddress')) {
      this.setCapabilityValue('ipAddress', ipAddress);
    }
  }

  onUpdateMessage() {
    this.homey.app.debug('onUpdateMessage');
    this.homey.app.api.unifi.getClientDevice(this.getData().id).then(device => {

      this.homey.app.debug(JSON.stringify(device));

      if (typeof device[0].ip !== 'undefined') {
        this.onIPChange(device[0].ip);
      }

    }).catch(error => this.homey.app.debug(error));
  }
}

module.exports = CableDevice;
