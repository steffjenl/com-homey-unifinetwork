'use strict';

const Homey = require('homey');

class UniFiWifiDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    Homey.app.debug('UniFiWifiDriver Driver has been initialized');
  }

  onPair(socket) {
    // Validate NVR IP address
    socket.on('validate', (data, callback) => {
      const settings = Homey.ManagerSettings.get('com.ubnt.unifi.settings');
      callback(null, settings ? 'ok' : 'nok');
    });

    // Perform when device list is shown
    socket.on('list_devices', async (data, callback) => {
      callback(null, Object.values(await Homey.app.api.getWifiClients()).map(client => {
          return {
            data: {id: String(client.mac)},
            name: (typeof client.name  === 'undefined' ? (typeof client.hostname  === 'undefined' ? client.mac : client.hostname) : client.name),
          };
      }));
    });
  }

  onParseWesocketMessage(camera, payload) {
    if (Object.prototype.hasOwnProperty.call(camera, '_events')) {
      Homey.app.debug(JSON.stringify(payload));
      /*
      if (payload.hasOwnProperty('isRecording')) {
        camera.onIsRecording(payload.isRecording);
      }

      if (payload.hasOwnProperty('isMicEnabled')) {
        camera.onIsMicEnabled(payload.isMicEnabled);
      }

      if (payload.hasOwnProperty('micVolume')) {
        camera.onMicVolume(payload.micVolume);
      }

      if (payload.hasOwnProperty('isConnected')) {
        camera.onIsConnected(payload.isConnected);
      }

      if (payload.hasOwnProperty('recordingSettings') && payload.recordingSettings.hasOwnProperty('mode')) {
        camera.onRecordingMode(payload.recordingSettings.mode);
      }

      if (payload.lastMotion) {
        camera.onMotionDetected(payload.lastMotion, payload.isMotionDetected);
      }

      if (payload.lastRing) {
        camera.onDoorbellRinging(payload.lastRing);
      }

      if (payload.hasOwnProperty('isDark')) {
        camera.onIsDark(payload.isDark);
      }
       */
    }
  }
}

module.exports = UniFiWifiDriver;
