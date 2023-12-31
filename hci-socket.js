// hci-socket.js

const { EventEmitter } = require("node:events");
const os = require("node:os");
const util = require("node:util");

const {
  HciSocket,
} = require(`./lib/${os.platform()}/${os.arch()}/hci_socket.node`);

util.inherits(HciSocket, EventEmitter);

module.exports = HciSocket;
