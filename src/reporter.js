var Q = require("q");

function Reporter() {}

Reporter.prototype = {
  initialize: function() {
    var deferred = Q.defer();

    deferred.resolve();

    return deferred.promise;
  },

  listenTo: function(testRun, test, source) {
    /* noop */
  },

  _handleMessage: function(test, message) {
    /* noop */
  },

  flush: function() {
    var deferred = Q.defer();

    deferred.resolve();

    return deferred.promise;
  }
};

module.exports = Reporter;
