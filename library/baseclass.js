'use strict';

const Homey = require('homey');
const UfvConstants = require('./constants');

class BaseClass extends Homey.SimpleClass {
    constructor(...props) {
        super(...props);
        // base constructor — subclasses extend this
    }

}

module.exports = BaseClass;
