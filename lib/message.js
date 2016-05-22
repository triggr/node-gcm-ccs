var xmpp = require('node-xmpp-client')

module.exports = function GCMMessage (payload) {
  return new xmpp.Message()
    .c('gcm', { xmlns: 'google:mobile:data' })
    .t(JSON.stringify(payload))
}
