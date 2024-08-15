'use strict';

const { Device } = require('homey');

class NetworkSwitchDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    await this._createMissingCapabilities();
    await this.getDeviceStatus();

    this.registerCapabilityListener("poe", async (value) => {
      this.homey.app.debug(`${JSON.stringify(value)}`);
      if (value) {

      }

    });

    this.log('Network-Switch has been initialized');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Network-Switch has been added');
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

    if (!this.hasCapability('ipAddress')) {
      this.addCapability('ipAddress');
      this.homey.app.debug(`created capability ipAddress for ${this.getName()}`);
    }

    if (!this.hasCapability('connected')) {
      this.addCapability('connected');
      this.homey.app.debug(`created capability connected for ${this.getName()}`);
    }

    if (!this.hasCapability('ports')) {
      this.addCapability('ports');
      this.homey.app.debug(`created capability ports for ${this.getName()}`);
    }

    if (this.homey.app.loggedIn === true) {
      this.homey.app.api.unifi.getAccessDevices(this.getData().id).then(device => {
        if (typeof device[0].port_table !== 'undefined') {
          for (let i = 1; i < device[0].port_table.length + 1; i++) {
            this.homey.app.debug(`${device[0].port_table.length} Searching Capability for ${device[0].port_table[i - 1].name} for ${this.getName()}`);

            if (!this.hasCapability('port.port_' + i)) {
              this.addCapability('port.port_' + i);
              this.homey.app.debug(`created capability port_${i} for ${this.getName()}`);
              new Promise(r => setTimeout(r, 500));
            }

            if (device[0].port_table[i - 1].port_poe === true) {
              if (!this.hasCapability('poe.port_' + i)) {
                this.addCapability('poe.port_' + i);
                this.homey.app.debug(`created capability poe_${i} for ${this.getName()}`);
                new Promise(r => setTimeout(r, 500));
              }
            }

          }
        }
      }).catch(error => this.homey.app.debug(error));
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

  onUPChange(data, port) {
    this.homey.app.debug(`onUPChange ${data} for port ${port}`);
    if (this.hasCapability('port.port_' + port)) {
      this.setCapabilityValue('port.port_' + port, data);
    }
  }

  onPOEChange(data, port) {
    if (this.hasCapability('poe.port_' + port)) {
      this.setCapabilityValue('poe.port_' + port, data);
    }
  }

  onAmountPortsChange(data) {
    if (this.hasCapability('ports')) {
      this.setCapabilityValue('ports', data);
    }
  }

  getDeviceStatus() {
    if (this.homey.app.loggedIn === true) {
      this.homey.app.api.unifi.getAccessDevices(this.getData().id).then(device => {
        if (typeof device[0].ip !== 'undefined') {
          this.onIPChange(device[0]);
        }

        if (typeof device[0].port_table !== 'undefined') {

          this.onAmountPortsChange(device[0].port_table.length);

          for (let i = 1; i < device[0].port_table.length + 1; i++) {

            if (typeof device[0].port_table[i - 1].up !== 'undefined') {
              this.homey.app.debug('onUPChange');
              this.onUPChange(device[0].port_table[i - 1].up, i);
            }

            if (typeof device[0].port_table[i - 1].poe_enable !== 'undefined') {
              this.homey.app.debug('onPOEChange');
              this.onPOEChange(device[0].port_table[i - 1].poe_enable, i);
            }
          }
        }

      }).catch(error => this.homey.app.debug(error));
    }
  }

  onUpdateMessagePayload(playloadMessage) {
    if (typeof playloadMessage.ip !== 'undefined') {
      this.onIPChange(playloadMessage);
    }

  }
}

module.exports = NetworkSwitchDevice;
