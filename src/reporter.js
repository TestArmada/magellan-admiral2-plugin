var Q = require("q");
var fetch = require("node-fetch");

function Reporter() {
}

var ADMIRAL_URL = process.env.ADMIRAL_URL;
var ADMIRAL_PROJECT = process.env.ADMIRAL_PROJECT;
var ADMIRAL_PHASE = process.env.ADMIRAL_PHASE;
var ADMIRAL_RUN = process.env.ADMIRAL_RUN_ID;

Reporter.prototype = {

  initialize: function () {
    var deferred = Q.defer();

    console.log("Magellan Admiral2 reporter initializing with settings:");
    console.log("      URL: " + ADMIRAL_URL);
    console.log("  project: " + ADMIRAL_PROJECT);
    console.log("    phase: " + ADMIRAL_PHASE);

    // NOTE: Both of these conditions assume that the *project* and *phase* already exist.

    if (ADMIRAL_RUN) {

      if (ADMIRAL_RUN.indexOf("\"") > -1) {
        ADMIRAL_RUN = ADMIRAL_RUN.split("\"").join("");
      }

      // This magellan instance is contributing to a pre-existing (i.e. scaled) run
      deferred.resolve();

    } else {

      // We're starting a new run
      fetch(ADMIRAL_URL + "api/project/" + ADMIRAL_PROJECT + "/" + ADMIRAL_PHASE + "/run", {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({ name: "run " + Math.round(Math.random() * 99999999999).toString(16) })
        })
        .then(function(res) {
          return res.json();
        })
        .then(function(json) {
          ADMIRAL_RUN = json._id;
          console.log("Got admiral run id: " + ADMIRAL_RUN);
          deferred.resolve();
        })
        .catch(function (e) {
          console.log("Exception while initializing run with admiral2: ");
          console.log(e);
          deferred.reject();
        })

    }

    return deferred.promise;
  },

  listenTo: function (testRun, test, source) {
    // Every time a message is received regarding this test, we also get the test object itself so
    // that we're able to reason about retries, worker index, etc.
    source.addListener("message", this._handleMessage.bind(this, test));
  },

  _handleMessage: function (test, message) {
    // console.log("admiral reporter received message: ");
    // console.log(message);

    if (message.type === "worker-status") {
      if (message.status === "started") {
        // An individual test has started running

        if (test.attempts === 0) {
          console.log("Test starting: " + message.name + " in environment: "
            + test.browser.browserId);
        } else {
          // Admiral1 didn't support signaling that a retry had actually *started*. It only
          // supports the notion of a retry being *queued* at time of failure. See below for more.
        }

      } else if (message.status === "finished") {
        // An individual test has finished running

        // This is an URL for an external BaaS or DaaS system, like Saucelabs, browserstack, etc.
        // It is possible for this to be non-existent because sometimes tests fail well before
        // they've been able to establish a connection to the BaaS provider.
        var resultURL = "";
        if (message.metadata) {
          resultURL = message.metadata.resultURL ? message.metadata.resultURL : "";
        }

        var result = {
          test: message.name,
          environments: {}
        };

        if (message.passed) {
          // We've finished a test and it passed!
          result.environments[test.browser.browserId] = {
            status: "pass",
            retries: test.attempts,
            resultURL
          };
        } else if (test.attempts === test.maxAttempts - 1) {
          // Is this our last attempt ever? Then mark the test as finished and failed.
          result.environments[test.browser.browserId] = {
            status: "fail",
            retries: test.attempts,
            resultURL
          };
        } else {
          // We've failed a test and we're going to retry it
          result.environments[test.browser.browserId] = {
            status: "retry",
            retries: test.attempts,
            resultURL
          };
        }

        console.log("Sending to: " + ADMIRAL_URL + "api/result/" + ADMIRAL_RUN);
        console.log("Sending result object: ", JSON.stringify(result, null, 2));

        fetch(ADMIRAL_URL + "api/result/" + ADMIRAL_RUN, {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify(result)
        })
        .then(function(res) {
          console.log("parse json from /result");
          return res.json();
        })
        .then(function(json) {
          console.log("got json back from /result:", json);
        })
        .catch(function (e) {
          console.log("Exception while sending data to admiral2: ");
          console.log(e);
          deferred.reject();
        })

      }
    }
  },

  flush: function () {
    // This runs only once and only at the very end when we're shutting down all the reporters
    console.log("In flush(). Admiral2 reporter saying bye.");
  }
};

module.exports = Reporter;
