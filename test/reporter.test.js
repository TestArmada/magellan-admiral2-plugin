var assert = require('assert');
var nock = require('nock');

var SESSION_ID = '602f68f15d07475b9041d259a411105c';
var ADMIRAL_URL = 'http://www.admiralNock.com/';
var ADMIRAL_RUN_ID = '1';
var ADMIRAL_CI_BUILD_URL = 'http://www.admiralresults.com/';

describe('Reporter', function() {

  var reporter;

  before(function() {
    // This probably won't work if reporter was already loaded without these env being set
    process.env.ADMIRAL_URL = ADMIRAL_URL;
    process.env.ADMIRAL_RUN_ID = ADMIRAL_RUN_ID;
    process.env.ADMIRAL_CI_BUILD_URL = ADMIRAL_CI_BUILD_URL;
    var Reporter = require('../src/reporter');
    reporter = new Reporter();
    reporter.results = {};
  });

  after(function() {
    nock.cleanAll();
  });

  it('should have status=pass with sessionId', function(done) {

    var admiralNock = nock(ADMIRAL_URL)
                .filteringRequestBody(function(body) {
                  var content = JSON.parse(body);
                  assert.equal('pass', content.environments.master.status);
                  assert.equal(ADMIRAL_CI_BUILD_URL, content.environments.master.resultURL);
                  assert.equal(SESSION_ID, content.environments.master.sessionId);
                  done();
                  return body;
                })
                .post('/api/result/'+ADMIRAL_RUN_ID)
                .reply(200, {});

    reporter._handleMessage({
      profile: {
        id: 'master'
      }
    }, {
      type: 'worker-status', 
      status: 'finished',
      passed: true,
      metadata: {
        sessionId: SESSION_ID
      }
    });
    admiralNock.done();
  });

  it('should have status=retry with sessionId', function(done) {

    var admiralNock = nock(ADMIRAL_URL)
                .filteringRequestBody(function(body) {
                  var content = JSON.parse(body);
                  assert.equal('retry', content.environments.master.status);
                  assert.equal(ADMIRAL_CI_BUILD_URL, content.environments.master.resultURL);
                  assert.equal(SESSION_ID, content.environments.master.sessionId);
                  done();
                  return body;
                })
                .post('/api/result/'+ADMIRAL_RUN_ID)
                .reply(200, {});

    reporter._handleMessage({
      profile: {
        id: 'master'
      }
    }, {
      type: 'worker-status', 
      status: 'finished',
      passed: false,
      metadata: {
        sessionId: SESSION_ID
      }
    });
    admiralNock.done();
  });

  it('should have status=pass with no sessionId', function(done) {

    var admiralNock = nock(ADMIRAL_URL)
                .filteringRequestBody(function(body) {
                  var content = JSON.parse(body);
                  assert.equal('pass', content.environments.master.status);
                  assert.equal(ADMIRAL_CI_BUILD_URL, content.environments.master.resultURL);
                  assert.equal(null, content.environments.master.sessionId);
                  done();
                  return body;
                })
                .post('/api/result/'+ADMIRAL_RUN_ID)
                .reply(200, {});

    reporter._handleMessage({
      profile: {
        id: 'master'
      }
    }, {
      type: 'worker-status', 
      status: 'finished',
      passed: true,
      metadata: {

      }
    });
    admiralNock.done();
  });

  it('should handle error stack on fail', function(done) {

    var admiralNock = nock(ADMIRAL_URL)
                .filteringRequestBody(function(body) {
                  var content = JSON.parse(body);
                  assert.equal('fail', content.environments.master.status);
                  assert.equal('ERROR_STACK', content.environments.master.log);
                  done();
                  return body;
                })
                .post('/api/result/'+ADMIRAL_RUN_ID)
                .reply(200, {});

    var test = {
      profile: {
        id: 'master'
      },
      maxAttempts: 2,
      attempts: 1,
      stdout:''
    };
    var message ={
      type: 'worker-status',
      status: 'finished',
      passed: false,
      metadata: {}
    }
    var source = {
      addListener: function(m, method){
        method(message);
      },
      stdout:{
        on: function(data, fn){
          fn('ERROR_STACK');
        }
      }
    };

    reporter.listenTo({}, test, source);

    admiralNock.done();
  });

  it('should not have error stack on success', function(done) {

    var admiralNock = nock(ADMIRAL_URL)
                .filteringRequestBody(function(body) {
                  var content = JSON.parse(body);
                  assert.equal('pass', content.environments.master.status);
                  assert.ok(!content.environments.master.log,"Expected no error, but error was: " + content.environments.master.log);
                  done();
                  return body;
                })
                .post('/api/result/'+ADMIRAL_RUN_ID)
                .reply(200, {});

    var test = {
      profile: {
        id: 'master'
      },
      maxAttempts: 2,
      attempts: 1,
      stdout:''
    };
    var message ={
      type: 'worker-status',
      status: 'finished',
      passed: true,
      metadata: {}
    }
    var source = {
      addListener: function(m, method){
        method(message);
      },
      stdout:{
        on: function(data, fn){
          fn('ERROR_STACK');
        }
      }
    };

    reporter.listenTo({}, test, source);

    admiralNock.done();
  });

});