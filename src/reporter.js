var Q = require("q");
var logger = require("./logger");

function Reporter() {
}

Reporter.prototype = {

  initialize: function () {
    var deferred = Q.defer();
    logger.warn("Admiral has been decommissioned, please remove testarmada-magellan-admiral2-plugin from your dependencies");
    return deferred.resolve();
  },

  listenTo: function () {},

  flush: function () {
    // This runs only once and only at the very end when we're shutting down all the reporters
    var deferred = Q.defer();
    return deferred.resolve();
  }
};

module.exports = Reporter;
