const xmpp = require('node-xmpp-client')

module.exports = class GCMMessage {
  constructor (payload) {
    return new xmpp.Message()
      .c('gcm', { xmlns: 'google:mobile:data' })
      .t(JSON.stringify(payload))
  }
}
