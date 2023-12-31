// gatt.js

// Bluetooth Specs v4.2 [Vol 3, Part F]
//
// All 32-bit Attribute UUIDs shall be converted to 128-bit UUIDs when the
// Attribute UUID is contained in an ATT PDU
//
// Attribute PDU Format
// Name                       Size (octets)       Description
// -------------------------- ------------------- -----------------------------------------------------------------------------------
// Attribute Opcode           1                   The attribute PDU operation code
//                                                bit7: Authentication Signature Flag
//                                                bit6: Command Flag
//                                                bit5-0: Method
// -------------------------- ------------------- -----------------------------------------------------------------------------------
// Attribute Parameters       0 to (ATT_MTU - X)  The attribute PDU parameters
//                                                X = 1 if Authentication Signature Flag of the Attribute Opcode is 0
//                                                X = 13 if Authentication Signature Flag of the Attribute Opcode is 1
// -------------------------- ------------------- -----------------------------------------------------------------------------------
// Authentication Signature   0 or 12             Optional authentication signature for the Attribute Opcode and Attribute Parameters
// -------------------------- ------------------- -----------------------------------------------------------------------------------
//
// Once a client sends a request to a server, that client shall send no other
// request to the same server until a response PDU has been received.
// It is possible for a server to receive a request, send one or more
// notifications, and then the response to the original request. The flow
// control of requests is not affected by the transmission of the notifications.
// It is possible for a notification from a server to be sent after an
// indication has been sent but the confirmation has not been received.
// The flow control of indications is not affected by the transmission of
// notifications.
// It is possible for a client to receive an indication from a server and
// then send a request or command to that server before sending the
// confirmation of the original indication.

const debug = require("debug")("ble-hci-central:gatt");

const { EventEmitter } = require("node:events");

const {
  ATT_CID,
  ATT_OP_ERROR,
  ATT_OP_MTU_REQ,
  ATT_OP_MTU_RESP,
  ATT_OP_FIND_INFO_REQ,
  ATT_OP_FIND_INFO_RESP,
  ATT_OP_FIND_BY_TYPE_VALUE_REQ,
  ATT_OP_FIND_BY_TYPE_VALUE_RESP,
  ATT_OP_READ_BY_TYPE_REQ,
  ATT_OP_READ_BY_TYPE_RESP,
  ATT_OP_READ_REQ,
  ATT_OP_READ_RESP,
  ATT_OP_READ_BLOB_REQ,
  ATT_OP_READ_BLOB_RESP,
  ATT_OP_READ_MULTIPLE_REQ,
  ATT_OP_READ_MULTIPLE_RESP,
  ATT_OP_READ_BY_GROUP_REQ,
  ATT_OP_READ_BY_GROUP_RESP,
  ATT_OP_WRITE_REQ,
  ATT_OP_WRITE_RESP,
  ATT_OP_PREPARE_WRITE_REQ,
  ATT_OP_PREPARE_WRITE_RESP,
  ATT_OP_EXECUTE_WRITE_REQ,
  ATT_OP_EXECUTE_WRITE_RESP,
  ATT_OP_HANDLE_NOTIFY,
  ATT_OP_HANDLE_IND,
  ATT_OP_HANDLE_CNF,
  ATT_OP_WRITE_CMD,
  ATT_OP_SIGNED_WRITE_CMD,
  ATT_ECODE_INVALID_PDU,
  ATT_ECODE_AUTHENTICATION,
  ATT_ECODE_REQ_NOT_SUPP,
  ATT_ECODE_AUTHORIZATION,
  ATT_ECODE_INSUFF_ENC,
  ATT_ECODE_SUCCESS,
  ATT_ECODE_INVALID_HANDLE,
  ATT_ECODE_READ_NOT_PERM,
  ATT_ECODE_WRITE_NOT_PERM,
  ATT_ECODE_INVALID_OFFSET,
  ATT_ECODE_PREP_QUEUE_FULL,
  ATT_ECODE_ATTR_NOT_FOUND,
  ATT_ECODE_ATTR_NOT_LONG,
  ATT_ECODE_INSUFF_ENCR_KEY_SIZE,
  ATT_ECODE_INVAL_ATTR_VALUE_LEN,
  ATT_ECODE_UNLIKELY,
  ATT_ECODE_UNSUPP_GRP_TYPE,
  ATT_ECODE_INSUFF_RESOURCES,
} = require("./att-defs.js");
const {
  GATT_PRIMARY_SVC_UUID,
  GATT_INCLUDED_SVC_UUID,
  GATT_CHARACTERISTIC_UUID,
  GATT_CLIENT_CHARAC_CFG_UUID,
  GATT_SERVER_CHARAC_CFG_UUID,
} = require("./gatt-defs.js");
const { ACL_START_NO_FLUSH } = require("./hci-defs.js");

const MAX_MTU = 247; // 517
const ATT_TIMEOUT = 200;
const CCCD_MAX_DISTANCE = 3;

const attOpMap = {
  [ATT_OP_ERROR]: "ATT_OP_ERROR",
  [ATT_OP_MTU_REQ]: "ATT_OP_MTU_REQ",
  [ATT_OP_MTU_RESP]: "ATT_OP_MTU_RESP",
  [ATT_OP_FIND_INFO_REQ]: "ATT_OP_FIND_INFO_REQ",
  [ATT_OP_FIND_INFO_RESP]: "ATT_OP_FIND_INFO_RESP",
  [ATT_OP_FIND_BY_TYPE_VALUE_REQ]: "ATT_OP_FIND_BY_TYPE_VALUE_REQ",
  [ATT_OP_FIND_BY_TYPE_VALUE_RESP]: "ATT_OP_FIND_BY_TYPE_VALUE_RESP",
  [ATT_OP_READ_BY_TYPE_REQ]: "ATT_OP_READ_BY_TYPE_REQ",
  [ATT_OP_READ_BY_TYPE_RESP]: "ATT_OP_READ_BY_TYPE_RESP",
  [ATT_OP_READ_REQ]: "ATT_OP_READ_REQ",
  [ATT_OP_READ_RESP]: "ATT_OP_READ_RESP",
  [ATT_OP_READ_BLOB_REQ]: "ATT_OP_READ_BLOB_REQ",
  [ATT_OP_READ_BLOB_RESP]: "ATT_OP_READ_BLOB_RESP",
  [ATT_OP_READ_MULTIPLE_REQ]: "ATT_OP_READ_MULTIPLE_REQ",
  [ATT_OP_READ_MULTIPLE_RESP]: "ATT_OP_READ_MULTIPLE_RESP",
  [ATT_OP_READ_BY_GROUP_REQ]: "ATT_OP_READ_BY_GROUP_REQ",
  [ATT_OP_READ_BY_GROUP_RESP]: "ATT_OP_READ_BY_GROUP_RESP",
  [ATT_OP_WRITE_REQ]: "ATT_OP_WRITE_REQ",
  [ATT_OP_WRITE_RESP]: "ATT_OP_WRITE_RESP",
  [ATT_OP_WRITE_CMD]: "ATT_OP_WRITE_CMD",
  [ATT_OP_SIGNED_WRITE_CMD]: "ATT_OP_SIGNED_WRITE_CMD",
  [ATT_OP_PREPARE_WRITE_REQ]: "ATT_OP_PREPARE_WRITE_REQ",
  [ATT_OP_PREPARE_WRITE_RESP]: "ATT_OP_PREPARE_WRITE_RESP",
  [ATT_OP_EXECUTE_WRITE_REQ]: "ATT_OP_EXECUTE_WRITE_REQ",
  [ATT_OP_EXECUTE_WRITE_RESP]: "ATT_OP_EXECUTE_WRITE_RESP",
  [ATT_OP_HANDLE_NOTIFY]: "ATT_OP_HANDLE_NOTIFY",
  [ATT_OP_HANDLE_IND]: "ATT_OP_HANDLE_IND",
  [ATT_OP_HANDLE_CNF]: "ATT_OP_HANDLE_CNF",
};

const attEcodeMap = {
  [ATT_ECODE_SUCCESS]: "ATT_ECODE_SUCCESS",
  [ATT_ECODE_INVALID_HANDLE]: "ATT_ECODE_INVALID_HANDLE",
  [ATT_ECODE_READ_NOT_PERM]: "ATT_ECODE_READ_NOT_PERM",
  [ATT_ECODE_WRITE_NOT_PERM]: "ATT_ECODE_WRITE_NOT_PERM",
  [ATT_ECODE_INVALID_PDU]: "ATT_ECODE_INVALID_PDU",
  [ATT_ECODE_AUTHENTICATION]: "ATT_ECODE_AUTHENTICATION",
  [ATT_ECODE_REQ_NOT_SUPP]: "ATT_ECODE_REQ_NOT_SUPP",
  [ATT_ECODE_INVALID_OFFSET]: "ATT_ECODE_INVALID_OFFSET",
  [ATT_ECODE_AUTHORIZATION]: "ATT_ECODE_AUTHORIZATION",
  [ATT_ECODE_PREP_QUEUE_FULL]: "ATT_ECODE_PREP_QUEUE_FULL",
  [ATT_ECODE_ATTR_NOT_FOUND]: "ATT_ECODE_ATTR_NOT_FOUND",
  [ATT_ECODE_ATTR_NOT_LONG]: "ATT_ECODE_ATTR_NOT_LONG",
  [ATT_ECODE_INSUFF_ENCR_KEY_SIZE]: "ATT_ECODE_INSUFF_ENCR_KEY_SIZE",
  [ATT_ECODE_INVAL_ATTR_VALUE_LEN]: "ATT_ECODE_INVAL_ATTR_VALUE_LEN",
  [ATT_ECODE_UNLIKELY]: "ATT_ECODE_UNLIKELY",
  [ATT_ECODE_INSUFF_ENC]: "ATT_ECODE_INSUFF_ENC",
  [ATT_ECODE_UNSUPP_GRP_TYPE]: "ATT_ECODE_UNSUPP_GRP_TYPE",
  [ATT_ECODE_INSUFF_RESOURCES]: "ATT_ECODE_INSUFF_RESOURCES",
};

class AttRequest {
  constructor(gatt, proxy, timeout) {
    this._gatt = gatt;
    this._proxy = proxy;
    this._timeout = timeout;
  }

  stop() {
    if (this._gatt?._requestInterval) {
      clearInterval(this._gatt._requestInterval);
      delete this._gatt._requestInterval;
    }
  }

  done() {
    if (this._proxy.done()) {
      this.stop();
      return true;
    }
    return false;
  }

  send() {
    this._proxy.send();
    if (this._timeout > 0) {
      this.stop();
      this._gatt._requestInterval = setInterval(
        () => this._proxy.send(),
        this._timeout
      );
    }
  }

  recv(data) {
    this._proxy.recv(data);
  }

  error(opcode, handle, ecode) {
    this._proxy.error(opcode, handle, ecode);
  }
}

// Generic Attribute Profile
class Gatt extends EventEmitter {
  constructor(address, acl, options) {
    super();
    this._options = options;
    this._address = address; // Remote device address
    this._acl = acl; // ACL transport
    this._services = {}; // Services (by service uuid)
    this._characteristics = {}; // Characteristics (by handle)
    this._descriptors = {}; // Descriptors (by handle)
    this._requestQueue = [];
    this._mtu = 23;
    this._security = "low"; // low, medium, high
    this._onAclData = this.onAclData.bind(this);
    this._onAclEncrypt = this.onAclEncrypt.bind(this);
    this._onAclEncryptFail = this.onAclEncryptFail.bind(this);
    this._onAclEnd = this.onAclEnd.bind(this);
    this._acl.on("data", this._onAclData);
    this._acl.on("encrypt", this._onAclEncrypt);
    this._acl.on("encryptFail", this._onAclEncryptFail);
    this._acl.on("end", this._onAclEnd);
  }

  close() {
    if (this._pendingRequest) {
      this._pendingRequest.stop();
      delete this._pendingRequest;
    }
    if (this._requestInterval) {
      clearInterval(this._requestInterval);
      delete this._requestInterval;
    }
    for (const request of this._requestQueue) {
      request.stop();
    }
    this._requestQueue = [];
    this.removeAllListeners();
  }

  getMtu() {
    return this._mtu;
  }

  getServices() {
    return this._services;
  }

  getServiceByUuid(serviceUuid) {
    return this._services[serviceUuid];
  }

  getCharacteristicByUuid(serviceUuid, characteristicUuid) {
    const service = this._services[serviceUuid];
    if (service) return service.characteristics[characteristicUuid];
  }

  getCharacteristicByHandle(characteristicHandle) {
    return this._characteristics[characteristicHandle];
  }

  getDescriptorByUuid(serviceUuid, characteristicUuid, descriptorUuid) {
    const service = this._services[serviceUuid];
    if (service) {
      const characteristic = service.characteristics[characteristicUuid];
      if (characteristic) {
        return characteristic.descriptors[descriptorUuid];
      }
    }
  }

  getDescriptorByHandle(descriptorHandle) {
    return this._descriptors[descriptorHandle];
  }

  writeAtt(data, flags = ACL_START_NO_FLUSH) {
    debug(
      "Gatt.writeAtt: flags 0x%s, data %s",
      flags.toString(16).padStart(2, "0"),
      data.toString("hex")
    );
    this._acl.write(flags, ATT_CID, data);
  }

  onAclData(cid, data) {
    if (cid !== ATT_CID) return;

    const opcode = data.readUInt8(0);
    // const commandFlag = !!(opcode & 0x40);
    // const authSignatureFlag = !!(opcode & 0x80);

    debug(
      "Gatt.onAclData: %d %s address %s, data %s",
      opcode,
      attOpMap[opcode],
      this._address,
      data.toString("hex")
    );

    // Echo response (maybe from USB dongle)
    // if (this._pendingRequest && !Buffer.compare(data, this._pendingRequest.buffer)) {
    //    debug("Gatt.onAclData: echo");
    //   return;
    // }

    try {
      switch (opcode) {
        case ATT_OP_ERROR:
          this.onAttOpError(data);
          break;
        case ATT_OP_MTU_REQ:
          this.onAttOpMtuReq(data);
          break;
        case ATT_OP_MTU_RESP:
          this.onAttOpMtuRes(data);
          break;
        case ATT_OP_FIND_INFO_RESP:
        case ATT_OP_FIND_BY_TYPE_VALUE_RESP:
        case ATT_OP_READ_BY_TYPE_RESP:
        case ATT_OP_READ_RESP:
        case ATT_OP_READ_BLOB_RESP:
        case ATT_OP_READ_MULTIPLE_RESP:
        case ATT_OP_READ_BY_GROUP_RESP:
        case ATT_OP_WRITE_RESP:
        case ATT_OP_PREPARE_WRITE_RESP:
        case ATT_OP_EXECUTE_WRITE_RESP:
          this.onAttOpResponse(data);
          break;
        case ATT_OP_HANDLE_NOTIFY:
          this.onHandleNotify(data);
          break;
        case ATT_OP_HANDLE_IND:
          this.onHandleInd(data);
          break;
        case ATT_OP_FIND_INFO_REQ:
        case ATT_OP_FIND_BY_TYPE_VALUE_REQ:
        case ATT_OP_READ_BY_TYPE_REQ:
        case ATT_OP_READ_REQ:
        case ATT_OP_READ_BLOB_REQ:
        case ATT_OP_READ_MULTIPLE_REQ:
        case ATT_OP_READ_BY_GROUP_REQ:
        case ATT_OP_WRITE_REQ:
        case ATT_OP_PREPARE_WRITE_REQ:
        case ATT_OP_EXECUTE_WRITE_REQ:
          this.writeAtt(
            this.errorResponse(opcode, 0x0000, ATT_ECODE_REQ_NOT_SUPP)
          );
          break;
        case ATT_OP_HANDLE_CNF:
        case ATT_OP_WRITE_CMD:
        case ATT_OP_SIGNED_WRITE_CMD:
          // WARNING: Error Response not allowed
          break;
        default:
          debug(
            "Gatt.onAclData: unknown opcode",
            `0x${opcode.toString(16).padStart(2, "0")}`
          );
          break;
      }
    } catch (error) {
      debug("Gatt.onAclData: error %o", error);
    }
  }

  onAclEncrypt(encrypt) {
    debug("Gatt.onAclEncrypt: encrypt %d", encrypt);
    if (encrypt) this._security = "medium";
  }

  onAclEncryptFail(handle) {
    debug("Gatt.onAclEncryptFail: handle %d", handle);
    this.emit("encryptFail", this._address);
  }

  onAclEnd() {
    this._acl.off("data", this._onAclData);
    this._acl.off("encrypt", this._onAclEncrypt);
    this._acl.off("encryptFail", this._onAclEncryptFail);
    this._acl.off("end", this._onAclEnd);
  }

  onAttOpError(data) {
    // Format of Error Response
    // uint8_t opcode = 0x01;
    // uint8_t req_opcode; // The request that generated this error response
    // uint16_t handle; // The attribute handle that generated this error response
    // uint8_t reason; // The reason why the request has gener- ated an error response
    const opcode = data.readUInt8(1);
    const handle = data.readUInt16LE(2);
    const ecode = data.readUInt8(4);

    debug(
      "Gatt.onAttOpError: request %d %s, handle %d, error %d %s",
      opcode,
      attOpMap[opcode],
      handle,
      ecode,
      attEcodeMap[ecode]
    );

    if (
      (ecode === ATT_ECODE_AUTHENTICATION ||
        ecode === ATT_ECODE_AUTHORIZATION ||
        ecode === ATT_ECODE_INSUFF_ENC) &&
      this._security === "low"
    ) {
      debug("Gatt.onAttOpError: encryption required");
      this._acl.encrypt(this._options);
      return;
    }

    if (this._pendingRequest) this._pendingRequest.error(opcode, handle, ecode);
    this._pollRequestQueue();
  }

  onAttOpMtuReq(data) {
    // Format of Exchange MTU Request
    // uint8_t opcode = 0x02;
    // uint16_t mtu; // Client receive MTU size
    const opcode = data.readUInt8(0);
    const mtu = data.readUInt16LE(1);
    debug("Gatt.onAttOpMtuReq: mtu %d", mtu);
    // this.writeAtt(this.mtuResponse(MAX_MTU));
    this.writeAtt(this.errorResponse(opcode, 0x0000, ATT_ECODE_REQ_NOT_SUPP));
  }

  onAttOpMtuRes(data) {
    // Format of Exchange MTU Response
    // uint8_t opcode = 0x03;
    // uint16_t mtu; // Server receive MTU size
    let mtu = data.readUInt16LE(1);
    debug("Gatt.onAttOpMtuRes: mtu %d", mtu);
    if (mtu <= MAX_MTU) {
      debug("Gatt.onAttOpMtuRes: mtu changed old %d, new %d", this._mtu, mtu);
      this._mtu = mtu;
      this.emit("mtu", this._address, this._mtu);
    }
  }

  onAttOpResponse(data) {
    if (this._pendingRequest) this._pendingRequest.recv(data);
    this._pollRequestQueue();
  }

  onHandleNotify(data) {
    // Format of Handle Value Notification (used to send a notification of an attribute’s value at any time)
    // uint8_t opcode = 0x1b;
    // uint16_t handle; // The handle of the attribute
    // uint8_t data[]; // The current value of the attribute
    const handle = data.readUInt16LE(1);
    data = data.subarray(3);

    debug(
      "Gatt.onHandleNotify: handle %d, value %s",
      handle,
      data.toString("hex")
    );

    // Notify listener(s)
    this.emit("notification", this._address, handle, data);
  }

  onHandleInd(data) {
    // Format of Handle Value Indication (used to send an indication of an attribute’s value at any time)
    // uint8_t opcode = 0x1d;
    // uint16_t handle; // The handle of the attribute
    // uint8_t data[]; // The current value of the attribute
    const handle = data.readUInt16LE(1);
    data = data.subarray(3);

    debug(
      "Gatt.onHandleInd: handle %d, value %s",
      handle,
      data.toString("hex")
    );

    // Format of Handle Value Confirmation (sent in response to a received Handle Value Indication)
    // uint8_t opcode = 0x1e;
    this._queueRequest(this.newCommand(this.handleConfirmation()));

    // Notify listener(s)
    this.emit("notification", this._address, handle, data);
  }

  _pollRequestQueue = () => {
    if (this._pendingRequest) {
      if (!this._pendingRequest.done()) return;
      delete this._pendingRequest;
    }
    while (this._requestQueue.length > 0) {
      const request = this._requestQueue.shift();
      request.send();
      if (!request.done()) {
        this._pendingRequest = request;
        break;
      }
    }
  };

  _queueRequest(request) {
    this._requestQueue.push(request);
    this._pollRequestQueue();
  }

  newCommand(data, flags = ACL_START_NO_FLUSH) {
    let doneFlag = false;
    const done = () => doneFlag;
    const send = () => {
      if (doneFlag) return;
      this.writeAtt(data, flags);
      doneFlag = true;
    };
    return new AttRequest(this, { done, send });
  }

  errorResponse(opcode, handle, reason) {
    debug(
      "Gatt.errorResponse: %d %s, opcode %d %s, handle %d, reason %d %s",
      ATT_OP_ERROR,
      attOpMap[ATT_OP_ERROR],
      opcode,
      attOpMap[opcode],
      handle,
      reason,
      attEcodeMap[reason]
    );

    // Format of Error Response
    // uint8_t opcode = 0x01;
    // uint8_t req_opcode; // The request that generated this error response
    // uint16_t handle; // The attribute handle that generated this error response
    // uint8_t reason; // The reason why the request has gener- ated an error response
    const packet = Buffer.allocUnsafe(5);
    packet.writeUInt8(ATT_OP_ERROR, 0);
    packet.writeUInt8(opcode, 1);
    packet.writeUInt16LE(handle, 2);
    packet.writeUInt8(reason, 4);
    return packet;
  }

  mtuRequest(mtu) {
    debug(
      "Gatt.mtuRequest: %d %s, mtu %d",
      ATT_OP_MTU_REQ,
      attOpMap[ATT_OP_MTU_REQ],
      mtu
    );

    // Format of Exchange MTU Request
    // uint8_t opcode = 0x02;
    // uint16_t mtu; // Client receive MTU size
    const packet = Buffer.allocUnsafe(3);
    packet.writeUInt8(ATT_OP_MTU_REQ, 0);
    packet.writeUInt16LE(mtu, 1);
    return packet;
  }

  mtuResponse(mtu) {
    debug(
      "Gatt.mtuResponse: %d %s, mtu %d",
      ATT_OP_MTU_RESP,
      attOpMap[ATT_OP_MTU_RESP],
      mtu
    );

    // Format of Exchange MTU Response
    // uint8_t opcode = 0x03;
    // uint16_t mtu; // Server receive MTU size
    const packet = Buffer.allocUnsafe(3);
    packet.writeUInt8(ATT_OP_MTU_RESP, 0);
    packet.writeUInt16LE(mtu, 1);
    return packet;
  }

  findInfoRequest(startHandle, endHandle) {
    debug(
      "Gatt.findInfoRequest: %d %s, startHandle %d, endHandle %d",
      ATT_OP_FIND_INFO_REQ,
      attOpMap[ATT_OP_FIND_INFO_REQ],
      startHandle,
      endHandle
    );

    // Format of Find Information Request (used to obtain the mapping of attribute handles with their associated types)
    // uint8_t opcode = 0x04;
    // uint16_t start_handle; // First requested handle number
    // uint16_t end_handle; // Last requested handle number
    const packet = Buffer.allocUnsafe(5);
    packet.writeUInt8(ATT_OP_FIND_INFO_REQ, 0);
    packet.writeUInt16LE(startHandle, 1);
    packet.writeUInt16LE(endHandle, 3);
    return packet;
  }

  findByTypeValueRequest(startHandle, endHandle, type, data) {
    debug(
      "Gatt.findByTypeValueRequest: %d %s, startHandle %d, endHandle %d, type %d, data %s",
      ATT_OP_FIND_BY_TYPE_VALUE_REQ,
      attOpMap[ATT_OP_FIND_BY_TYPE_VALUE_REQ],
      startHandle,
      endHandle,
      type,
      data.toString("hex")
    );

    // Format of Find By Type Value Request (used to obtain the handles of attributes that have a 16-bit UUID attribute type and attribute value)
    // uint8_t opcode = 0x06;
    // uint16_t start_handle; // First requested handle number
    // uint16_t end_handle; // Last requested handle number
    // uint16_t type; // 2 octet UUID to find
    // uint8_t value[]; // Attribute value to find
    const packet = Buffer.allocUnsafe(5);
    packet.writeUInt8(ATT_OP_FIND_BY_TYPE_VALUE_REQ, 0);
    packet.writeUInt16LE(startHandle, 1);
    packet.writeUInt16LE(endHandle, 3);
    packet.writeUInt16LE(type, 5);
    data.copy(packet, 7);
    return packet;
    // Format of Find By Type Value Response
    // uint8_t opcode = 0x07;
    // uint8_t data[]; // A list of 1 or more Handle Informations
    // Format of the Handles Information
    // uint16_t handle; // Found Attribute Handle
    // uint16_t end_handle; // Group End Handle
  }

  readMultipleRequest(handles) {
    debug(
      "Gatt.readMultipleRequest: %d %s, handles %o",
      ATT_OP_READ_MULTIPLE_REQ,
      attOpMap[ATT_OP_READ_MULTIPLE_REQ],
      handles
    );

    // Format of Read Multiple Request (used to request the server to read two or more values of a set of attributes)
    // uint8_t opcode = 0x0e;
    // uint16_t handles[]; // A set of two or more attribute handles
    const packet = Buffer.allocUnsafe(7);
    packet.writeUInt8(ATT_OP_READ_MULTIPLE_REQ, 0);
    for (let i = 0; i < handles.length; i++) {
      packet.writeUInt16LE(handles[i], 1 + i * 2);
    }
    return packet;
    // Format of Read Multiple Response
    // uint8_t opcode = 0x0f;
    // uint8_t data[]; // A set of two or more values
  }

  readByGroupTypeRequest(startHandle, endHandle, type) {
    debug(
      "Gatt.readByGroupTypeRequest: %d %s, startHandle %d, endHandle %d, type %d",
      ATT_OP_READ_BY_GROUP_REQ,
      attOpMap[ATT_OP_READ_BY_GROUP_REQ],
      startHandle,
      endHandle,
      type
    );

    // Format of Read By Group Type Request (used to obtain the values of attributes where the attribute type is known)
    // uint8_t opcode = 0x10;
    // uint16_t start_handle; // First requested handle number
    // uint16_t end_handle; // Last requested handle number
    // uint16_t type or uint8_t type[16]; // 2 or 16 octet UUID
    const packet = Buffer.allocUnsafe(7);
    packet.writeUInt8(ATT_OP_READ_BY_GROUP_REQ, 0);
    packet.writeUInt16LE(startHandle, 1);
    packet.writeUInt16LE(endHandle, 3);
    packet.writeUInt16LE(type, 5);
    return packet;
  }

  readByTypeRequest(startHandle, endHandle, type) {
    debug(
      "Gatt.readByTypeRequest: %d %s, startHandle %d, endHandle %d, type %d",
      ATT_OP_READ_BY_TYPE_REQ,
      attOpMap[ATT_OP_READ_BY_TYPE_REQ],
      startHandle,
      endHandle,
      type
    );

    // Format of Read By Type Request (used to obtain the values of attributes where the attribute type is known but the handle is not known)
    // uint8_t opcode = 0x08;
    // uint16_t start_handle; // First requested handle number
    // uint16_t end_handle; // Last requested handle number
    // uint16_t type or uint8_t type[16]; // 2 or 16 octet UUID
    const packet = Buffer.allocUnsafe(7);
    packet.writeUInt8(ATT_OP_READ_BY_TYPE_REQ, 0);
    packet.writeUInt16LE(startHandle, 1);
    packet.writeUInt16LE(endHandle, 3);
    packet.writeUInt16LE(type, 5);
    return packet;
  }

  readRequest(handle) {
    debug(
      "Gatt.readRequest: %d %s, handle %d",
      ATT_OP_READ_REQ,
      attOpMap[ATT_OP_READ_REQ],
      handle
    );

    // Format of Read Request (used to request the server to read the value of an attribute)
    // uint8_t opcode = 0x0a;
    // uint16_t handle; // The handle of the attribute to be read
    const packet = Buffer.allocUnsafe(3);
    packet.writeUInt8(ATT_OP_READ_REQ, 0);
    packet.writeUInt16LE(handle, 1);
    return packet;
  }

  readBlobRequest(handle, offset) {
    debug(
      "Gatt.readBlobRequest: %d %s, handle %d, offset %d",
      ATT_OP_READ_BLOB_REQ,
      attOpMap[ATT_OP_READ_BLOB_REQ],
      handle,
      offset
    );

    // Format of Read Blob Request (used to request the server to read part of the value of an attribute at a given offset)
    // uint8_t opcode = 0x0c;
    // uint16_t handle; // The handle of the attribute to be read
    // uint16_t offset; // The offset of the first octet to be read
    const packet = Buffer.allocUnsafe(5);
    packet.writeUInt8(ATT_OP_READ_BLOB_REQ, 0);
    packet.writeUInt16LE(handle, 1);
    packet.writeUInt16LE(offset, 3);
    return packet;
  }

  writeRequest(handle, data) {
    debug(
      "Gatt.writeRequest: %d %s, handle %d, data %s",
      ATT_OP_WRITE_REQ,
      attOpMap[ATT_OP_WRITE_REQ],
      handle,
      data.toString("hex")
    );

    // Format of Write Request (used to request the server to write the value of an attribute and acknowledge)
    // uint8_t opcode = 0x12;
    // uint16_t handle; // The handle of the attribute to be written
    // uint8_t data[]; // The value to be written to the attribute
    const packet = Buffer.allocUnsafe(3 + data.length);
    packet.writeUInt8(ATT_OP_WRITE_REQ, 0);
    packet.writeUInt16LE(handle, 1);
    data.copy(packet, 3);
    return packet;
  }

  writeCommand(handle, data) {
    debug(
      "Gatt.writeCommand: %d %s, handle %d, data %s",
      ATT_OP_WRITE_CMD,
      attOpMap[ATT_OP_WRITE_CMD],
      handle,
      data.toString("hex")
    );

    // Format of Write Command (used to request the server to write the value of an attribute)
    // uint8_t opcode = 0x52;
    // uint16_t handle; // The handle of the attribute to be written
    // uint8_t data[]; // The value to be written to the attribute
    const packet = Buffer.allocUnsafe(3 + data.length);
    packet.writeUInt8(ATT_OP_WRITE_CMD, 0);
    packet.writeUInt16LE(handle, 1);
    data.copy(packet, 3);
    return packet;
  }

  signedWriteCommand(handle, data, signature) {
    debug(
      "Gatt.signedWriteCommand: %d %s, handle %d, data %s, signature %s",
      ATT_OP_SIGNED_WRITE_CMD,
      attOpMap[ATT_OP_SIGNED_WRITE_CMD],
      handle,
      data.toString("hex"),
      signature.toString("hex")
    );

    // Format of Signed Write Command (used to request the server to write the value of an attribute with an authentication signature)
    // uint8_t opcode = 0xd2;
    // uint16_t handle; // The handle of the attribute to be written
    // uint8_t data[]; // The value to be written to the attribute
    // uint8_t signature[12]; // Authentication signature for the Attribute Opcode, Attribute Handle and Attribute Value Parameters
    const packet = Buffer.allocUnsafe(15 + data.length);
    packet.writeUInt8(ATT_OP_SIGNED_WRITE_CMD, 0);
    packet.writeUInt16LE(handle, 1);
    data.copy(packet, 3);
    signature.copy(packet, 3 + data.length);
    return packet;
  }

  prepareWriteRequest(handle, offset, data) {
    debug(
      "Gatt.prepareWriteRequest: %d %s, handle %d, offset %d, data %s",
      ATT_OP_PREPARE_WRITE_REQ,
      attOpMap[ATT_OP_PREPARE_WRITE_REQ],
      handle,
      offset,
      data.toString("hex")
    );

    // Format of Prepare Write Request (used to request the server to prepare to write the value of an attribute)
    // uint8_t opcode = 0x16;
    // uint16_t handle; // The handle of the attribute to be written
    // uint16_t offset; // The offset of the first octet to be written
    // uint8_t data[]; // The value of the attribute to be written
    const packet = Buffer.allocUnsafe(5 + data.length);
    packet.writeUInt8(ATT_OP_PREPARE_WRITE_REQ, 0);
    packet.writeUInt16LE(handle, 1);
    packet.writeUInt16LE(offset, 3);
    data.copy(packet, 5);
    return packet;
  }

  executeWriteRequest(cancelPreparedWrites) {
    debug(
      "Gatt.executeWriteRequest: %d %s, cancelPreparedWrites %d",
      ATT_OP_EXECUTE_WRITE_REQ,
      attOpMap[ATT_OP_EXECUTE_WRITE_REQ],
      cancelPreparedWrites
    );

    // Format of Execute Write Request (used to request the server to write or cancel the write of all the prepared values)
    // uint8_t opcode = 0x18;
    // uint8_t flags; // Flags (0x00 Cancel all prepared writes, 0x01 Write all pending prepared values)
    const packet = Buffer.allocUnsafe(2);
    packet.writeUInt8(ATT_OP_EXECUTE_WRITE_REQ, 0);
    packet.writeUInt8(cancelPreparedWrites ? 0 : 1, 1);
    return packet;
  }

  handleConfirmation() {
    debug(
      "Gatt.handleConfirmation: %d %s",
      ATT_OP_HANDLE_CNF,
      attOpMap[ATT_OP_HANDLE_CNF]
    );

    // Format of Handle Value Confirmation
    // uint8_t opcode = 0x1e;
    const packet = Buffer.allocUnsafe(1);
    packet.writeUInt8(ATT_OP_HANDLE_CNF, 0);
    return packet;
  }

  exchangeMtu() {
    this._queueRequest(this.newCommand(this.mtuRequest(MAX_MTU)));
  }

  encrypt(options) {
    this._acl.encrypt(options || this._options);
  }

  discoverServices() {
    let doneFlag = false;
    let startHandle = 0x0001;
    let endHandle = 0xffff;
    let lastSend = 0;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      this.writeAtt(
        this.readByGroupTypeRequest(
          startHandle,
          endHandle,
          GATT_PRIMARY_SVC_UUID
        )
      );
    };

    const error = (opcode, handle, ecode) => {
      if (opcode === ATT_OP_READ_BY_GROUP_REQ) {
        if (ecode === ATT_ECODE_ATTR_NOT_FOUND) {
          debug(
            "Gatt.discoverServices: services discovered %s %o",
            this._address,
            this._services
          );
          this.emit("servicesDiscover", this._address, this._services);
          doneFlag = true;
        }
      }
    };

    const recv = (data) => {
      // Format of Read By Group Type Response
      // uint8_t opcode = 0x11;
      // uint8_t length; // The size of each Attribute Data
      // uint8_t data[]; // A list of Attribute Data
      // Format of the Attribute Data
      // uint16_t start_handle; // Attribute Handle
      // uint16_t end_handle; // End Group Handle
      // uint8_t data[]; // Attribute Value (Length - 4) octets
      const opcode = data.readUInt8(0);
      if (opcode !== ATT_OP_READ_BY_GROUP_RESP) return;
      const length = data.readUInt8(1);
      data = data.subarray(2);

      let lastEndHandle;
      const numRecords = Math.floor(data.length / length);
      for (let i = 0; i < numRecords; i++) {
        const service = {
          startHandle: data.readUInt16LE(0),
          endHandle: data.readUInt16LE(2),
          isPrimary: true,
          uuid:
            length === 6
              ? data.readUInt16LE(4).toString(16)
              : data.subarray(4, 20).reverse().toString("hex").trim(),
        };
        data = data.subarray(length);
        lastEndHandle = service.endHandle;
        this._services[service.uuid] = service;
        debug("Gatt.discoverServices: service %s %o", this._address, service);
      }

      if (lastEndHandle === undefined || lastEndHandle === 0xffff) {
        debug(
          "Gatt.discoverServices: services discovered %s %o",
          this._address,
          this._services
        );
        this.emit("servicesDiscover", this._address, this._services);
        doneFlag = true;
      } else {
        startHandle = lastEndHandle + 1;
        lastSend = 0;
        send();
      }
    };

    this._queueRequest(
      new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
    );
  }

  discoverIncludedServices(serviceUuid) {
    const service = this._services[serviceUuid];
    if (!service) throw new Error("service not found " + serviceUuid);
    const includedServices = {};
    service.includedServices = includedServices;

    let doneFlag = false;
    let startHandle = service.startHandle;
    let endHandle = service.endHandle;
    let lastSend = 0;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      this.writeAtt(
        this.readByTypeRequest(startHandle, endHandle, GATT_INCLUDED_SVC_UUID)
      );
    };

    const error = (opcode, handle, ecode) => {
      if (opcode === ATT_OP_READ_BY_TYPE_REQ) {
        if (ecode === ATT_ECODE_ATTR_NOT_FOUND) {
          debug(
            "Gatt.discoverIncludedServices: included services discovered %s %s %o",
            this._address,
            serviceUuid,
            includedServices
          );
          this.emit(
            "includedServicesDiscover",
            this._address,
            serviceUuid,
            includedServices
          );
          doneFlag = true;
        }
      }
    };

    const recv = (data) => {
      // Format of Read By Type Response
      // uint8_t opcode = 0x09;
      // uint8_t length; // The size of each attribute handle-value pair
      // uint8_t data[]; // A list of Attribute Data
      // Format of the Attribute Data
      // uint16_t handle; // Attribute Handle
      // uint16_t start_handle; // Start Group Handle
      // uint16_t end_handle; // End Group Handle
      // uint8_t data[]; // Attribute Value (Length – 6) octets
      const opcode = data.readUInt8(0);
      if (opcode !== ATT_OP_READ_BY_TYPE_RESP) return;
      const length = data.readUInt8(1);
      data = data.subarray(2);

      let lastEndHandle;
      const numRecords = Math.floor(data.length / length);
      for (let i = 0; i < numRecords; i++) {
        const includedService = {
          endHandle: data.readUInt16LE(0),
          startHandle: data.readUInt16LE(2),
          // endHandle: data.readUInt16LE(4),
          uuid:
            length === 8
              ? data.readUInt16LE(6).toString(16)
              : data.subarray(6, 22).reverse().toString("hex").trim(),
        };
        data = data.subarray(length);
        lastEndHandle = includedService.endHandle;
        includedServices[includedService.uuid] = includedService;
        debug(
          "Gatt.discoverIncludedServices: includedService %s %o",
          this._address,
          includedService
        );
      }

      if (lastEndHandle === undefined || lastEndHandle === service.endHandle) {
        debug(
          "Gatt.discoverIncludedServices: included services discovered %s %s %o",
          this._address,
          serviceUuid,
          includedServices
        );
        this.emit(
          "includedServicesDiscover",
          this._address,
          serviceUuid,
          includedServices
        );
        doneFlag = true;
      } else {
        startHandle = lastEndHandle + 1;
        lastSend = 0;
        send();
      }
    };

    this._queueRequest(
      new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
    );
  }

  discoverCharacteristics(serviceUuid) {
    const service = this._services[serviceUuid];
    if (!service) throw new Error("service not found " + serviceUuid);
    const characteristics = {};
    service.characteristics = characteristics;
    const list = [];

    let doneFlag = false;
    let startHandle = service.startHandle;
    let endHandle = service.endHandle;
    let lastSend = 0;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      this.writeAtt(
        this.readByTypeRequest(startHandle, endHandle, GATT_CHARACTERISTIC_UUID)
      );
    };

    const error = (opcode, handle, ecode) => {
      if (opcode === ATT_OP_READ_BY_TYPE_REQ) {
        if (ecode === ATT_ECODE_ATTR_NOT_FOUND) {
          debug(
            "Gatt.discoverCharacteristics: characteristics discovered %s %s %o",
            this._address,
            serviceUuid,
            characteristics
          );
          this.emit(
            "characteristicsDiscover",
            this._address,
            serviceUuid,
            characteristics
          );
          doneFlag = true;
        }
      }
    };

    const recv = (data) => {
      // Format of Read By Type Response
      // uint8_t opcode = 0x09;
      // uint8_t length; // The size of each attribute handle-value pair
      // uint8_t data[]; // A list of Attribute Data
      // Format of the Attribute Data
      // uint16_t start_handle; // Attribute Handle
      // uint8_t char_props; // Properties
      // uint16_t char_handle; // Characteristic Handle
      // uint8_t data[]; // Attribute Value (Length – 6) octets
      const opcode = data.readUInt8(0);
      if (opcode !== ATT_OP_READ_BY_TYPE_RESP) return;
      const length = data.readUInt8(1);
      data = data.subarray(2);

      let lastHandle;
      const numRecords = Math.floor(data.length / length);
      for (let i = 0; i < numRecords; i++) {
        const characteristic = {
          startHandle: data.readUInt16LE(0),
          endHandle: service.endHandle,
          properties: data.readUInt8(2),
          handle: data.readUInt16LE(3),
          uuid:
            length === 7
              ? data.readUInt16LE(5).toString(16)
              : data.subarray(5, 21).reverse().toString("hex").trim(),
          serviceUuid,
        };
        data = data.subarray(length);
        lastHandle = characteristic.handle;
        characteristics[characteristic.uuid] = characteristic;
        this._characteristics[characteristic.handle] = characteristic;
        if (list.length) {
          list[list.length - 1].endHandle = characteristic.startHandle - 1;
        }
        list.push(characteristic);
        debug(
          "Gatt.discoverCharacteristics: characteristic %s %s %o",
          this._address,
          serviceUuid,
          characteristic
        );
      }

      if (lastHandle === undefined || lastHandle === service.endHandle) {
        debug(
          "Gatt.discoverCharacteristics: characteristics discovered %s %s %o",
          this._address,
          serviceUuid,
          characteristics
        );
        this.emit(
          "characteristicsDiscover",
          this._address,
          serviceUuid,
          characteristics
        );
        doneFlag = true;
      } else {
        startHandle = lastHandle + 1;
        lastSend = 0;
        send();
      }
    };

    this._queueRequest(
      new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
    );
  }

  discoverDescriptors(serviceUuid, characteristicUuid) {
    const service = this._services[serviceUuid];
    if (!service) throw new Error("service not found " + serviceUuid);
    const characteristic = service.characteristics[characteristicUuid];
    if (!characteristic)
      throw new Error("characteristic not found " + characteristicUuid);
    const descriptors = {};
    characteristic.descriptors = descriptors;

    if (characteristic.handle >= characteristic.endHandle) {
      setImmediate(() =>
        this.emit(
          "descriptorsDiscover",
          this._address,
          serviceUuid,
          characteristicUuid,
          descriptors
        )
      );
      return;
    }

    let doneFlag = false;
    let startHandle = characteristic.handle + 1;
    let endHandle = characteristic.endHandle;
    let lastSend = 0;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      this.writeAtt(this.findInfoRequest(startHandle, endHandle));
    };

    const error = (opcode, handle, ecode) => {
      if (opcode === ATT_OP_FIND_INFO_REQ) {
        if (ecode === ATT_ECODE_ATTR_NOT_FOUND) {
          debug(
            "Gatt.discoverDescriptors: descriptors discovered %s %s %s %o",
            this._address,
            serviceUuid,
            characteristicUuid,
            descriptors
          );
          this.emit(
            "descriptorsDiscover",
            this._address,
            serviceUuid,
            characteristicUuid,
            descriptors
          );
          doneFlag = true;
        }
      }
    };

    const recv = (data) => {
      // Format of Find Information Response
      // uint8_t opcode = 0x05;
      // uint8_t format; // The format of the information data (0x01 A list of handles with 16-bit UUIDs, 0x02 A list of handles with 128-bit UUIDs).
      // uint8_t data[]; // The information data whose format is determined by the Format field
      // Format 0x01 - handle and 16-bit Bluetooth UUIDs
      // uint16_t handle;
      // uint16_t uuid;
      // Format 0x02 - handle and 128-bit UUIDs
      // uint16_t handle;
      // uint8_t uuid[16];
      const opcode = data.readUInt8(0);
      if (opcode !== ATT_OP_FIND_INFO_RESP) return;
      const format = data.readUInt8(1);
      data = data.subarray(2);

      let lastHandle;
      const length = format === 0x01 ? 4 : 18;
      const numRecords = Math.floor(data.length / length);
      for (let i = 0; i < numRecords; i++) {
        const descriptor = {
          handle: data.readUInt16LE(0),
          uuid:
            format === 0x01
              ? data.readUInt16LE(2).toString(16)
              : data.subarray(2, 18).reverse().toString("hex").trim(),
          serviceUuid,
          characteristicUuid,
        };
        data = data.subarray(length);
        lastHandle = descriptor.handle;
        descriptors[descriptor.uuid] = descriptor;
        this._descriptors[descriptor.handle] = descriptor;
        debug(
          "Gatt.discoverDescriptors: descriptor %s %s %o",
          this._address,
          serviceUuid,
          descriptor
        );
      }

      if (lastHandle === undefined || lastHandle === characteristic.endHandle) {
        debug(
          "Gatt.discoverDescriptors: descriptors discovered %s %s %s %o",
          this._address,
          serviceUuid,
          characteristicUuid,
          descriptors
        );
        this.emit(
          "descriptorsDiscover",
          this._address,
          serviceUuid,
          characteristicUuid,
          descriptors
        );
        doneFlag = true;
      } else {
        startHandle = lastHandle + 1;
        lastSend = 0;
        send();
      }
    };

    this._queueRequest(
      new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
    );
  }

  _read(handle, event) {
    let value = Buffer.allocUnsafe(0);

    let doneFlag = false;
    let attOp = ATT_OP_READ_REQ;
    let lastSend = 0;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      if (attOp === ATT_OP_READ_REQ) {
        this.writeAtt(this.readRequest(handle));
      } else {
        this.writeAtt(this.readBlobRequest(handle, value.length));
      }
    };

    const error = (opcode, handle_, ecode) => {
      if (opcode === attOp) {
        if (ecode === ATT_ECODE_INVALID_OFFSET) {
          this.emit("read", this._address, handle, value);
        } else {
          debug("Gatt._read: error %s handle %d", this._address, handle);
          this.emit(
            event,
            this._address,
            handle,
            value,
            new Error(attEcodeMap[ecode])
          );
        }
        doneFlag = true;
      }
    };

    const recv = (data) => {
      // Format of Read Response
      // uint8_t opcode = 0x0b;
      // uint8_t data[]; // The value of the attribute with the handle given
      // Format of Read Blob Response
      // uint8_t opcode = 0x0d;
      // uint8_t data[]; // Part of the value of the attribute with the handle given
      const opcode = data.readUInt8(0);
      if (opcode !== attOp) return;
      data = data.subarray(1);

      value = Buffer.concat([value, data]);
      if (data.length === this._mtu) {
        attOp = ATT_OP_READ_BLOB_REQ;
        lastSend = 0;
        send();
      } else {
        this.emit(event, this._address, handle, value);
        doneFlag = true;
      }
    };

    this._queueRequest(
      new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
    );
  }

  read(handle) {
    this._read(handle, "read");
  }

  readDescriptor(handle) {
    this._read(handle, "readDescriptor");
  }

  _write(handle, value, withoutResponse, event) {
    let doneFlag = false;
    let lastSend = 0;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      this.writeAtt(this.writeRequest(handle, value));
    };

    const error = (opcode, handle_, ecode) => {
      if (opcode === ATT_OP_WRITE_REQ) {
        debug("Gatt._write: error %s handle %d", this._address, handle);
        this.emit(
          event,
          this._address,
          handle,
          value,
          new Error(attEcodeMap[ecode])
        );
        doneFlag = true;
      }
    };

    const recv = (data) => {
      // Format of Write Response
      // uint8_t opcode = 0x13;
      const opcode = data.readUInt8(0);
      if (opcode !== ATT_OP_WRITE_RESP) return;
      if (!withoutResponse) {
        this.emit(event, this._address, handle, value);
      }
      doneFlag = true;
    };

    if (value.length > this._mtu - 3) {
      this._longWrite(handle, value, withoutResponse, event);
    } else if (withoutResponse) {
      this._queueRequest(this.newCommand(this.writeCommand(handle, value)));
    } else {
      this._queueRequest(
        new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
      );
    }
  }

  _longWrite(handle, value, withoutResponse, event) {
    const chunkSize = this._mtu - 5;

    let doneFlag = false;
    let attOp = ATT_OP_PREPARE_WRITE_REQ;
    let offset = 0;
    let lastSend = 0;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      if (attOp === ATT_OP_PREPARE_WRITE_REQ) {
        const end = offset + chunkSize;
        const chunk = value.subarray(offset, end);
        this.writeAtt(this.prepareWriteRequest(handle, offset, chunk));
      } else {
        this.writeAtt(this.executeWriteRequest());
      }
    };

    const error = (opcode, handle_, ecode) => {
      if (opcode === attOp) {
        debug("Gatt._longWrite: error %s handle %d", this._address, handle);
        if (!withoutResponse) {
          this.emit(
            event,
            this._address,
            handle,
            value,
            new Error(attEcodeMap[ecode])
          );
        }
        doneFlag = true;
      }
    };

    const recv = (sentChunk) => (data) => {
      // Format of Prepare Write Response
      // uint8_t opcode = 0x17;
      // uint16_t handle; // The handle of the attribute to be written
      // uint16_t offset; // The offset of the first octet to be written
      // uint8_t data[]; // The value of the attribute to be written
      const opcode = data.readUInt8(0);
      if (opcode !== attOp) return;

      if (opcode === ATT_OP_EXECUTE_WRITE_RESP) {
        if (!withoutResponse) {
          this.emit(event, this._address, handle, value);
        }
        doneFlag = true;
        return;
      }

      // The response MUST contain the data packet echoed back to the caller
      const handle_ = data.readUInt16LE(1);
      let offset = data.readUInt16LE(3);
      data = data.subarray(5);
      if (handle_ !== handle || data.length !== sentChunk.length) {
        debug(
          "Gatt._longWrite: bad response %s handle %d",
          this._address,
          handle
        );
        if (!withoutResponse) {
          this.emit(
            event,
            this._address,
            handle,
            value,
            new Error(attEcodeMap[ATT_ECODE_UNLIKELY])
          );
        }
        doneFlag = true;
        return;
      }

      offset += chunkSize;
      if (offset < value.length) {
        lastSend = 0;
        send();
      } else {
        attOp = ATT_OP_EXECUTE_WRITE_REQ;
        lastSend = 0;
        send();
      }
    };

    this._queueRequest(
      new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
    );
  }

  write(handle, value, withoutResponse) {
    this._write(handle, value, withoutResponse, "write");
  }

  writeDescriptor(handle, value) {
    this._write(handle, value, false, "writeDescriptor");
  }

  broadcast(handle, broadcast) {
    let doneFlag = false;
    let attOp = ATT_OP_READ_BY_TYPE_REQ;
    let lastSend = 0;
    let descriptorHandle;
    let value;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      if (attOp === ATT_OP_READ_BY_TYPE_REQ) {
        const characteristic = this._characteristics[handle];
        const startHandle = characteristic
          ? characteristic.startHandle
          : handle;
        const endHandle = characteristic
          ? characteristic.endHandle
          : handle + CCCD_MAX_DISTANCE; // WARNING: server characteristic configuration descriptor handle should be close enough to characteristic handle
        this.writeAtt(
          this.readByTypeRequest(
            startHandle,
            endHandle,
            GATT_SERVER_CHARAC_CFG_UUID
          )
        );
      } else {
        this.writeAtt(this.writeRequest(descriptorHandle, value));
      }
    };

    const error = (opcode, handle_, ecode) => {
      if (opcode === attOp) {
        debug("Gatt.broadcast: error %s handle %d", this._address, handle);
        this.emit(
          "broadcast",
          this._address,
          handle,
          descriptorHandle,
          broadcast,
          new Error(attEcodeMap[ecode])
        );
        doneFlag = true;
      }
    };

    const recv = (data) => {
      // Format of Read By Type Response
      // uint8_t opcode = 0x09;
      // uint8_t length; // The size of each attribute handle-value pair
      // uint8_t data[]; // A list of Attribute Data
      // Format of the Attribute Data
      // uint16_t handle; // Attribute Handle
      // uint16_t config; // Broadcast config
      // uint8_t data[]; // Attribute Value (Length – 4) octets
      // Format of Write Response
      // uint8_t opcode = 0x13;
      const opcode = data.readUInt8(0);
      switch (opcode) {
        case ATT_OP_READ_BY_TYPE_RESP: {
          descriptorHandle = data.readUInt16LE(2);
          let config = data.readUInt16LE(4);
          // Raise/clear broacast flag
          if (broadcast) {
            config |= 0x0001;
          } else {
            config &= 0xfffe;
          }
          value = Buffer.allocUnsafe(2);
          value.writeUInt16LE(config, 0);
          attOp = ATT_OP_WRITE_REQ;
          lastSend = 0;
          send();
          break;
        }
        case ATT_OP_WRITE_RESP: {
          this.emit(
            "broadcast",
            this._address,
            handle,
            descriptorHandle,
            broadcast
          );
          doneFlag = true;
          break;
        }
      }
    };

    this._queueRequest(
      new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
    );
  }

  notify(handle, notify) {
    let doneFlag = false;
    let attOp = ATT_OP_READ_BY_TYPE_REQ;
    let lastSend = 0;
    let descriptorHandle;
    let value;

    const done = () => doneFlag;

    const send = () => {
      if (doneFlag || Date.now() - lastSend < ATT_TIMEOUT) return;
      lastSend = Date.now();
      if (attOp === ATT_OP_READ_BY_TYPE_REQ) {
        const characteristic = this._characteristics[handle];
        const startHandle = characteristic
          ? characteristic.startHandle
          : handle;
        const endHandle = characteristic
          ? characteristic.endHandle
          : handle + CCCD_MAX_DISTANCE; // WARNING: client characteristic configuration descriptor handle should be close enough to characteristic handle
        this.writeAtt(
          this.readByTypeRequest(
            startHandle,
            endHandle,
            GATT_CLIENT_CHARAC_CFG_UUID
          )
        );
      } else {
        this.writeAtt(this.writeRequest(descriptorHandle, value));
      }
    };

    const error = (opcode, handle_, ecode) => {
      if (opcode === attOp) {
        debug("Gatt.notify: error %s handle %d", this._address, handle);
        this.emit(
          "notify",
          this._address,
          handle,
          descriptorHandle,
          notify,
          new Error(attEcodeMap[ecode])
        );
        doneFlag = true;
      }
    };

    const recv = (data) => {
      // Format of Read By Type Response
      // uint8_t opcode = 0x09;
      // uint8_t length; // The size of each attribute handle-value pair
      // uint8_t data[]; // A list of Attribute Data
      // Format of the Attribute Data
      // uint16_t handle; // Attribute Handle
      // uint16_t config; // Notify config
      // uint8_t data[]; // Attribute Value (Length – 4) octets
      // Format of Write Response
      // uint8_t opcode = 0x13;
      const opcode = data.readUInt8(0);
      switch (opcode) {
        case ATT_OP_READ_BY_TYPE_RESP: {
          descriptorHandle = data.readUInt16LE(2);
          let config = data.readUInt16LE(4);
          // Raise/clear notify/indicate flag
          if (notify) {
            config |= notify;
          } else {
            config &= 0xfffc;
          }
          value = Buffer.allocUnsafe(2);
          value.writeUInt16LE(config, 0);
          attOp = ATT_OP_WRITE_REQ;
          lastSend = 0;
          send();
          break;
        }
        case ATT_OP_WRITE_RESP: {
          this.emit("notify", this._address, handle, descriptorHandle, notify);
          doneFlag = true;
          break;
        }
      }
    };

    this._queueRequest(
      new AttRequest(this, { done, send, error, recv }, ATT_TIMEOUT)
    );
  }
}

module.exports = Gatt;
