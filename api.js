const ApiClient = require("./library/apiclient");
module.exports = {
    async getSites({homey, query}) {
        const result = await homey.app.api.unifi.getSites();
        return result;
    },
    async getStatus({ homey, query }) {
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
                error: error.message,
            };
        }
    }
};
