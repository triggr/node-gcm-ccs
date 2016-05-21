var EventEmitter = require('events')
var xmpp = require('node-xmpp-client')

var snapshot = xmpp.Client

var mockery = exports

mockery.response_message_data
/**
 * Setup the mockery. This method should be called before each test.
 */

class XmppClientMock extends EventEmitter {

  constructor () {
    super()
    this.connection = {}
    this.connection.socket = {}
    this.connection.socket.setTimeout = function () {}
    this.connection.socket.setKeepAlive = function () {}
  }

  send (stanza) {
    var message_id = JSON.parse(stanza.children[0]).message_id
    var payload = Object.assign({}, { message_id }, mockery.response_message_data)
    var message = new xmpp.Message()
    message.c('gcm').t(JSON.stringify(payload))
    this.emit('stanza', message)
  }

  connect () {
    this.emit('online')
  }

  end () {
    this.emit('close')
  }

}

mockery.setUp = function (done) {
  xmpp.Client = XmppClientMock
  done()
}

/**
 * Restore the application state as it was before mockery setup.
 * This method should be called after each test.
 */
mockery.tearDown = function (done) {
  xmpp.Client = snapshot
  done()
}
