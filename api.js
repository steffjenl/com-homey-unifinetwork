'use strict';

const Homey = require('homey');

module.exports = [
    {
        method: 'POST',
        path: '/settings/validate',
        fn(args, callback) {
            Homey.app.api.login(args.body.hostname, args.body.port, args.body.username, args.body.password, args.body.useproxy)
                .then(result => {
                    return callback(null, result);
                })
                .catch(error => {
                    callback(error);
                });
        },
    },
    {
        method: 'GET',
        path: '/sites',
        fn: function (args, callback) {
            let _default_list = [{'name': 'default', 'desc': 'default'}];

            Homey.app.api.getSites().then(res => {
                callback(null, res.data);
            })
                .catch(err => {
                    callback(err, _default_list)
                });
        }
    },
];
