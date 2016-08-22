var Q = require("q");

function Reporter() {
}

Reporter.prototype = {

  initialize: function () {
    //
    // TODO: Need to provide and pick up:
    //
    // Admiral auth id <-- teamnamePRverify
    // Admiral token <--- security token
    // id number for this run <--- token || kajshdflkjhasdf (may come in from the outside due to grid/sharding)
    //

    var deferred = Q.defer();
    // If we need to initialize admiral2 and get some kind of a job number or similar, do it here.
    // Q is used to allow for asynchronous operation if the reporter needs it. Magellan calls this
    // well before any tests actually start running.
    deferred.resolve();
    return deferred.promise;
  },

  listenTo: function (testRun, test, source) {
    // Every time a message is received regarding this test, we also get the test object itself so
    // that we're able to reason about retries, worker index, etc.
    source.addListener("message", this._handleMessage.bind(this, test));
  },

  _handleMessage: function (test, message) {
    console.log("admiral reporter received message: ");
    console.log(message);

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

        if (message.passed) {
          // We've finished a test and it passed!
          console.log("Test " + message.name + " has passed in environment: "
              + test.browser.browserId + " after " + test.attempts + " attempts");
        } else if (test.attempts === test.maxAttempts - 1) {
          // Is this our last attempt ever? Then mark the test as finished and failed.
          console.log("Test " + message.name + " has finally failed in environment: "
            + test.browser.browserId + " after " + test.attempts + " attempts");
        } else {
          // We've failed a test and we're going to retry it
          console.log("Test " + message.name + " has failed in environment: "
            + test.browser.browserId + " after " + test.attempts
            + " attempts, and will be retried.");
        }

      }
    }
  },

  flush: function () {
    // This runs only once and only at the very end when we're shutting down all the reporters
    console.log("In flush(). Admiral2 reporter saying bye.");
  }
};

module.exports = Reporter;