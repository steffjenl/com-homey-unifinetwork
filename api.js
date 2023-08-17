const ApiClient = require("./library/apiclient");
module.exports = {
    async getSites({homey, query}) {
        const result = await homey.app.api.unifi.getSites();
        return result;
    },

    async testCredentials({homey, body}) {

        try {
            this.api = new ApiClient({homey: this.homey});
            const console = this.api.setUnifiObject(body.host, body.port, body.user, body.pass, body.site);
            const loggedIn = await this.api.unifi.login(body.user, body.pass);
            const accessPoints = await this.api.unifi.getAccessDevices();
            const wifiDevices = await this.api.unifi.getClientDevices();
            const allUsers = await this.api.unifi.getAllUsers();
            const loggedOut = await this.api.unifi.logout();

            return {
                status: 'success',
            };
        } catch (error) {
            console.log('testCredentials error', error);
            return {
                status: 'failure',
                error: error.message,
            };
        }


        return {
            status: 'failure',
        };
    }
};
