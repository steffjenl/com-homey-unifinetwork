module.exports = {
    async getSites({homey, query}) {
        const result = await homey.app.api.unifi.getSites();
        return result;
    }
};
