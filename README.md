# Ubiquiti UniFi Network

This app adds support for presence detection based on (wifi) clients connected to the UniFi Controller on your Homey.

## Device triggers:
- Wifi device (dis-)connected
- Wifi device roams from one Accesspoint to any another
- Wifi device roams to specific Accesspoint
- Cable device (dis-)connected

## Device conditions:
- Wifi client is (dis-)connected
- Wifi client is (dis-)connected from accesspoint
- Cable client is (dis-)connected

Please note: only paired devices are being considered as device in all flow contexts. Non-paired devices are only usable for the guest (dis-)connected trigger.


## Getting started:
- Configure settings for UniFi Controller via Homey Settings panel.
	- If you have a custom site name, then first try default as site id. Then a list of site ids will be loaded.
- Go to Devices > Add new device wizard
- Select device you want to pair with Homey.
	- It will only show devices known to your controller for the last 24 hours.

## How to create an local account?

* Login in your local UniFi web interface, and click on Admins & Users. **Note:** This must be done from your local device and not from _unifi.ui.com_ or within the app.
* Click on the '+' icon to add a new user.
* Fill in the user details, and make sure to select 'Restrict to local access only' as the user type.
* Give the user Full Management rights and click on 'Add'.

## Supported devices:
- Wifi devices connected to UniFi accesspoints, connected via UniFi Controller.

For supported accesspoints, see [UniFi download page](https://www.ubnt.com/download/unifi/) for more information.

This version has been tested against version 5.7.x up to 6.0.x of the Ubiquiti UniFi Controller software. Lower versions might work too, but is untested.

Version 6.0.x is UnifiOS, please select 'Port' 443 and 'UnifiOS Device (please use port 443)' in the settings page. Please don't use 2FA and use an local account.


## Supported Languages:
- English
- Dutch