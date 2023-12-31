// acl.js

const { EventEmitter } = require("node:events");

const Smp = require("./smp.js");

// Asynchronous Connection-oriented Logical transport
class Acl extends EventEmitter {
  constructor(
    hci,
    handle,
    localAddressType,
    localAddress,
    remoteAddressType,
    remoteAddress
  ) {
    super();
    this._hci = hci;
    this._handle = handle; // Connection handle
    this._smp = new Smp(
      this,
      localAddressType,
      localAddress,
      remoteAddressType,
      remoteAddress
    );
    this._onSmpStk = this.onSmpStk.bind(this);
    this._onSmpFail = this.onSmpFail.bind(this);
    this._onSmpEnd = this.onSmpEnd.bind(this);
    this._smp.on("stk", this._onSmpStk);
    this._smp.on("fail", this._onSmpFail);
    this._smp.on("end", this._onSmpEnd);
  }

  encrypt(options) {
    this._smp.sendPairingRequest(options);
  }

  write(flags, cid, data) {
    this._hci.writeAclDataPkt(this._handle, flags, cid, data);
  }

  push(cid, data) {
    this.emit("data", cid, data);
  }

  pushEncrypt(encrypt) {
    this.emit("encrypt", encrypt);
  }

  close() {
    this.emit("end");
    this._smp.removeAllListeners();
    this.removeAllListeners();
  }

  onSmpStk(stk) {
    const random = Buffer.from("0000000000000000", "hex");
    const diversifier = Buffer.from("0000", "hex");
    this._hci.leStartEncryption(this._handle, random, diversifier, stk);
  }

  onSmpFail() {
    this.emit("encryptFail", this._handle);
  }

  onSmpEnd() {
    this._smp.off("stk", this._onSmpStk);
    this._smp.off("fail", this._onSmpFail);
    this._smp.off("end", this._onSmpEnd);
  }
}

module.exports = Acl;
