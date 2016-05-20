var tap = require('tap')
var sinon = require('sinon')
var mockery = require('./mockery/xmpp-client.mockery')
var GCMClient = require('../node-gcm-ccs')

tap.beforeEach(mockery.setUp)
tap.afterEach(mockery.tearDown)

tap.test('propagates `error` event', (t) => {
  var gcm = new GCMClient()
  var spy = sinon.spy()
  gcm.on('error', spy)

  gcm.emit('error', new Error())

  t.ok(spy.called)

  t.end()
})

tap.test('emits `connected` event, when xmpp connection has been established', (t) => {
  var gcm = new GCMClient()
  var spy = sinon.spy()
  gcm.on('connected', spy)

  gcm.client.connect()
  t.ok(spy.called)

  t.end()
})

tap.test('emits `close` event, when xmpp connection has been closed', (t) => {
  var gcm = new GCMClient()
  var spy = sinon.spy()
  gcm.on('disconnected', spy)

  gcm.client.connect()
  gcm.client.end()

  t.ok(spy.called)

  t.end()
})

tap.test('sends a message', (t) => {
  t.autoend()

  var gcm = new GCMClient()
  var token = '123'
  var message = {}

  t.test('returns a callback function if callback was provided', (t) => {
    var promise = gcm.send(token, message, {}, function () {})
    t.ok(promise instanceof Function)
    t.end()
  })

  t.test('returns a promise if no callback was provided', (t) => {
    var promise = gcm.send(token, message, {})
    t.ok(promise instanceof Promise)
    t.end()
  })
})
