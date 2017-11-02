var Q = require("q");
var _ = require("lodash");
var fetchFn = require("node-fetch");
var logger = require("./logger");

function Reporter() {
}

var ADMIRAL_URL = process.env.ADMIRAL_URL;
var ADMIRAL_UI_URL = process.env.ADMIRAL_UI_URL;
var ADMIRAL_PROJECT = process.env.ADMIRAL_PROJECT;
var ADMIRAL_PHASE = process.env.ADMIRAL_PHASE;

// Optional
var ADMIRAL_RUN = process.env.ADMIRAL_RUN_ID;
var ADMIRAL_CI_BUILD_URL = process.env.ADMIRAL_CI_BUILD_URL;
var ADMIRAL_RUN_DISPLAY_NAME = process.env.ADMIRAL_RUN_DISPLAY_NAME;
var ADMIRAL_LOGIN = process.env.ADMIRAL_LOGIN;
var ADMIRAL_PASSWORD = process.env.ADMIRAL_PASSWORD;
var isSharded = process.env.ADMIRAL_RUN_ID ? true : false;

var fetch = function (url, options) {
  logger.debug("Fetch(" + url + ") with options: \n" + JSON.stringify(options,null,2));
  return fetchFn(url, options);
};

var auth = function () {
  if (ADMIRAL_LOGIN !== null && ADMIRAL_PASSWORD !== null) {
    return `Basic ${new Buffer(`${ADMIRAL_LOGIN}:${ADMIRAL_PASSWORD}`).toString('base64')}`;
  }
   return null; 
}

var headers = function () {
  var result = { "Content-Type": "application/json"};
  if (auth()) {
    result.authorization = auth();
  }
  return result;
}

Reporter.prototype = {

  initialize: function () {
    var deferred = Q.defer();
    var self = this;

    this.ignoreMessages = false;
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

    if (!ADMIRAL_URL) {

      this.ignoreMessages = true;
      logger.err("ADMIRAL_URL needs to be an absolute url");
      logger.warn("All following messages would be ignored");
      deferred.reject();

    } else if (!ADMIRAL_UI_URL) {

      this.ignoreMessages = true;
      logger.err("ADMIRAL_UI_URL needs to be an absolute url");
      logger.warn("All following messages would be ignored");
      deferred.reject();

    } else if (!ADMIRAL_PROJECT) {

      this.ignoreMessages = true;
      logger.err("ADMIRAL_PROJECT cannot be null or undefined");
      logger.warn("All following messages would be ignored");
      deferred.reject();
    } else if (!ADMIRAL_PHASE) {

      this.ignoreMessages = true;
      logger.err("ADMIRAL_PHASE cannot be null or undefined");
      logger.warn("All following messages would be ignored");
      deferred.reject();
    } else {

      logger.log("Admiral2 reporter initializing" + (isSharded ? " in sharded mode " : " ") + "with settings:");
      logger.log("  URL: " + ADMIRAL_URL);
      logger.log("  project: " + ADMIRAL_PROJECT);
      logger.log("  phase: " + ADMIRAL_PHASE);

      if (isSharded) {
        logger.log("  run (shard): " + ADMIRAL_RUN);
      }

      // Bootstrap this project if it doesn't already exist
      fetch(ADMIRAL_URL + "api/project/" + encodeURIComponent(ADMIRAL_PROJECT), {
        headers: headers(),
        method: "POST",
        body: JSON.stringify({})
      })
        .then(function (res) {
          logger.debug("Response JSON from " + ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT + ":\n" + JSON.stringify(res.json(), null, 2));

          // Bootstrap this phase if it doesn't already exist
          fetch(ADMIRAL_URL + "api/project/" + encodeURIComponent(ADMIRAL_PROJECT) + "/" + encodeURIComponent(ADMIRAL_PHASE), {
            headers: headers(),
            method: "POST",
            body: JSON.stringify({})
          })
            .then(function (res) {
              logger.debug("Response JSON from " + ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT + "/" + ADMIRAL_PHASE + ":\n" + JSON.stringify(res.json(), null, 2));

              // Bootstrap a new run or assume an existing run
              fetch(ADMIRAL_URL + "api/project/" + encodeURIComponent(ADMIRAL_PROJECT) + "/" + encodeURIComponent(ADMIRAL_PHASE) + "/run", {
                headers: headers(),
                method: "POST",
                body: JSON.stringify(self.runOptions)
              })
                .then(function (res) {
                  const json = res.json();
                  logger.debug("Response JSON from " + ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT + "/" + ADMIRAL_PHASE + "/run" + ":\n" + JSON.stringify(json, null, 2));
                  return json;
                })
                .then(function (json) {
                  // NOTE: We no longer set ADMIRAL_RUN to json._id
                  // We ignore id that comes back since we're using our own ADMIRAL_RUN value and assuming sharding
                  if (!isSharded) {
                    ADMIRAL_RUN = json._id;
                    logger.log("Got admiral run id: " + ADMIRAL_RUN);
                  } else {
                    logger.log("Assumed admiral run id (in sharded mode): " + json._id);
                  }
                  return deferred.resolve();
                })
                .catch(function (e) {
                  self.ignoreMessages = true;
                  logger.err("Exception while initializing run with Admiral2: ");
                  logger.err(e);
                  logger.warn("All following messages would be ignored");
                  return deferred.reject();
                });
            })
            .catch(function (e) {
              self.ignoreMessages = true;
              logger.err("Exception while initializing run with Admiral2: ");
              logger.err(e);
              logger.warn("All following messages would be ignored");
              return deferred.reject();
            });
        })
        .catch(function (e) {
          self.ignoreMessages = true;
          logger.err("Exception while initializing run with Admiral2: ");
          logger.err(e);
          logger.warn("All following messages would be ignored");
          return deferred.reject();
        });
    }

    return deferred.promise;
  },

  listenTo: function (testRun, test, source) {
    // Every time a message is received regarding this test, we also get the test object itself so
    // that we're able to reason about retries, worker index, etc.
    if(source && source.stdout){
      source.stdout.on("data", function (chunk) {
        test.stdout += chunk.toString('utf8');
      });
    }
    source.addListener("message", this._handleMessage.bind(this, test));
  },

  _handleMessage: function (test, message) {
    var self = this;

    if (this.ignoreMessages) {
      logger.debug("message ignored");
      return;
    }

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

        // Get SauceLabs session id for this test session
        var sessionId = message.metadata && message.metadata.sessionId;

        var result = {
          test: message.name,
          environments: {
            [test.profile.id]: {
              retries: test.attempts,
              resultURL,
              sessionId
            }
          }
        };

        if (message.passed) {
          // We've finished a test and it passed!
          result.environments[test.profile.id].status = "pass";
        } else if (test.attempts === test.maxAttempts - 1) {
          // Is this our last attempt ever? Then mark the test as finished and failed.
          result.environments[test.profile.id].status = "fail";
          result.environments[test.profile.id].error = test.stdout;
        } else {
          // We've failed a test and we're going to retry it
          result.environments[test.profile.id].status = "retry";
        }

        if (!self.results[message.name]) {
          self.results[message.name] = {};
        }
        _.merge(self.results[message.name], result.environments);

        logger.debug("Sending to: " + ADMIRAL_URL + "api/result/" + ADMIRAL_RUN);
        logger.debug("Sending result object: ", JSON.stringify(result, null, 2));

        fetch(ADMIRAL_URL + "api/result/" + encodeURIComponent(ADMIRAL_RUN), {
          headers: headers(),
          method: "POST",
          body: JSON.stringify(result)
        })
          .then(function (res) {
            const json = res.json();
            logger.debug("Response JSON from " + ADMIRAL_URL + "api/result/" + ADMIRAL_RUN + ":\n" + JSON.stringify(json, null, 2));
            return json;
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

    if (this.ignoreMessages) {
      logger.debug("flush ignored");
      deferred.resolve();
    } else {
      // finalize test run status
      self.runOptions.result = "pass";

      _.forEach(self.results, function (value) {
        _.forEach(value, function (innerValue) {
          if (innerValue.status === "fail") {
            self.runOptions.result = "fail";
          }
        });
      });

      fetch(ADMIRAL_URL + "api/project/" + encodeURIComponent(ADMIRAL_PROJECT) + "/" + encodeURIComponent(ADMIRAL_PHASE) + "/run/" + encodeURIComponent(ADMIRAL_RUN) + "/finish", {
        headers: headers(),
        method: "POST",
        body: JSON.stringify(self.runOptions)
      })
        .then(function (res) {
          const json = res.json();
          logger.debug("Response JSON from " + ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT + "/" + ADMIRAL_PHASE + "/run/" + ADMIRAL_RUN + "/finish" + ":\n" + JSON.stringify(json, null, 2));

          var reportURL = ADMIRAL_UI_URL + "run/" + ADMIRAL_RUN;
          logger.log("Visualized test suite results available at: " + reportURL);
          return deferred.resolve();
        })
        .catch(function (e) {
          logger.err("Exception while finalizing run with Admiral2: ");
          logger.err(e);
          return deferred.reject();
        });
    }

    return deferred.promise;
  }
};

module.exports = Reporter;
