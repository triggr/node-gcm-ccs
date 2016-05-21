var tap = require('tap')
var sinon = require('sinon')
var mockery = require('./mockery/xmpp-client.mockery')
var xmpp = require('node-xmpp-client')
var GCMClient = require('../lib/node-gcm-ccs')

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
  gcm.end()

  t.ok(spy.called)

  t.end()
})


tap.test('handles `stanza` events from the xmpp connection', (t) => {
  t.autoend()

  var token = '123'

  t.test('handles `control` messages', (t) => {
    var gcm = new GCMClient()
    var message = new xmpp.Stanza.Element('message')
    message.c('gcm').t(JSON.stringify({
      'message_id': 1,
      'message_type': 'control',
      'control_type': 'CONNECTION_DRAINING'
    }))
    gcm.client.emit('stanza', message)

    t.ok(gcm.draining === true)
    t.end()
  })

  t.test('handles `ack` messages', (t) => {
    var gcm = new GCMClient()
    gcm.send(token, message, {})
    var messageIds = Object.keys(gcm.acks)
    t.ok(messageIds.length === 1)

    var message = new xmpp.Stanza.Element('message')
    message.c('gcm').t(JSON.stringify({
      'message_id': messageIds[0],
      'message_type': 'ack'
    }))

    gcm.client.emit('stanza', message)

    t.ok(Object.keys(gcm.acks).length === 0)
    t.end()
  })

  t.test('handles `nack` messages', (t) => {
    var gcm = new GCMClient()
    gcm.send(token, message, {})
    var messageIds = Object.keys(gcm.acks)
    t.ok(messageIds.length === 1)

    var message = new xmpp.Stanza.Element('message')
    message.c('gcm').t(JSON.stringify({
      'message_id': messageIds[0],
      'message_type': 'nack'
    }))

    gcm.client.emit('stanza', message)

    t.ok(Object.keys(gcm.acks).length === 0)
    t.end()
  })

  t.test('handles `receipt` messages', (t) => {
    var gcm = new GCMClient()
    gcm.client.connect()
    t.ok(gcm.draining === false)
    var message = new xmpp.Stanza.Element('message')
    message.c('gcm').t(JSON.stringify({
      'message_id': 1,
      'message_type': 'control',
      'control_type': 'CONNECTION_DRAINING'
    }))
    gcm.client.emit('stanza', message)

    t.ok(gcm.draining === true)
    t.end()
  })
})

tap.test('.send', (t) => {
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
    var promise = gcm.send(token, message, {a: 1})
    t.ok(promise instanceof Promise)
    t.end()
  })

  t.test('method calls are queued if all ack slots are occupied', (t) => {
    t.equals(gcm.availableAckSlots(), 98)
    t.equals(gcm.ackQueue.length, 0)

    Array(100).fill(1).forEach(() => gcm.send(token, message, {}))

    t.equals(gcm.availableAckSlots(), 0)
    t.equals(gcm.ackQueue.length, 2)
    t.end()
  })

  t.test('queued method calls are resolved once ack slots are vacated', (t) => {
    var gcm = new GCMClient()
    gcm.client.connect()
    t.equals(gcm.availableAckSlots(), 100)
    t.equals(gcm.ackQueue.length, 0)
    Array(150).fill(1).forEach(() => gcm.send(token, message, {}))
    t.equals(gcm.queued.length, 0)
    t.equals(gcm.availableAckSlots(), 0)
    t.equals(gcm.ackQueue.length, 50)

    var messageIds = Object.keys(gcm.acks)

    messageIds.forEach(id => {
      var message = new xmpp.Stanza.Element('message')
      message.c('gcm').t(JSON.stringify({
        'message_id': id,
        'message_type': 'ack'
      }))
      gcm.client.emit('stanza', message)
    })

    t.equals(gcm.queued.length, 0)
    t.equals(gcm.ackQueue.length, 0)
    t.equals(gcm.availableAckSlots(), 50)

    messageIds.forEach(id => {
      var message = new xmpp.Stanza.Element('message')
      message.c('gcm').t(JSON.stringify({
        'message_id': id,
        'message_type': 'ack'
      }))
      gcm.client.emit('stanza', message)
    })

    t.equals(gcm.queued.length, 0)
    t.equals(gcm.ackQueue.length, 0)
    t.equals(gcm.availableAckSlots(), 100)

    t.end()
  })

  t.test('messages are queued if the connection hasnt been established', (t) => {
    var gcm = new GCMClient()
    t.ok(gcm.queued.length === 0)
    gcm.send(token, message, {})
    t.ok(gcm.queued.length === 1)
    t.end()
  })

  t.test('messages are sent immediately if the connection has been established', (t) => {
    var gcm = new GCMClient()
    gcm.client.connect()
    t.ok(gcm.queued.length === 0)
    gcm.send(token, message, {})
    t.ok(gcm.queued.length === 0)
    t.end()
  })
})
