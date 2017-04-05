var Q = require("q");
var _ = require("lodash");
var fetch = require("node-fetch");
var logger = require("./logger");

function Reporter() {
}

var ADMIRAL_URL = process.env.ADMIRAL_URL;
var ADMIRAL_PROJECT = process.env.ADMIRAL_PROJECT;
var ADMIRAL_PHASE = process.env.ADMIRAL_PHASE;

// Optional
var ADMIRAL_RUN = process.env.ADMIRAL_RUN_ID;
var ADMIRAL_CI_BUILD_URL = process.env.ADMIRAL_CI_BUILD_URL;
var ADMIRAL_RUN_DISPLAY_NAME = process.env.ADMIRAL_RUN_DISPLAY_NAME;
var isSharded = process.env.ADMIRAL_RUN_ID ? true : false;

Reporter.prototype = {

  initialize: function () {
    var deferred = Q.defer();
    var self = this;

    this.results = {};
    this.runOptions = {
      name: ADMIRAL_RUN_DISPLAY_NAME || ("run " + Math.round(Math.random() * 99999999999).toString(16)),
      result: "pending"
    };

    if (isSharded) {
      // Force the run id if we are participating in a build where multiple shards
      // contribute to the same Admiral2 run result.
      this.runOptions._id = ADMIRAL_RUN;
    }

    logger.log("Admiral2 reporter initializing" + (isSharded ? " in sharded mode " : " ")+ "with settings:");
    logger.log("{");
    logger.log("  URL: " + ADMIRAL_URL);
    logger.log("  project: " + ADMIRAL_PROJECT);
    logger.log("  phase: " + ADMIRAL_PHASE);
    
    if (isSharded) {
      logger.log(" run (shard): " + ADMIRAL_RUN);
    }

    logger.log("}");

    // Bootstrap this project if it doesn't already exist
    fetch(ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT, {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({})
      })
      .then(function(res) {

        // Bootstrap this phase if it doesn't already exist
        fetch(ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT + "/" + ADMIRAL_PHASE, {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({})
        })
        .then(function(res) {
        
          // Bootstrap a new run or assume an existing run
          fetch(ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT + "/" + ADMIRAL_PHASE + "/run", {
              headers: { "Content-Type": "application/json" },
              method: "POST",
              body: JSON.stringify(self.runOptions)
            })
            .then(function(res) {
              return res.json();
            })
            .then(function(json) {
              // NOTE: We no longer set ADMIRAL_RUN to json._id
              // We ignore id that comes back since we're using our own ADMIRAL_RUN value and assuming sharding
              if (!isSharded) {
                ADMIRAL_RUN = json._id;
                logger.log("Got admiral run id: " + ADMIRAL_RUN);
              } else {
                logger.log("Assumed admiral run id (in sharded mode): " + json._id);
              }
              deferred.resolve();
            })
            .catch(function (e) {
              logger.err("Exception while initializing run with Admiral2: ");
              logger.err(e);
              deferred.reject();
            });

          return res.json();
        });
        
        return res.json();
      });


    return deferred.promise;
  },

  listenTo: function (testRun, test, source) {
    // Every time a message is received regarding this test, we also get the test object itself so
    // that we're able to reason about retries, worker index, etc.
    source.addListener("message", this._handleMessage.bind(this, test));
  },

  _handleMessage: function (test, message) {
    var self = this;

    if (message.type === "worker-status") {
      if (message.status === "started") {
        // An individual test has started running

        if (test.attempts === 0) {
          logger.debug("Test starting: " + message.name + " in environment: "
            + test.profile.id);
        } else {
          // Admiral1 didn't support signaling that a retry had actually *started*. It only
          // supports the notion of a retry being *queued* at time of failure. See below for more.
        }

      } else if (message.status === "finished") {
        // An individual test has finished running
        var resultURL = ADMIRAL_CI_BUILD_URL || "";

        // This is an URL for an external BaaS or DaaS system, like Saucelabs, browserstack, etc.
        // It is possible for this to be non-existent because sometimes tests fail well before
        // they've been able to establish a connection to the BaaS provider.
        var sauceURL = "";
        if (message.metadata) {
          sauceURL = message.metadata.resultURL ? message.metadata.resultURL : "";
        }

        var result = {
          test: message.name,
          environments: {}
        };

        if (message.passed) {
          // We've finished a test and it passed!
          result.environments[test.profile.id] = {
            status: "pass",
            retries: test.attempts,
            resultURL,
            sauceURL
          };
        } else if (test.attempts === test.maxAttempts - 1) {
          // Is this our last attempt ever? Then mark the test as finished and failed.
          result.environments[test.profile.id] = {
            status: "fail",
            retries: test.attempts,
            resultURL,
            sauceURL
          };
        } else {
          // We've failed a test and we're going to retry it
          result.environments[test.profile.id] = {
            status: "retry",
            retries: test.attempts,
            resultURL,
            sauceURL
          };
        }

        if(!self.results[message.name]){
          self.results[message.name] = {};
        }
        _.merge(self.results[message.name], result.environments);

        logger.debug("Sending to: " + ADMIRAL_URL + "api/result/" + ADMIRAL_RUN);
        logger.debug("Sending result object: ", JSON.stringify(result, null, 2));

        fetch(ADMIRAL_URL + "api/result/" + ADMIRAL_RUN, {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify(result)
        })
        .then(function(res) {
          logger.debug("parse json from /result");
          return res.json();
        })
        .then(function(json) {
          logger.debug("got json back from /result:", json);
        })
        .catch(function (e) {
          logger.err("Exception while sending data to admiral2: ");
          logger.err(e);
        })

      }
    }
  },

  flush: function () {
    // This runs only once and only at the very end when we're shutting down all the reporters
    var deferred = Q.defer();
    var self = this;

    // finalize test run status
    self.runOptions.result = "pass";

    _.forEach(self.results, function(value){
      _.forEach(value, function(innerValue){
        if(innerValue.status === "fail"){
          self.runOptions.result = "fail";
        }
      });
    });

    fetch(ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT + "/" + ADMIRAL_PHASE + "/run/" + ADMIRAL_RUN + "/finish", {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify(self.runOptions)
    })
    .then(function (res) {
      var reportURL = ADMIRAL_URL + "run/" + ADMIRAL_RUN;
      logger.log("Visual report matrix available at: " + reportURL);
      return deferred.resolve();
    })
    .catch(function (e) {
      logger.err("Exception while finalizing run with Admiral2: ");
      logger.err(e);
      return deferred.reject();
    });

    return deferred.promise;
  }
};

module.exports = Reporter;
