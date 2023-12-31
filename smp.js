// smp.js

const debug = require("debug")("ble-hci-central:smp");

const { EventEmitter } = require("node:events");

const { addressToBuffer } = require("./common.js");
const crypto = require("./crypto.js");
const { ACL_START_NO_FLUSH } = require("./hci-defs.js");
const {
  SMP_CID,
  SMP_PAIRING_REQUEST,
  SMP_PAIRING_RESPONSE,
  SMP_PAIRING_CONFIRM,
  SMP_PAIRING_RANDOM,
  SMP_PAIRING_FAILED,
  SMP_ENCRYPT_INFO,
  SMP_MASTER_IDENT,
  OOB_DATA_DISABLE,
  KEY_DIST_ENC_KEY_MASK,
  IO_CAP_NO_INPUT_NO_OUTPUT,
  AUTH_REQ_BOND_MASK,
  KEY_DIST_NONE,
} = require("./smp-defs.js");

// Security Manager Protocol
class Smp extends EventEmitter {
  constructor(
    acl,
    localAddressType,
    localAddress,
    remoteAddressType,
    remoteAddress
  ) {
    super();
    this._acl = acl; // ACL transport
    this._iat = Buffer.from([localAddressType]);
    this._ia = addressToBuffer(localAddress);
    this._rat = Buffer.from([remoteAddressType]);
    this._ra = addressToBuffer(remoteAddress);
    this._onAclData = this.onAclData.bind(this);
    this._onAclEnd = this.onAclEnd.bind(this);
    this._acl.on("data", this._onAclData);
    this._acl.on("end", this._onAclEnd);
  }

  writeSmp(data, flags = ACL_START_NO_FLUSH) {
    debug(
      "Smp.writeSmp: flags 0x%s, data %s",
      flags.toString(16).padStart(2, "0"),
      data.toString("hex")
    );
    this._acl.write(flags, SMP_CID, data);
  }

  sendPairingRequest(options) {
    const {
      ioCaps = IO_CAP_NO_INPUT_NO_OUTPUT, // NoInputNoOutput
      oobData = OOB_DATA_DISABLE, // OOB data not present
      authReq = AUTH_REQ_BOND_MASK, // Authentication requirement (Bonding, no MITM, no SC)
      maxKeySize = 16, // Max encryption key size (128 bit)
      initiatorKeyDist = KEY_DIST_NONE, // Initiator key distribution (none)
      responderKeyDist = KEY_DIST_ENC_KEY_MASK, // Responder key distribution (EncKey)
    } = options || {};

    this._preq = Buffer.from([
      SMP_PAIRING_REQUEST,
      ioCaps, // IO capability: NoInputNoOutput
      oobData, // OOB data: Authentication data not present
      authReq, // Authentication requirement: Bonding - No MITM
      maxKeySize, // Max encryption key size
      initiatorKeyDist, // Initiator key distribution
      responderKeyDist, // Responder key distribution
    ]);

    this.writeSmp(this._preq);
  }

  onAclData(cid, data) {
    if (cid !== SMP_CID) return;
    const code = data.readUInt8(0);
    switch (code) {
      case SMP_PAIRING_RESPONSE:
        this.onPairingResponse(data);
        break;
      case SMP_PAIRING_CONFIRM:
        this.onPairingConfirm(data);
        break;
      case SMP_PAIRING_RANDOM:
        this.onPairingRandom(data);
        break;
      case SMP_PAIRING_FAILED:
        this.onPairingFailed(data);
        break;
      case SMP_ENCRYPT_INFO:
        this.onEncryptInfo(data);
        break;
      case SMP_MASTER_IDENT:
        this.onMasterIdent(data);
        break;
    }
  }

  onAclEnd() {
    this._acl.off("data", this._onAclData);
    this._acl.off("end", this._onAclEnd);
    this.emit("end");
  }

  onPairingResponse(data) {
    this._pres = data;
    this._tk = Buffer.from("00000000000000000000000000000000", "hex");
    this._r = crypto.r();
    this.writeSmp(
      Buffer.concat([
        Buffer.from([SMP_PAIRING_CONFIRM]),
        crypto.c1(
          this._tk,
          this._r,
          this._pres,
          this._preq,
          this._iat,
          this._ia,
          this._rat,
          this._ra
        ),
      ])
    );
  }

  onPairingConfirm(data) {
    this._pcnf = data;
    this.writeSmp(Buffer.concat([Buffer.from([SMP_PAIRING_RANDOM]), this._r]));
  }

  onPairingRandom(data) {
    const r = data.subarray(1);
    const pcnf = Buffer.concat([
      Buffer.from([SMP_PAIRING_CONFIRM]),
      crypto.c1(
        this._tk,
        r,
        this._pres,
        this._preq,
        this._iat,
        this._ia,
        this._rat,
        this._ra
      ),
    ]);
    if (Buffer.compare(this._pcnf, pcnf) === 0) {
      const stk = crypto.s1(this._tk, r, this._r);
      this.emit("stk", stk);
    } else {
      this.writeSmp(Buffer.from([SMP_PAIRING_RANDOM, SMP_PAIRING_CONFIRM]));
      this.emit("fail");
    }
  }

  onPairingFailed(data) {
    this.emit("fail");
  }

  onEncryptInfo(data) {
    const ltk = data.subarray(1);
    this.emit("ltk", ltk);
  }

  onMasterIdent(data) {
    const ediv = data.subarray(1, 3);
    const rand = data.subarray(3);
    this.emit("masterIdent", ediv, rand);
  }
}

module.exports = Smp;
