const ApiClient = require("./library/apiclient");
const ErrorHandler = require("./library/error-handler");
module.exports = {
    async getSites({homey, query}) {
        const result = await homey.app.api.unifi.getSites();
        return result;
    },
    async getStatus({ homey, query }) {
        if (homey.app.connectionState) {
            return homey.app.connectionState;
        }
        return (homey.app.loggedIn ? 'Connected' : 'Disconnected');
    },
    async getWebsocketStatus({ homey, query }) {
        if (!homey.app.api.websocket) {
            return 'Disabled';
        }
        return homey.app.api.websocket.isWebsocketConnected() ? 'Connected' : 'Unknown';
    },
    async getLastWebsocketMessageTime({ homey, query }) {
        if (!homey.app.api.websocket) {
            return 'N/A';
        }
        return homey.app.api.websocket.getLastWebsocketMessageTime();
    },
    async testCredentials({homey, body}) {
        try {
            const api = new ApiClient({homey});
            api.setUnifiObject(body.host, body.port, body.user, body.pass, body.site);
            await api.unifi.login(body.user, body.pass);
            await api.unifi.getAccessDevices();
            await api.unifi.getClientDevices();
            await api.unifi.getAllUsers();
            await api.unifi.logout();

            return {
                status: 'success',
            };
        } catch (error) {
            homey.app.error('testCredentials error', error.message);
            return {
                status: 'failure',
                error: ErrorHandler.getUserFriendlyMessage(error, homey),
            };
        }
    },
    async testApiKey({homey, body}) {
        try {
            if (!body.apiKey) {
                throw new Error('API key is required for Network V2');
            }
            if (body.cloudEnabled && !body.consoleId) {
                throw new Error('Console ID is required when UniFi Cloud is enabled');
            }
            const api = new ApiClient({homey});
            api.setApiKey(body.apiKey, body.host, body.port, {
                cloudEnabled: !!body.cloudEnabled,
                consoleId: body.consoleId || '',
            });
            const result = await api._callV1('GET', '/sites');
            const sites = Array.isArray(result) ? result : (Array.isArray(result && result.data) ? result.data : null);
            if (!sites) {
                throw new Error(result && result.message ? result.message : 'Unexpected response from controller');
            }

            return {
                status: 'success',
            };
        } catch (error) {
            homey.app.error('testApiKey error', error.message);
            return {
                status: 'failure',
                error: ErrorHandler.getUserFriendlyMessage(error, homey),
            };
        }
    },
    async getApiKeyStatus({homey, query}) {
        if (!homey.app.isV2Available()) return 'Disconnected';
        return homey.app.isCloudApiEnabled() ? 'Connected (Cloud)' : 'Connected';
    }
};
