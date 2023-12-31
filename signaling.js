// signaling.js

const debug = require("debug")("ble-hci-central:signaling");

const { EventEmitter } = require("node:events");

const { ACL_START_NO_FLUSH } = require("./hci-defs.js");
const {
  SIGNALING_CID,
  CONNECTION_PARAMETER_UPDATE_REQUEST,
  CONNECTION_PARAMETER_UPDATE_RESPONSE,
} = require("./signaling-defs.js");

// LE Signaling Channel
class Signaling extends EventEmitter {
  constructor(handle, acl) {
    super();
    this._handle = handle; // Connection handle
    this._acl = acl; // ACL transport
    this._onAclData = this.onAclData.bind(this);
    this._onAclEnd = this.onAclEnd.bind(this);
    this._acl.on("data", this._onAclData);
    this._acl.on("end", this._onAclEnd);
  }

  close() {
    this.onAclEnd();
    this.removeAllListeners();
  }

  writeSignaling(data, flags = ACL_START_NO_FLUSH) {
    debug(
      "Signaling.writeSignaling: flags 0x%s, data %s",
      flags.toString(16).padStart(2, "0"),
      data.toString("hex")
    );
    this._acl.write(flags, SIGNALING_CID, data);
  }

  onAclData(cid, data) {
    if (cid !== SIGNALING_CID) return;

    const code = data.readUInt8(0);
    const identifier = data.readUInt8(1);
    const length = data.readUInt16LE(2);
    const signalingData = data.subarray(4);

    debug(
      "Signaling.onAclData: code %d, identifier %d, length %d, signalingData %s",
      code,
      identifier,
      length,
      signalingData.toString("hex")
    );

    if (code === CONNECTION_PARAMETER_UPDATE_REQUEST) {
      this.onConnectionParameterUpdateRequest(identifier, signalingData);
    }
  }

  onAclEnd() {
    this._acl.off("data", this._onAclData);
    this._acl.off("end", this._onAclEnd);
    this.emit("end");
  }

  onConnectionParameterUpdateRequest(identifier, data) {
    const minInterval = data.readUInt16LE(0);
    const maxInterval = data.readUInt16LE(2);
    const latency = data.readUInt16LE(4);
    const supervisionTimeout = data.readUInt16LE(6);

    debug(
      "Signaling.onConnectionParameterUpdateRequest: minInterval %d, maxInterval %d, latency %d, supervisionTimeout %d",
      minInterval,
      maxInterval,
      latency,
      supervisionTimeout
    );

    const packet = Buffer.allocUnsafe(6);
    packet.writeUInt8(CONNECTION_PARAMETER_UPDATE_RESPONSE, 0); // code
    packet.writeUInt8(identifier, 1); // identifier
    packet.writeUInt16LE(2, 2); // length
    packet.writeUInt16LE(0, 4); // status

    this.writeSignaling(packet);

    this.emit(
      "connectionParameterUpdateRequest",
      this._handle,
      minInterval,
      maxInterval,
      latency,
      supervisionTimeout
    );
  }
}

module.exports = Signaling;
