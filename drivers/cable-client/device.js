'use strict';

const { Device } = require('homey');

class CableDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    await this._createMissingCapabilities();
    await this.getDeviceStatus();
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

    if (!this.hasCapability('onoff')) {
      this.addCapability('onoff');
      this.homey.app.debug(`created capability onoff for ${this.getName()}`);
    }

    if (!this.hasCapability('connected')) {
      this.addCapability('connected');
      this.homey.app.debug(`created capability connected for ${this.getName()}`);
    }

    if (this.hasCapability('alarm_connected')) {
      this.removeCapability('alarm_connected');
      this.homey.app.debug(`deleted capability alarm_connected for ${this.getName()}`);
    }
  }

  onIsConnected(isConnected) {
    let deviceState = this.getState();

    if (this.hasCapability('connected')) {
      this.setCapabilityValue('connected', isConnected);
    }

    if (deviceState.connected !== isConnected) {
      if (isConnected) {
        this.homey.app._cableClientConnected.trigger(this, {}, {}).catch(this.homey.app.debug);
      } else {
        this.homey.app._cableClientDisconnected.trigger(this, {}, {}).catch(this.homey.app.debug);
      }
    }
  }

  onIPChange(data) {
    if (this.hasCapability('ipAddress')) {
      this.setCapabilityValue('ipAddress', data.ip);
    }
  }

  getDeviceStatus() {
    this.homey.app.api.unifi.getClientDevice(this.getData().id).then(device => {
      if (typeof device[0].ip !== 'undefined') {
        this.onIPChange(device[0]);
      }
    }).catch(error => this.homey.app.debug(error));
  }

  onUpdateMessagePayload(playloadMessage) {
    if (typeof playloadMessage.ip !== 'undefined') {
      this.onIPChange(playloadMessage);
    }
  }
}

module.exports = CableDevice;
