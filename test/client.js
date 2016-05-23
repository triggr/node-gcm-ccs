var tap = require('tap')
var sinon = require('sinon')
var mockery = require('./mockery/xmpp-client.mockery')
var xmpp = require('node-xmpp-client')
var GCMClient = require('../lib/client')

tap.beforeEach(mockery.setUp)
tap.afterEach(mockery.tearDown)

tap.test('propagates `error` event', (t) => {
  var gcm = new GCMClient()
  var spy = sinon.spy()
  gcm.on('error', spy)

  gcm._client.emit('error', new Error())

  t.ok(spy.called)

  t.end()
})

tap.test('emits `connected` event, when xmpp connection has been established', (t) => {
  var gcm = new GCMClient()
  var spy = sinon.spy()
  gcm.on('connected', spy)

  gcm._client.connect()
  t.ok(spy.called)

  t.end()
})

tap.test('emits `disconnected` event, when xmpp connection has been closed', (t) => {
  var gcm = new GCMClient()
  var spy = sinon.spy()
  gcm.on('disconnected', spy)

  gcm._client.connect()
  gcm.end()

  t.ok(spy.called)

  t.end()
})

tap.test('reconnects if the connection has been closed due to draining', (t) => {
  var gcm = new GCMClient()
  var spy = sinon.spy()
  gcm.on('connected', spy)
  gcm.end()
  t.ok(spy.called)
  t.end()
})


tap.test('handles `stanza` events from the xmpp connection', (t) => {
  t.autoend()

  var token = '123'
  var gcm

  t.beforeEach(done => {
    gcm = new GCMClient()
    gcm._client.connect()
    done()
  })
  t.test('handles `control` messages', (t) => {
    mockery.response_message_data = {
      message_type: 'control',
      control_type: 'CONNECTION_DRAINING'
    }

    gcm.send(token, {}, {})
    setTimeout(() => {
      t.ok(gcm._queue.paused === true)
      t.end()
    }, 10)
  })

  t.test('handles `ack` messages', (t) => {
    mockery.response_message_data = {
      message_type: 'ack'
    }

    var callbackSpy = sinon.spy()

    gcm.send(token, {}, {}, callbackSpy)
    setTimeout(() => {
      t.ok(callbackSpy.called)
      t.end()
    }, 10)
  })

  t.test('handles `nack` messages', (t) => {
    mockery.response_message_data = {
      message_type: 'ack'
    }

    var callbackSpy = sinon.spy()

    gcm.send(token, {}, {}, callbackSpy)
    setTimeout(() => {
      t.ok(callbackSpy.called)
      t.end()
    }, 10)
  })

  t.test('handles `receipt` messages', (t) => {
    mockery.response_message_data = {
      message_type: 'receipt'
    }

    var spy = sinon.spy()
    gcm.on('receipt', spy)

    gcm.send(token, {}, {})
    setTimeout(() => {
      t.ok(spy.called)
      t.end()
    }, 10)
  })

  t.test('handles `upstream` messages', (t) => {
    mockery.response_message_data = {
      message_type: 'receipt' // hack
    }

    var spy = sinon.spy()
    var message = new xmpp.Message()
    message.c('gcm').t(JSON.stringify({
      from: 'somebody',
      message_id: 123,
      message_type: 'upstream',
      data: { sweet: 'bike' }
    }))
    gcm.on('message', spy)
    gcm._client.emit('stanza', message)
    t.ok(spy.called)
    t.end()
  })

  t.test('handles `error` messages', (t) => {
    // var message = new xmpp.Message()
    // message.type = 'error'
    // var spy = sinon.spy()
    // message
    //   .c('error').t()
    //   .c('text').t(JSON.stringify({error: 'err'}))
    // gcm.on('message-error', spy)
    // gcm._client.emit('stanza', message)
    // t.ok(spy.called)
    t.end()
  })

  t.test('discards empty messages', (t) => {
    var message = new xmpp.Message()
    message.c('gcm').t(JSON.stringify({}))
    gcm._client.emit('stanza', message)
    t.end()
  })
})

tap.test('.send', (t) => {
  t.autoend()

  var token = '123'
  var message = {}
  var gcm

  t.beforeEach(done => {
    gcm = new GCMClient()
    gcm._client.connect()
    done()
  })
  t.test('method calls are queued if all ack slots are occupied', (t) => {
    t.equals(gcm._queue.length(), 0)
    Array(100).fill(1).forEach(() => gcm.send(token, message, {}))
    t.equals(gcm._queue.length(), 100)
    t.end()
  })

  t.test('queued method calls are resolved once ack slots are vacated', (t) => {
    t.equals(gcm._queue.length(), 0)
    Array(100).fill(1).forEach(() => gcm.send(token, message, {}))
    t.equals(gcm._queue.length(), 100)
    Object.keys(gcm._acks).forEach(message_id => {
      var message = new xmpp.Message()
      message.c('gcm').t(JSON.stringify({
        message_id,
        message_type: 'ack'
      }))
      gcm._client.emit('stanza', message)
    })
    setTimeout(() => {
      t.equals(gcm._queue.length(), 0)
      t.end()
    }, 10)
  })

  t.test('messages are queued if the connection hasnt been established', (t) => {
    var gcm = new GCMClient()
    t.equals(gcm._queue.length(), 0)

    gcm.send(token, message, {})
    t.equals(gcm._queue.length(), 1)
    gcm._client.connect()

    var message_id = Object.keys(gcm._acks)[0]
    var message = new xmpp.Message()
    message.c('gcm').t(JSON.stringify({
      message_id,
      message_type: 'ack'
    }))

    gcm._client.emit('stanza', message)

    setTimeout(() => {
      t.equals(gcm._queue.length(), 0)
      t.end()
    }, 10)
  })

  t.test('messages are sent immediately if the connection has been established', (t) => {
    var gcm = new GCMClient()
    gcm._client.connect()
    t.equals(gcm._queue.length(), 0)

    gcm.send(token, message, {})
    setTimeout(() => {
      t.equals(gcm._queue.length(), 0)
      t.end()
    }, 10)
  })
})
