// hci.js

const debug = require("debug")("ble-hci-central:hci");

const { randomBytes } = require("node:crypto");
const { EventEmitter } = require("node:events");
const os = require("node:os");

const { addressToBuffer, bufferToAddress } = require("./common.js");
const {
  ACL_START,
  ACL_CONT,
  ACL_START_NO_FLUSH,
  ACL_ACTIVE_BCAST,
  ACL_PICO_BCAST,
  EVT_DISCONN_COMPLETE,
  EVT_ENCRYPT_CHANGE,
  EVT_CMD_COMPLETE,
  EVT_CMD_STATUS,
  EVT_LE_META_EVENT,
  EVT_NUM_COMP_PKTS,
  EVT_LE_CONN_COMPLETE,
  EVT_LE_ADVERTISING_REPORT,
  EVT_LE_CONN_UPDATE_COMPLETE,
  EVT_LE_READ_REMOTE_USED_FEATURES_COMPLETE,
  EVT_LE_LTK_REQUEST,
  EVT_LE_ENHANCED_CONN_COMPLETE,
  EVT_LE_EXTENDED_ADVERTISING_REPORT,
  LE_PUBLIC_ADDRESS,
  LE_SCAN_TYPE_ACTIVE,
  HCI_SUCCESS,
  HCI_COMMAND_PKT,
  HCI_EVENT_PKT,
  HCI_ACLDATA_PKT,
  HCI_SCODATA_PKT,
  HCI_VENDOR_PKT,
  HCI_OE_USER_ENDED_CONNECTION,
  OGF_HOST_CTL,
  OGF_LE_CTL,
  OGF_INFO_PARAM,
  OGF_LINK_CTL,
  OCF_SET_EVENT_MASK,
  OCF_LE_SET_EVENT_MASK,
  OCF_READ_LOCAL_VERSION,
  OCF_WRITE_LE_HOST_SUPPORTED,
  OCF_READ_LE_HOST_SUPPORTED,
  OCF_LE_READ_BUFFER_SIZE,
  OCF_READ_BD_ADDR,
  OCF_READ_BUFFER_SIZE,
  OCF_LE_SET_SCAN_ENABLE,
  OCF_LE_SET_SCAN_PARAMETERS,
  OCF_LE_CREATE_CONN,
  OCF_LE_CREATE_EXTENDED_CONN,
  OCF_LE_SET_EXTENDED_SCAN_ENABLE,
  OCF_SET_PHY,
  OCF_LE_SET_EXTENDED_SCAN_PARAMETERS,
  OCF_RESET,
  OCF_READ_LOCAL_COMMANDS,
  OCF_LE_SET_RANDOM_ADDRESS,
  OCF_LE_CONN_UPDATE,
  OCF_LE_CREATE_CONN_CANCEL,
  OCF_LE_START_ENCRYPTION,
  OCF_DISCONNECT,
  OGF_STATUS_PARAM,
  OCF_READ_RSSI,
  OCF_LE_READ_REMOTE_USED_FEATURES,
  EVT_CONN_COMPLETE,
  EVT_AUTH_COMPLETE,
  EVT_IO_CAPABILITY_REQUEST,
  EVT_USER_PASSKEY_REQUEST,
  OCF_READ_REMOTE_FEATURES,
  OCF_READ_REMOTE_EXT_FEATURES,
  OCF_SET_CONN_ENCRYPT,
  OCF_WRITE_SIMPLE_PAIRING_MODE,
  OCF_LE_CLEAR_RESOLV_LIST,
  OGF_LINK_POLICY,
  OCF_WRITE_DEFAULT_LINK_POLICY,
  OCF_LE_ADD_DEVICE_TO_WHITE_LIST,
  OCF_WRITE_CONN_ACCEPT_TIMEOUT,
  OCF_SET_EVENT_FLT,
  OCF_LE_CLEAR_WHITE_LIST,
  OCF_LE_REMOVE_DEVICE_FROM_WHITE_LIST,
  OCF_DELETE_STORED_LINK_KEY,
  OCF_WRITE_PAGE_TIMEOUT,
} = require("./hci-defs.js");
const HciSocket = require("./hci-socket.js");
const hciStatusMap = require("./hci-status.json");
const localCommandsMap = require("./hci-local-commands.json");

const hciEventTypeMap = {
  [HCI_EVENT_PKT]: "HCI_EVENT_PKT",
  [HCI_COMMAND_PKT]: "HCI_COMMAND_PKT",
  [HCI_ACLDATA_PKT]: "HCI_ACLDATA_PKT",
  [HCI_SCODATA_PKT]: "HCI_SCODATA_PKT",
  [HCI_VENDOR_PKT]: "HCI_VENDOR_PKT",
};

const hciSubEventTypeMap = {
  [EVT_DISCONN_COMPLETE]: "EVT_DISCONN_COMPLETE",
  [EVT_ENCRYPT_CHANGE]: "EVT_ENCRYPT_CHANGE",
  [EVT_CMD_COMPLETE]: "EVT_CMD_COMPLETE",
  [EVT_CMD_STATUS]: "EVT_CMD_STATUS",
  [EVT_LE_META_EVENT]: "EVT_LE_META_EVENT",
  [EVT_NUM_COMP_PKTS]: "EVT_NUM_COMP_PKTS",
};

const hciLeMetaSubEventTypeMap = {
  [EVT_LE_CONN_COMPLETE]: "EVT_LE_CONN_COMPLETE",
  [EVT_LE_ADVERTISING_REPORT]: "EVT_LE_ADVERTISING_REPORT",
  [EVT_LE_CONN_UPDATE_COMPLETE]: "EVT_LE_CONN_UPDATE_COMPLETE",
  [EVT_LE_READ_REMOTE_USED_FEATURES_COMPLETE]:
    "EVT_LE_READ_REMOTE_USED_FEATURES_COMPLETE",
  [EVT_LE_LTK_REQUEST]: "EVT_LE_LTK_REQUEST",
  [EVT_LE_ENHANCED_CONN_COMPLETE]: "EVT_LE_ENHANCED_CONN_COMPLETE",
  [EVT_LE_EXTENDED_ADVERTISING_REPORT]: "EVT_LE_EXTENDED_ADVERTISING_REPORT",
};

const hciCommandMap = {
  [OCF_RESET | (OGF_HOST_CTL << 10)]: "OCF_RESET",
  [OCF_WRITE_CONN_ACCEPT_TIMEOUT | (OGF_HOST_CTL << 10)]:
    "OCF_WRITE_CONN_ACCEPT_TIMEOUT",
  [OCF_WRITE_PAGE_TIMEOUT | (OGF_HOST_CTL << 10)]: "OCF_WRITE_PAGE_TIMEOUT",
  [OCF_LE_SET_RANDOM_ADDRESS | (OGF_LE_CTL << 10)]: "OCF_LE_SET_RANDOM_ADDRESS",
  [OCF_READ_LOCAL_COMMANDS | (OGF_INFO_PARAM << 10)]: "OCF_READ_LOCAL_COMMANDS",
  [OCF_SET_EVENT_FLT | (OGF_HOST_CTL << 10)]: "OCF_SET_EVENT_FLT",
  [OCF_SET_EVENT_MASK | (OGF_HOST_CTL << 10)]: "OCF_SET_EVENT_MASK",
  [OCF_LE_SET_EVENT_MASK | (OGF_LE_CTL << 10)]: "OCF_LE_SET_EVENT_MASK",
  [OCF_READ_LOCAL_VERSION | (OGF_INFO_PARAM << 10)]: "OCF_READ_LOCAL_VERSION",
  [OCF_WRITE_SIMPLE_PAIRING_MODE | (OGF_HOST_CTL << 10)]:
    "OCF_WRITE_SIMPLE_PAIRING_MODE",
  [OCF_WRITE_LE_HOST_SUPPORTED | (OGF_HOST_CTL << 10)]:
    "OCF_WRITE_LE_HOST_SUPPORTED",
  [OCF_READ_LE_HOST_SUPPORTED | (OGF_HOST_CTL << 10)]:
    "OCF_READ_LE_HOST_SUPPORTED",
  [OCF_DELETE_STORED_LINK_KEY | (OGF_HOST_CTL << 10)]:
    "OCF_DELETE_STORED_LINK_KEY",
  [OCF_READ_BUFFER_SIZE | (OGF_INFO_PARAM << 10)]: "OCF_READ_BUFFER_SIZE",
  [OCF_LE_READ_BUFFER_SIZE | (OGF_LE_CTL << 10)]: "OCF_LE_READ_BUFFER_SIZE",
  [OCF_READ_BD_ADDR | (OGF_INFO_PARAM << 10)]: "OCF_READ_BD_ADDR",
  [OCF_LE_SET_SCAN_ENABLE | (OGF_LE_CTL << 10)]: "OCF_LE_SET_SCAN_ENABLE",
  [OCF_LE_SET_EXTENDED_SCAN_ENABLE | (OGF_LE_CTL << 10)]:
    "OCF_LE_SET_EXTENDED_SCAN_ENABLE",
  [OCF_LE_SET_SCAN_PARAMETERS | (OGF_LE_CTL << 10)]:
    "OCF_LE_SET_SCAN_PARAMETERS",
  [OCF_LE_SET_EXTENDED_SCAN_PARAMETERS | (OGF_LE_CTL << 10)]:
    "OCF_LE_SET_EXTENDED_SCAN_PARAMETERS",
  [OCF_LE_CLEAR_WHITE_LIST | (OGF_LE_CTL << 10)]: "OCF_LE_CLEAR_WHITE_LIST",
  [OCF_LE_ADD_DEVICE_TO_WHITE_LIST | (OGF_LE_CTL << 10)]:
    "OCF_LE_ADD_DEVICE_TO_WHITE_LIST",
  [OCF_LE_REMOVE_DEVICE_FROM_WHITE_LIST | (OGF_LE_CTL << 10)]:
    "OCF_LE_REMOVE_DEVICE_FROM_WHITE_LIST",
  [OCF_LE_CREATE_CONN | (OGF_LE_CTL << 10)]: "OCF_LE_CREATE_CONN",
  [OCF_READ_REMOTE_FEATURES | (OGF_LE_CTL << 10)]: "OCF_READ_REMOTE_FEATURES",
  [OCF_READ_REMOTE_EXT_FEATURES | (OGF_LE_CTL << 10)]:
    "OCF_READ_REMOTE_EXT_FEATURES",
  [OCF_LE_READ_REMOTE_USED_FEATURES | (OGF_LE_CTL << 10)]:
    "OCF_LE_READ_REMOTE_USED_FEATURES",
  [OCF_LE_CLEAR_RESOLV_LIST | (OGF_LE_CTL << 10)]: "OCF_LE_CLEAR_RESOLV_LIST",
  [OCF_LE_CREATE_EXTENDED_CONN | (OGF_LE_CTL << 10)]:
    "OCF_LE_CREATE_EXTENDED_CONN",
  [OCF_LE_CONN_UPDATE | (OGF_LE_CTL << 10)]: "OCF_LE_CONN_UPDATE",
  [OCF_LE_CREATE_CONN_CANCEL | (OGF_LE_CTL << 10)]: "OCF_LE_CREATE_CONN_CANCEL",
  [OCF_LE_START_ENCRYPTION | (OGF_LE_CTL << 10)]: "OCF_LE_START_ENCRYPTION",
  [OCF_SET_CONN_ENCRYPT | (OGF_LINK_CTL << 10)]: "OCF_SET_CONN_ENCRYPT",
  [OCF_DISCONNECT | (OGF_LINK_CTL << 10)]: "OCF_DISCONNECT",
  [OCF_READ_RSSI | (OGF_STATUS_PARAM << 10)]: "OCF_READ_RSSI",
  [OCF_WRITE_DEFAULT_LINK_POLICY | (OGF_LINK_POLICY << 10)]:
    "OCF_WRITE_DEFAULT_LINK_POLICY",
};

const hciAclFlagMap = {
  [ACL_START_NO_FLUSH]: "ACL_START_NO_FLUSH",
  [ACL_CONT]: "ACL_CONT",
  [ACL_START]: "ACL_START",
  [ACL_ACTIVE_BCAST]: "ACL_ACTIVE_BCAST",
  [ACL_PICO_BCAST]: "ACL_PICO_BCAST",
};

// Next Thing Co. C.H.I.P always allow duplicates
const isNextThingChip =
  os.platform() === "linux" && os.release().indexOf("-ntc") >= 0;

const logLocalCommands = (data, prefix) => {
  for (let i = 0, k = 0; i < 64; i++) {
    for (let j = 0; j < 8; j++, k++) {
      if (data.readUInt8(i) & (1 << j)) {
        debug(
          "%s%s (Octet %d - Bit %d)",
          prefix,
          k < localCommandsMap.length ? localCommandsMap[k] : "Unknown",
          i,
          j
        );
      }
    }
  }
};

class Hci extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this._isExtended = !!options.extended;
    this.addressType =
      options.addressType === undefined
        ? LE_PUBLIC_ADDRESS
        : options.addressType;
    this._aclBuffersPromise = new Promise((resolve) => {
      this._resolveAclBuffers = resolve;
    });
    this._aclDataBuffers = {};
    this._aclConnections = {};
    this._aclQueue = [];
    this._socket = new HciSocket();
    this._socket.on("data", this.onSocketData.bind(this));
    this._socket.on("error", this.onSocketError.bind(this));
  }

  availableL2Sockets() {
    return this._socket.availableL2Sockets();
  }

  setAuth(enabled) {
    this._socket.setAuth(!!enabled);
  }

  setEncrypt(enabled) {
    this._socket.setEncrypt(!!enabled);
  }

  start() {
    this._deviceId = this._socket.bind();
    debug("Hci.start: deviceId %d", this._deviceId);
    this.setSocketFilter();
    this._socket.start();
    if (!this._socket.isDeviceUp()) {
      debug("Hci.start: device is down");
      this.stop();
    }
    debug("Hci.start: device is up");
    this.emit("start");
    this.reset();
  }

  stop() {
    this._socket.stop();
    this.emit("stop");
  }

  async getAclBuffers() {
    if (this._aclBuffers) return this._aclBuffers;
    return await this._aclBuffersPromise;
  }

  setAclBuffers(pktLen, maxPkt) {
    if (this._aclBuffers) {
      this._aclBuffers.pktLen = pktLen;
      this._aclBuffers.maxPkt = maxPkt;
    } else {
      this._aclBuffers = { pktLen, maxPkt };
      this._resolveAclBuffers(this._aclBuffers);
    }
  }

  onSocketError(error) {
    debug("Hci.onSocketError: %o", error);
    if (error.code === "EPERM") {
      this.stop();
    } else if (error.message === "Network is down") {
      this.stop();
    } else if (error.message === "L2SocketNotConnected") {
      this.stop();
    }
  }

  onSocketData(data) {
    try {
      // debug("Hci.onSocketData: %o", data.toString("hex"));
      // uint8_t evt_type;
      // ...
      const eventType = data.readUInt8(0);

      // debug(
      //   "Hci.onSocketData: eventType %d %s",
      //   eventType,
      //   hciEventTypeMap[eventType]
      // );

      switch (eventType) {
        case HCI_COMMAND_PKT:
          this.onHciCommandPkt(data);
          break;
        case HCI_ACLDATA_PKT:
          this.onHciAclDataPkt(data);
          break;
        // case HCI_SCODATA_PKT:
        //   this.onHciScoDataPkt(data);
        //   break;
        case HCI_EVENT_PKT:
          this.onHciEventPkt(data);
          break;
        // case HCI_VENDOR_PKT:
        //   this.onHciVendorPkt(data);
        //   break;
      }
    } catch (error) {
      debug("Hci.onSocketData: error %o", error);
    }
  }

  onHciCommandPkt(data) {
    // uint8_t evt_type;
    // uint16_t opcode; // OCF & OGF
    // uint8_t plen;
    // ...
    const opcode = data.readUInt16LE(1);
    const plen = data.readUInt8(3);

    debug(
      "Hci.onHciCommandPkt: (0x%s|0x%s) %s, plen %d",
      ((opcode >> 10) & 0x003f).toString(16).padStart(2, "0"),
      (opcode & 0x03ff).toString(16).padStart(4, "0"),
      hciCommandMap[opcode],
      plen
    );

    switch (opcode) {
      case OCF_LE_SET_SCAN_ENABLE | (OGF_LE_CTL << 10): {
        // uint8_t evt_type;
        // uint16_t opcode; // OCF & OGF
        // uint8_t plen;
        // uint8_t enable;
        // uint8_t filter_duplicates;
        const enable = data.readUInt8(4);
        const filterDuplicates = data.readUInt8(5);
        this.emit("leSetScanEnableCommand", enable, filterDuplicates);
        break;
      }
      case OCF_LE_SET_EXTENDED_SCAN_ENABLE | (OGF_LE_CTL << 10): {
        // uint8_t evt_type;
        // uint16_t opcode; // OCF & OGF
        // uint8_t plen;
        // uint8_t enable;
        // uint8_t filter_duplicates;
        // uint16_t duration
        // uint16_t period
        const enable = data.readUInt8(4);
        const filterDuplicates = data.readUInt8(5);
        const duration = data.readUInt16(6);
        const period = data.readUInt16(8);
        this.emit(
          "leSetExtendedScanEnableCommand",
          enable,
          filterDuplicates,
          duration,
          period
        );
        break;
      }
    }
  }

  onHciAclDataPkt(data) {
    // uint8_t evt_type;
    // uint16_t handle; // Handle & Flags(PB, BC)
    // uint16_t dlen;
    // ...
    let handle = data.readUInt16LE(1);
    const flags = (handle >> 12) & 0x000f;
    handle = handle & 0x0fff;
    const dlen = data.readUInt16LE(3);

    debug(
      "Hci.onHciAclDataPkt: handle %d, flags %s, dlen %d",
      handle,
      hciAclFlagMap[flags],
      dlen
    );
    switch (flags) {
      case ACL_START_NO_FLUSH:
        // WARNING: not allowed from controller to host
        // uint8_t evt_type;
        // uint16_t handle; // Handle & Flags(PB, BC)
        // uint16_t dlen;
        // uint16_t length;
        // uint16_t cid;
        // uint8_t data[0..length-1]
        const cid = data.readUInt16LE(7);
        debug(
          "Hci.onHciAclDataPkt: handle %d, flags %s, dlen %d, cid %d",
          handle,
          hciAclFlagMap[flags],
          dlen,
          cid
        );
        break;
      case ACL_START: {
        // uint8_t evt_type;
        // uint16_t handle; // Handle & Flags(PB, BC)
        // uint16_t dlen;
        // uint16_t length;
        // uint16_t cid;
        // uint8_t data[0..length-1]
        const length = data.readUInt16LE(5);
        const cid = data.readUInt16LE(7);
        data = data.subarray(9);
        if (length === data.length) {
          this.emit("aclDataPkt", handle, cid, data);
        } else {
          this._aclDataBuffers[handle] = { length, cid, data };
        }
        break;
      }
      case ACL_CONT: {
        // uint8_t evt_type;
        // uint16_t handle; // Handle & Flags(PB, BC)
        // uint16_t dlen;
        // uint8_t data[0..dlen-1]
        const aclDataBuffer = this._aclDataBuffers[handle];
        if (!aclDataBuffer || !aclDataBuffer.data) {
          return;
        }
        aclDataBuffer.data = Buffer.concat([
          aclDataBuffer.data,
          data.subarray(5),
        ]);
        if (aclDataBuffer.length === aclDataBuffer.data.length) {
          this.emit(
            "aclDataPkt",
            handle,
            aclDataBuffer.cid,
            aclDataBuffer.data
          );
          delete this._aclDataBuffers[handle];
        }
        break;
      }
    }
  }

  onHciScoDataPkt(data) {
    // uint8_t evt_type;
    // uint16_t handle;
    // uint16_t dlen;
    // ...
    const handle = data.readUInt16LE(1);
    const dlen = data.readUInt16LE(3);
    debug("Hci.onHciScoDataPkt: handle %d, dlen %d", handle, dlen);
  }

  onHciEventPkt(data) {
    // uint8_t evt_type;
    // uint8_t sub_evt_type;
    // uint8_t plen;
    // ...
    const subEventType = data.readUInt8(1);
    const plen = data.readUInt8(2);

    debug(
      "Hci.onHciEventPkt: subEventType %d %s, plen %d",
      subEventType,
      hciSubEventTypeMap[subEventType],
      plen
    );

    switch (subEventType) {
      case EVT_DISCONN_COMPLETE: {
        // uint8_t evt_type;
        // uint8_t sub_evt_type;
        // uint8_t plen;
        // uint8_t status;
        // uint16_t handle;
        // uint8_t reason;
        const handle = data.readUInt16LE(4);
        const reason = data.readUInt8(6);
        this._aclQueue = this._aclQueue.filter((acl) => acl.handle !== handle);
        delete this._aclConnections[handle];
        this.flushAclQueue();
        this.emit("disconnComplete", handle, reason);
        break;
      }
      case EVT_ENCRYPT_CHANGE: {
        // uint8_t evt_type;
        // uint8_t sub_evt_type;
        // uint8_t plen;
        // uint8_t status;
        // uint16_t handle;
        // uint8_t encrypt;
        const handle = data.readUInt16LE(4);
        const encrypt = data.readUInt8(6);
        this.emit("encryptChange", handle, encrypt);
        break;
      }
      case EVT_CMD_COMPLETE:
        this.onEvtCmdComplete(data);
        break;
      case EVT_CMD_STATUS:
        this.onEvtCmdStatus(data);
        break;
      case EVT_LE_META_EVENT:
        this.onEvtLeMetaEvent(data);
        break;
      case EVT_NUM_COMP_PKTS: {
        this.onEvtNumCompPkts(data);
        break;
      }
    }
  }

  onHciVendorPkt(data) {
    // uint8_t evt_type;
    // uint16_t device;
    // uint16_t type;
    // uint16_t dlen;
    // ...
    const device = data.readUInt16LE(1);
    const type = data.readUInt16LE(3);
    const dlen = data.readUInt16LE(5);

    debug(
      "Hci.onHciVendorPkt: device %d, type %d, dlen %d",
      device,
      type,
      dlen
    );
  }

  onEvtCmdComplete(data) {
    // uint8_t evt_type;
    // uint8_t sub_evt_type;
    // uint8_t plen;
    // uint8_t ncmd;
    // ...
    const ncmd = data.readUInt8(3);
    data = data.subarray(4);
    for (let icmd = 0; icmd < ncmd; icmd++) {
      // uint16_t opcode;
      // uint8_t status;
      // ...
      const opcode = data.readUInt16LE(0);
      const status = data.readUInt8(2);

      debug(
        "Hci.onEvtCmdComplete: %s ncmd %d/%d, dlen %d, status %d %s",
        hciCommandMap[opcode],
        icmd,
        ncmd,
        data.length,
        status,
        hciStatusMap[status]
      );

      switch (opcode) {
        case OCF_RESET | (OGF_HOST_CTL << 10): {
          // uint16_t opcode;
          // uint8_t status;
          data = data.subarray(3);
          this.emit("reset", status);
          if (status !== HCI_SUCCESS) break;
          if (this._isExtended) this.setPhy();
          // this.setEventFilter();
          // this.writeConnAcceptTimeout(30000);
          // this.writePageTimeout(30000);
          this.setEventMask();
          this.leSetEventMask();
          // this.leClearWhiteList();
          // this.leClearResolvingList();
          // this.writeDefaultLinkPolicy();
          // this.deleteStoredLinkKey(); // Unknown HCI Command
          this.readLocalVersion();
          this.readLocalCommands();
          // this.writeSimplePairingMode(true);
          this.writeLeHostSupported();
          this.readLeHostSupported();
          this.leReadBufferSize();
          this.readBdAddr();
          break;
        }

        case OCF_READ_LOCAL_COMMANDS | (OGF_INFO_PARAM << 10): {
          // uint16_t opcode;
          // uint8_t status;
          // uint8_t commands[64];
          data = data.subarray(3);
          const extendedScanParameters = data.readUInt8(37) & 0x10; // LE Set Extended Scan Parameters (Octet 37 - Bit 5)
          const extendedScan = data.readUInt8(37) & 0x20; // LE Set Extended Scan Enable (Octet 37 - Bit 6)
          logLocalCommands(data, "  ");
          data = data.subarray(64);
          if (status !== HCI_SUCCESS) break;

          debug(
            "Hci.onEvtCmdComplete: %s extendedScanParameters %d, extendedScan %d",
            hciCommandMap[opcode],
            extendedScanParameters,
            extendedScan
          );
          if (extendedScanParameters && extendedScan) {
            if (!this._isExtended) {
              this._isExtended = true;
              // TODO: save to flash and pass to constructor options, then restart
            }
          }
          break;
        }

        case OCF_READ_LOCAL_VERSION | (OGF_INFO_PARAM << 10): {
          // uint16_t opcode;
          // uint8_t status;
          // uint8_t hci_ver;
          // uint16_t hci_rev;
          // uint8_t lmp_ver;
          // uint16_t manufacturer;
          // uint16_t lmp_subver;
          const hciVer = data.readUInt8(3);
          const hciRev = data.readUInt16LE(4);
          const lmpVer = data.readInt8(6);
          const manufacturer = data.readUInt16LE(7);
          const lmpSubVer = data.readUInt16LE(9);
          data = data.subarray(11);
          if (status !== HCI_SUCCESS) break;

          debug(
            "Hci.onEvtCmdComplete: %s hciVer %d, hciRev %d, lmpVer %d, manufacturer %d, lmpSubVer %d",
            hciCommandMap[opcode],
            hciVer,
            hciRev,
            lmpVer,
            manufacturer,
            lmpSubVer
          );
          if (hciVer < 0x06) {
            debug("Hci.start: unsupported device version");
            this.stop();
          }
          this.emit(
            "readLocalVersion",
            hciVer,
            hciRev,
            lmpVer,
            manufacturer,
            lmpSubVer
          );
          break;
        }

        case OCF_READ_LE_HOST_SUPPORTED | (OGF_HOST_CTL << 10): {
          // uint16_t opcode;
          // uint8_t status;
          // uint8_t le;
          // uint8_t simul;
          const le = data.readUInt8(3);
          const simul = data.readUInt8(4);
          data = data.subarray(5);
          if (status !== HCI_SUCCESS) break;

          debug(
            "Hci.onEvtCmdComplete: %s le %d, simul %d",
            hciCommandMap[opcode],
            le,
            simul
          );
          this.emit("readLeHostSupported", le, simul);
          break;
        }

        case OCF_READ_BUFFER_SIZE | (OGF_INFO_PARAM << 10): {
          // uint16_t opcode;
          // uint8_t status;
          // uint16_t acl_mtu;
          // uint8_t sco_mtu;
          // uint16_t acl_max_pkt;
          // uint16_t sco_max_pkt;
          // ...
          const aclMtu = data.readUInt16LE(3);
          const aclMaxPkt = data.readUInt16LE(6);
          data = data.subarray(10);
          if (status !== HCI_SUCCESS) break;

          debug(
            "Hci.onEvtCmdComplete: %s aclMtu %d, aclMaxPkt %d",
            hciCommandMap[opcode],
            aclMtu,
            aclMaxPkt
          );
          this.setAclBuffers(aclMtu, aclMaxPkt);
          // this.emit("readBufferSize", aclMtu, aclMaxPkt);
          break;
        }

        case OCF_LE_READ_BUFFER_SIZE | (OGF_LE_CTL << 10): {
          // uint16_t opcode;
          // uint8_t status;
          // uint16_t pkt_len;
          // uint8_t max_pkt;
          // ...
          const pktLen = data.readUInt16LE(3);
          const maxPkt = data.readUInt8(5);
          data = data.subarray(6);
          if (status !== HCI_SUCCESS) break;

          debug(
            "Hci.onEvtCmdComplete: %s pktLen %d, maxPkt %d",
            hciCommandMap[opcode],
            pktLen,
            maxPkt
          );

          // Spec Vol 4 Part E.7.8
          // No dedicated LE Buffer exists. Use the HCI_Read_Buffer_Size command.
          if (pktLen === 0 || maxPkt === 0) {
            this.readBufferSize();
          } else {
            this.setAclBuffers(pktLen, maxPkt);
          }
          // this.emit("leReadBufferSize", pktLen, maxPkt);
          break;
        }

        case OCF_READ_BD_ADDR | (OGF_INFO_PARAM << 10): {
          // uint16_t opcode;
          // uint8_t status;
          // bdaddr_t bdaddr;
          // ...
          this.addressType = LE_PUBLIC_ADDRESS;
          this.address = bufferToAddress(data, 3);
          data = data.subarray(9);
          if (status !== HCI_SUCCESS) break;

          debug(
            "Hci.onEvtCmdComplete: %s addressType %d, address %s",
            hciCommandMap[opcode],
            this.addressType,
            this.address
          );
          this.emit("readBdAddr", this.addressType, this.address);
          break;
        }

        case OCF_LE_SET_SCAN_PARAMETERS | (OGF_LE_CTL << 10):
        case OCF_LE_SET_EXTENDED_SCAN_PARAMETERS | (OGF_LE_CTL << 10): {
          // uint16_t opcode;
          // uint8_t status;
          data = data.subarray(3);
          this.emit("leSetScanParameters", status);
          break;
        }

        case OCF_LE_SET_SCAN_ENABLE | (OGF_LE_CTL << 10):
        case OCF_LE_SET_EXTENDED_SCAN_ENABLE | (OGF_LE_CTL << 10): {
          // uint16_t opcode;
          // uint8_t status;
          data = data.subarray(3);
          this.emit("leSetScanEnable", status);
          break;
        }

        case OCF_READ_RSSI | (OGF_STATUS_PARAM << 10): {
          // uint16_t opcode;
          // uint8_t status;
          // uint16_t handle;
          // int8_t rssi;
          const handle = result.readUInt16LE(3);
          const rssi = result.readInt8(5);
          data = data.subarray(6);
          if (status !== HCI_SUCCESS) break;

          debug(
            "Hci.onEvtCmdComplete: %s handle %d, rssi %d",
            hciCommandMap[opcode],
            handle,
            rssi
          );
          this.emit("rssiRead", handle, rssi);
        }

        default: {
          // uint16_t opcode;
          // uint8_t status;
          data = data.subarray(3);
          break;
        }
      }
    }

    debug(
      "Hci.onEvtCmdComplete: unparsed %d %s",
      data.length,
      data.toString("hex")
    );
  }

  onEvtCmdStatus(data) {
    // uint8_t evt_type;
    // uint8_t sub_evt_type;
    // uint8_t plen;
    // uint8_t status;
    // uint8_t ncmd; // The Number of HCI command packets which are allowed to be sent to the Controller from the Host.
    // uint16_t opcode; // Opcode of the command which caused this event and is pending completion.
    const status = data.readUInt8(3);
    const ncmd = data.readUInt8(4);
    const opcode = data.readUInt16LE(5);

    debug(
      "Hci.onEvtCmdStatus: (0x%s|0x%s) %s ncmd %d, status %d %s",
      ((opcode >> 10) & 0x003f).toString(16).padStart(2, "0"),
      (opcode & 0x03ff).toString(16).padStart(4, "0"),
      hciCommandMap[opcode],
      ncmd,
      status,
      hciStatusMap[status]
    );

    switch (opcode) {
      case OCF_LE_CREATE_CONN | (OGF_LE_CTL << 10):
      case OCF_LE_CREATE_EXTENDED_CONN | (OGF_LE_CTL << 10):
        // Successful LE connection notified via EVT_LE_META_EVENT.EVT_LE_CONN_COMPLETE
        if (status !== HCI_SUCCESS) {
          this.emit("leConnComplete", status);
        }
        break;
    }
  }

  onEvtLeMetaEvent(data) {
    // uint8_t evt_type;
    // uint8_t sub_evt_type;
    // uint8_t plen;
    // uint8_t sub_evt;
    // ...
    const subEvent = data.readUInt8(3);
    data = data.subarray(4);

    // debug(
    //   "Hci.onEvtLeMetaEvent: subEvent %d %s",
    //   subEvent,
    //   hciLeMetaSubEventTypeMap[subEvent]
    // );

    switch (subEvent) {
      case EVT_LE_CONN_COMPLETE:
        this.onEvtLeConnComplete(data);
        break;
      case EVT_LE_ADVERTISING_REPORT:
        this.onEvtLeAdvertisingReport(data);
        break;
      case EVT_LE_CONN_UPDATE_COMPLETE:
        this.onEvtLeConnUpdateComplete(data);
        break;
      case EVT_LE_READ_REMOTE_USED_FEATURES_COMPLETE:
        this.onEvtLeReadRemoteUsedFeaturesComplete(data);
        break;
      case EVT_LE_LTK_REQUEST:
        // uint16_t handle;
        // uint64_t random;
        // uint16_t diversifier;
        // const handle = data.readUInt16LE(0);
        break;
      case EVT_LE_ENHANCED_CONN_COMPLETE:
        this.onEvtLeEnhancedConnComplete(data);
        break;
      case EVT_LE_EXTENDED_ADVERTISING_REPORT:
        this.onEvtLeExtendedAdvertisingReport(data);
        break;
    }
  }

  onEvtNumCompPkts(data) {
    // uint8_t evt_type;
    // uint8_t sub_evt_type;
    // uint8_t plen;
    // uint8_t num_hndl;
    // uint16_t handle;
    // uint16_t num_pkts;
    // ...
    const numHandles = data.readUInt8(3);
    for (let i = 0; i < numHandles; i++) {
      const handle = data.readUInt16LE(4 + i * 4);
      const numPkts = data.readUInt16LE(6 + i * 4);

      debug(
        "Hci.onEvtNumCompPkts: numHandles %d/%d, handle %d, numPkts %d",
        i,
        numHandles,
        handle,
        numPkts
      );
      const connection = this._aclConnections[handle];
      if (connection) {
        connection.pending -= numPkts;
        if (connection.pending < 0) {
          connection.pending = 0;
        }
      }
    }
    this.flushAclQueue();
  }

  onEvtLeConnComplete(data) {
    // uint8_t status;
    // uint16_t handle;
    // uint8_t role;
    // uint8_t peer_bdaddr_type;
    // bdaddr_t peer_bdaddr;
    // uint16_t interval;
    // uint16_t latency;
    // uint16_t supervision_timeout;
    // uint8_t master_clock_accuracy;
    const status = data.readUInt8(0);
    const handle = data.readUInt16LE(1);
    const role = data.readUInt8(3);
    const peerAddressType = data.readUInt8(4);
    const peerAddress = bufferToAddress(data, 5);
    const interval = data.readUInt16LE(11);
    const latency = data.readUInt16LE(13);
    const supervisionTimeout = data.readUInt16LE(15);
    const masterClockAccuracy = data.readUInt8(17);

    debug(
      "Hci.onEvtLeConnComplete: status %d %s, handle %d, role %d, peerAddressType %d, peerAddress %s, interval %d, latency %d, supervisionTimeout %d, masterClockAccuracy %d",
      status,
      hciStatusMap[status],
      handle,
      role,
      peerAddressType,
      peerAddress,
      interval,
      latency,
      supervisionTimeout,
      masterClockAccuracy
    );

    // Initialize ACL connection
    this._aclConnections[handle] = { pending: 0 };

    this.emit(
      "leConnComplete",
      status,
      handle,
      role,
      peerAddressType,
      peerAddress,
      interval,
      latency,
      supervisionTimeout,
      masterClockAccuracy
    );
  }

  onEvtLeReadRemoteUsedFeaturesComplete(data) {
    // uint8_t status;
    // uint16_t handle;
    // uint8_t features[8];
    const status = data.readUInt8(0);
    const handle = data.readUInt16LE(1);

    debug(
      "Hci.onEvtLeReadRemoteUsedFeaturesComplete: status %d %s, handle %d, features %s",
      status,
      hciStatusMap[status],
      handle,
      data.subarray(3).toString("hex")
    );
  }

  onEvtLeEnhancedConnComplete(data) {
    // uint8_t status;
    // uint16_t handle;
    // uint8_t role;
    // uint8_t peer_bdaddr_type;
    // bdaddr_t peer_bdaddr;
    // uint16_t interval;
    // uint16_t latency;
    // uint16_t supervision_timeout;
    // uint8_t master_clock_accuracy;
    const status = data.readUInt8(0);
    const handle = data.readUInt16LE(1);
    const role = data.readUInt8(3);
    const peerAddressType = data.readUInt8(4);
    const peerAddress = bufferToAddress(data, 5);
    const localResolvablePrivateAddress = bufferToAddress(data, 11);
    const peerResolvablePrivateAddress = bufferToAddress(data, 17);
    const interval = data.readUInt16LE(23);
    const latency = data.readUInt16LE(25);
    const supervisionTimeout = data.readUInt16LE(27);
    const masterClockAccuracy = data.readUInt8(28);

    debug(
      "Hci.onEvtLeEnhancedConnComplete: status %d %s, handle %d, role %d, peerAddress %d, peerAddress %s, localResolvablePrivateAddress %s, peerResolvablePrivateAddress %s, interval %d, latency %d, supervisionTimeout %d, masterClockAccuracy %d",
      status,
      hciStatusMap[status],
      handle,
      role,
      peerAddressType,
      peerAddress,
      localResolvablePrivateAddress,
      peerResolvablePrivateAddress,
      interval,
      latency,
      supervisionTimeout,
      masterClockAccuracy
    );

    // Initialize ACL connection
    this._aclConnections[handle] = { pending: 0 };

    this.emit(
      "leConnComplete",
      status,
      handle,
      role,
      peerAddressType,
      peerAddress,
      interval,
      latency,
      supervisionTimeout,
      masterClockAccuracy,
      localResolvablePrivateAddress,
      peerResolvablePrivateAddress
    );
  }

  onEvtLeAdvertisingReport(data) {
    // uint8_t num_reports
    //  uint8_t evt_type;
    //  uint8_t bdaddr_type;
    //  bdaddr_t bdaddr;
    //  uint8_t adv_length;
    //  uint8_t adv_data[0..adv_length-1];
    //  int8_t rssi;
    // ...
    const numReports = data.readUInt8(0);
    data = data.subarray(1);
    for (let i = 0; i < numReports; i++) {
      const type = data.readUInt8(0);
      const addressType = data.readUInt8(1);
      const address = bufferToAddress(data, 2);
      const advLength = data.readUInt8(8);
      const advData = data.subarray(9, advLength + 9);
      const rssi = data.readInt8(advLength + 9);
      data = data.subarray(advLength + 10);

      debug(
        "Hci.onEvtLeAdvertisingReport: type %d, addressType %d, address %s, advLength %d, advData %s, rssi %d, numReports %d/%d",
        type,
        addressType,
        address,
        advLength,
        advData.toString("hex"),
        rssi,
        i,
        numReports
      );

      this.emit(
        "leAdvertisingReport",
        type,
        addressType,
        address,
        advLength,
        advData,
        rssi,
        numReports
      );
    }
  }

  onEvtLeExtendedAdvertisingReport(data) {
    // uint8_t num_reports
    //  uint8_t evt_type;
    //  uint8_t bdaddr_type;
    //  bdaddr_t bdaddr;
    //  uint8_t primary_phy;
    //  uint8_t secondary_phy;
    //  uint8_t sid;
    //  uint8_t txpower;
    //  int8_t rssi;
    //  uint8_t periodic_adv_interval;
    //  uint8_t direct_address_type;
    //  bdaddr_t direct_address;
    //  uint8_t adv_length;
    //  uint8_t adv_data[0..adv_length-1];
    //  int8_t rssi;
    // ...
    const numReports = data.readUInt8(0);
    data = data.subarray(1);
    try {
      for (let i = 0; i < numReports; i++) {
        const type = data.readUInt16LE(0);
        const addressType = data.readUInt8(2);
        const address = bufferToAddress(data, 3);
        const primaryPhy = data.readUInt8(9);
        const secondaryPhy = data.readUInt8(10);
        const sid = data.readUInt8(11);
        const txpower = data.readUInt8(12);
        const rssi = data.readInt8(13);
        const periodicAdvInterval = data.readUInt16LE(14);
        const directAddressType = data.readUInt8(16);
        const directAddress = bufferToAddress(data, 17);
        const advLength = data.readUInt8(23);
        const advData = data.subarray(24, advLength + 24);
        data = data.subarray(advLength + 24);

        debug(
          "Hci.onEvtLeExtendedAdvertisingReport: type %d, addressType %d, address %s, primaryPhy %d, secondaryPhy %d, sid %d, txpower %d, rssi %d, periodicAdvInterval %d, directAddressType %d, directAddress %s, advLength %d, advData %s, rssi %d, numReports %d/%d",
          type,
          addressType,
          address,
          primaryPhy,
          secondaryPhy,
          sid,
          txpower,
          rssi,
          periodicAdvInterval,
          directAddressType,
          directAddress,
          advData.toString("hex"),
          i,
          numReports
        );

        this.emit(
          "leExtendedAdvertisingReport",
          type,
          addressType,
          address,
          primaryPhy,
          secondaryPhy,
          sid,
          txpower,
          rssi,
          periodicAdvInterval,
          directAddressType,
          directAddress,
          advData,
          numReports
        );
      }
    } catch (error) {
      debug("Hci.onEvtLeExtendedAdvertisingReport: error %o", error);
    }
  }

  onEvtLeConnUpdateComplete(data) {
    // uint8_t status;
    // uint16_t handle;
    // uint16_t interval;
    // uint16_t latency;
    // uint16_t supervision_timeout;
    const status = data.readUInt8(0);
    const handle = data.readUInt16LE(1);
    const interval = data.readUInt16LE(3);
    const latency = data.readUInt16LE(5);
    const supervisionTimeout = data.readUInt16LE(7);

    debug(
      "Hci.onEvtLeConnUpdateComplete: status %d %s, handle %d, interval %d, latency %d, supervisionTimeout %d",
      status,
      hciStatusMap[status],
      handle,
      interval,
      latency,
      supervisionTimeout
    );

    this.emit(
      "leConnUpdateComplete",
      status,
      handle,
      interval,
      latency,
      supervisionTimeout
    );
  }

  async flushAclQueue() {
    const pendingPackets = () => {
      let totalPending = 0;
      for (const { pending } of Object.values(this._aclConnections)) {
        totalPending += pending;
      }
      return totalPending;
    };

    debug(
      "Hci.flushAclQueue: pending %d, queued %d",
      pendingPackets(),
      this._aclQueue.length
    );

    const aclBuffers = await this.getAclBuffers();
    while (this._aclQueue.length > 0 && pendingPackets() < aclBuffers.maxPkt) {
      const { handle, packet } = this._aclQueue.shift();
      const connection = this._aclConnections[handle];
      if (connection) connection.pending++;
      debug("Hci.flushAclQueue: write %s", packet.toString("hex"));
      this._socket.write(packet);
    }
  }

  async writeAclDataPkt(handle, flags, cid, data) {
    const ACL_HEADER_SIZE = 5;
    const L2CAP_HEADER_SIZE = 4;
    const aclBuffers = await this.getAclBuffers();
    let aclLength = Math.min(
      L2CAP_HEADER_SIZE + data.length,
      aclBuffers.pktLen
    );
    let packet = Buffer.allocUnsafe(
      ACL_HEADER_SIZE + Math.max(aclLength, L2CAP_HEADER_SIZE)
    );
    // ACL header
    packet.writeUInt8(HCI_ACLDATA_PKT, 0);
    packet.writeUInt16LE(handle | (flags << 12), 1);
    packet.writeUInt16LE(aclLength, 3);
    // L2CAP header
    packet.writeUInt16LE(data.length, 5);
    packet.writeUInt16LE(cid, 7);
    // data
    let dataLength = data.copy(packet, 9);
    if (dataLength > 0) data = data.subarray(dataLength);
    // Queue first data chunk

    debug(
      "Hci.writeAclDataPkt: queued %d %s %s",
      flags,
      hciAclFlagMap[flags],
      packet.toString("hex")
    );
    this._aclQueue.push({ handle, cid, packet });
    // Queue remaining data chunks (if any)
    while (data.length > 0) {
      aclLength = Math.min(data.length, aclBuffers.pktLen);
      packet = Buffer.allocUnsafe(ACL_HEADER_SIZE + aclLength);
      // ACL header
      packet.writeUInt8(HCI_ACLDATA_PKT, 0);
      packet.writeUInt16LE(handle | (ACL_CONT << 12), 1);
      packet.writeUInt16LE(aclLength, 3);
      // data
      dataLength = data.copy(packet, 5);
      if (dataLength > 0) data = data.subarray(dataLength);
      // Queue data chunk

      debug("Hci.writeAclDataPkt: queued ACL_CONT %s", packet.toString("hex"));
      this._aclQueue.push({ handle, cid, packet });
    }
    this.flushAclQueue();
  }

  setSocketFilter() {
    const typeMask = (1 << HCI_EVENT_PKT) | (1 << HCI_ACLDATA_PKT); // | (1 << HCI_COMMAND_PKT);
    const eventMaskLo =
      // (1 << EVT_CONN_COMPLETE) |
      (1 << EVT_DISCONN_COMPLETE) |
      (1 << EVT_AUTH_COMPLETE) |
      (1 << EVT_ENCRYPT_CHANGE) |
      (1 << EVT_CMD_COMPLETE) |
      (1 << EVT_CMD_STATUS) |
      (1 << EVT_IO_CAPABILITY_REQUEST) |
      (1 << EVT_NUM_COMP_PKTS);
    const eventMaskHi =
      (1 << (EVT_USER_PASSKEY_REQUEST - 32)) | (1 << (EVT_LE_META_EVENT - 32));
    const opcode = 0;
    const packet = Buffer.allocUnsafe(14);
    packet.writeUInt32LE(typeMask, 0);
    packet.writeUInt32LE(eventMaskLo, 4);
    packet.writeUInt32LE(eventMaskHi, 8);
    // packet.writeUInt32LE(0xffffffff, 4);
    // packet.writeUInt32LE(0xffffffff, 8);
    packet.writeUInt16LE(opcode, 12);
    debug("Hci.setSocketFilter: %s", packet.toString("hex"));
    this._socket.setFilter(packet);
  }

  reset() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_RESET | (OGF_HOST_CTL << 10), 1);
    // length
    packet.writeUInt8(0x00, 3);
    debug("Hci.reset: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  writeConnAcceptTimeout(timeout = 32000) {
    const packet = Buffer.allocUnsafe(4 + 2);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(
      OCF_WRITE_CONN_ACCEPT_TIMEOUT | (OGF_HOST_CTL << 10),
      1
    );
    // length
    packet.writeUInt8(2, 3);
    // data
    packet.writeUInt16LE(timeout, 4);
    debug("Hci.writeConnAcceptTimeout: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  writePageTimeout(timeout = 32000) {
    const packet = Buffer.allocUnsafe(4 + 2);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_WRITE_PAGE_TIMEOUT | (OGF_HOST_CTL << 10), 1);
    // length
    packet.writeUInt8(2, 3);
    // data
    packet.writeUInt16LE(timeout, 4);
    debug("Hci.writePageTimeout: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leSetRandomAddress(address) {
    address = address ? addressToBuffer(address) : randomBytes(6);
    const packet = Buffer.allocUnsafe(4 + 6);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_LE_SET_RANDOM_ADDRESS | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(6, 3);
    // data
    address.copy(packet, 4); // peer address

    debug("Hci.leSetRandomAddress: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  readLocalCommands() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_READ_LOCAL_COMMANDS | (OGF_INFO_PARAM << 10), 1);
    // length
    packet.writeUInt8(0x00, 3);
    debug("Hci.readLocalCommands: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  setPhy(txPhy = 0x05, rxPhy = 0x05) {
    const packet = Buffer.allocUnsafe(4 + 3);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_SET_PHY | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(0x03, 3);
    // data
    packet.writeUInt8(0x00, 4); // all phy prefs
    packet.writeUInt8(txPhy, 5); // tx phy: 0x01 LE 1M, 0x03 LE 1M + LE 2M, 0x05 LE 1M + LE CODED, 0x07 LE 1M + LE 2M +  LE CODED
    packet.writeUInt8(rxPhy, 6); // rx phy: 0x01 LE 1M, 0x03 LE 1M + LE 2M, 0x05 LE 1M + LE CODED, 0x07 LE 1M + LE 2M +  LE CODED

    debug("Hci.setCodedPhySupport: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  setEventFilter() {
    const packet = Buffer.allocUnsafe(4 + 2);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_SET_EVENT_FLT | (OGF_HOST_CTL << 10), 1);
    // length
    packet.writeUInt8(2, 3);
    // data
    // uint8_t flt_type;
    // uint8_t cond_type;
    // uint8_t condition[0];
    packet.writeUInt8(0x00, 4);
    packet.writeUInt8(0x00, 5);
    debug("Hci.setEventFilter: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  setEventMask() {
    const eventMask = Buffer.from("fffffbff07f8bf3d", "hex");
    // const eventMask = Buffer.from("ffffffffffffffff", "hex");
    const packet = Buffer.allocUnsafe(4 + 8);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_SET_EVENT_MASK | (OGF_HOST_CTL << 10), 1);
    // length
    packet.writeUInt8(0x08, 3);
    // data
    eventMask.copy(packet, 4);
    debug("Hci.setEventMask: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leSetEventMask() {
    const leEventMask = this._isExtended
      ? Buffer.from("1fff000000000000", "hex")
      : Buffer.from("1f00000000000000", "hex");
    // const leEventMask = Buffer.from("1fff000000000000", "hex");
    const packet = Buffer.allocUnsafe(4 + 8);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_LE_SET_EVENT_MASK | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(0x08, 3);
    // data
    leEventMask.copy(packet, 4);
    debug("Hci.leSetEventMask: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  readLocalVersion() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_READ_LOCAL_VERSION | (OGF_INFO_PARAM << 10), 1);
    // length
    packet.writeUInt8(0, 3);
    debug("Hci.readLocalVersion: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  writeSimplePairingMode(enabled) {
    const packet = Buffer.allocUnsafe(4 + 1);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(
      OCF_WRITE_SIMPLE_PAIRING_MODE | (OGF_HOST_CTL << 10),
      1
    );
    // length
    packet.writeUInt8(1, 3);
    // data
    packet.writeUInt8(enabled ? 0x01 : 0x00, 4); // mode

    debug("Hci.writeSimplePairingMode: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  writeLeHostSupported() {
    const packet = Buffer.allocUnsafe(4 + 2);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_WRITE_LE_HOST_SUPPORTED | (OGF_HOST_CTL << 10), 1);
    // length
    packet.writeUInt8(2, 3);
    // data
    packet.writeUInt8(0x01, 4); // LE
    packet.writeUInt8(0x00, 5); // simultaneous LE host
    debug("Hci.writeLeHostSupported: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  readLeHostSupported() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_READ_LE_HOST_SUPPORTED | (OGF_HOST_CTL << 10), 1);
    // length
    packet.writeUInt8(0, 3);
    debug("Hci.readLeHostSupported: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  deleteStoredLinkKey() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_DELETE_STORED_LINK_KEY | (OGF_HOST_CTL << 10), 1);
    // length
    packet.writeUInt8(0, 3);
    debug("Hci.deleteStoredLinkKey: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  readBufferSize() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_READ_BUFFER_SIZE | (OGF_INFO_PARAM << 10), 1);
    // length
    packet.writeUInt8(0x00, 3);
    debug("Hci.readBufferSize: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leReadBufferSize() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_LE_READ_BUFFER_SIZE | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(0, 3);
    debug("Hci.leReadBufferSize: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  readBdAddr() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_READ_BD_ADDR | (OGF_INFO_PARAM << 10), 1);
    // length
    packet.writeUInt8(0x00, 3);
    debug("Hci.readBdAddr: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leClearResolvingList() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_LE_CLEAR_RESOLV_LIST | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(0, 3);

    debug("Hci.leClearResolvingList: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  writeDefaultLinkPolicy() {
    const packet = Buffer.allocUnsafe(4 + 2);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(
      OCF_WRITE_DEFAULT_LINK_POLICY | (OGF_LINK_POLICY << 10),
      1
    );
    // length
    packet.writeUInt8(2, 3);
    // data
    packet.writeUInt16LE(0x0007, 4); // LE

    debug("Hci.writeDefaultLinkPolicy: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leSetScanParameters(type, interval, window, ownAddressType, filter) {
    if (this._isExtended) {
      const packet = Buffer.allocUnsafe(4 + 13);
      // header
      packet.writeUInt8(HCI_COMMAND_PKT, 0);
      packet.writeUInt16LE(
        OCF_LE_SET_EXTENDED_SCAN_PARAMETERS | (OGF_LE_CTL << 10),
        1
      );
      // length
      packet.writeUInt8(13, 3);
      // data
      packet.writeUInt8(ownAddressType, 4); // own address type: 0x00 public, 0x01 random
      packet.writeUInt8(filter, 5); // filter: 0x00 all event types
      packet.writeUInt8(0x05, 6); // phy: LE 1M + LE CODED
      packet.writeUInt8(type, 7); // phy 1M - type: 0x00 passive, 0x01 active
      packet.writeUInt16LE(interval, 8); // phy 1M - scan interval (msec * 1.6)
      packet.writeUInt16LE(window, 10); // phy 1M - scan window (msec * 1.6)
      packet.writeUInt8(type, 12); // phy CODED - type: 0x00 passive, 0x01 active
      cmd.writeUInt16LE(interval, 13); // phy CODED - scan interval (msec * 1.6)
      packet.writeUInt16LE(window, 15); // phy CODED - scan window (msec * 1.6)

      debug("Hci.leSetScanParameters: write %s", packet.toString("hex"));
      this._socket.write(packet);
    } else {
      const packet = Buffer.allocUnsafe(4 + 7);
      // header
      packet.writeUInt8(HCI_COMMAND_PKT, 0);
      packet.writeUInt16LE(OCF_LE_SET_SCAN_PARAMETERS | (OGF_LE_CTL << 10), 1);
      // length
      packet.writeUInt8(7, 3);
      // data
      packet.writeUInt8(type, 4); // type: 0x00 passive, 0x01 active
      packet.writeUInt16LE(interval, 5); // scan interval (msec * 1.6)
      packet.writeUInt16LE(window, 7); // scan window (msec * 1.6)
      packet.writeUInt8(ownAddressType, 9); // own address type: 0x00 public, 0x01 random
      packet.writeUInt8(filter || 0, 10); // filter: 0x00 all event types

      debug("Hci.leSetScanParameters: write %s", packet.toString("hex"));
      this._socket.write(packet);
    }
  }

  leSetScanEnable(enabled, filterDuplicates, duration, period) {
    if (isNextThingChip) filterDuplicates = false;
    if (this._isExtended) {
      const packet = Buffer.allocUnsafe(4 + 6);
      // header
      packet.writeUInt8(HCI_COMMAND_PKT, 0);
      packet.writeUInt16LE(
        OCF_LE_SET_EXTENDED_SCAN_ENABLE | (OGF_LE_CTL << 10),
        1
      );
      // length
      packet.writeUInt8(6, 3);
      // data
      packet.writeUInt8(!!enabled ? 0x01 : 0x00, 4); // enable: 0 disabled, 1 enabled
      packet.writeUInt8(!!filterDuplicates ? 0x01 : 0x00, 5); // filterDuplicates: 0 allow duplicates, 1 filter duplicates
      packet.writeUInt16LE(duration || 0, 6); // duration
      packet.writeUInt16LE(period || 0, 8); // period
      debug("Hci.leSetScanEnable: write %s", packet.toString("hex"));
      this._socket.write(packet);
    } else {
      const packet = Buffer.allocUnsafe(4 + 2);
      // header
      packet.writeUInt8(HCI_COMMAND_PKT, 0);
      packet.writeUInt16LE(OCF_LE_SET_SCAN_ENABLE | (OGF_LE_CTL << 10), 1);
      // length
      packet.writeUInt8(0x02, 3);
      // data
      packet.writeUInt8(enabled ? 0x01 : 0x00, 4); // enable: 0 disabled, 1 enabled
      packet.writeUInt8(filterDuplicates ? 0x01 : 0x00, 5); // filterDuplicates: 0 allow duplicates, 1 filter duplicates
      debug("Hci.leSetScanEnable: write %s", packet.toString("hex"));
      this._socket.write(packet);
    }
  }

  leCreateConn(addressType, address, parameters = {}) {
    // @see https://docs.silabs.com/bluetooth/4.0/a00058#gac2453ab6efcbfc71b3bb23b3fffce1df
    const {
      interval = 96, // (60 msec * 1.6 = 96)
      window = 96, // (60 msec * 1.6 = 48)
      filter = 0x00,
      minInterval = 24, // (30 msec * 0.8 = 24)
      maxInterval = 40, // (50 msec * 0.8 = 40)
      latency = 0,
      timeout = 100, // (1000 msec * 0.1 = 100)
      minCeLength = 0,
      maxCeLength = 0,
    } = parameters;
    if (this._isExtended) {
      const packet = Buffer.allocUnsafe(4 + 42);
      // header
      packet.writeUInt8(HCI_COMMAND_PKT, 0);
      packet.writeUInt16LE(OCF_LE_CREATE_EXTENDED_CONN | (OGF_LE_CTL << 10), 1);
      // length
      packet.writeUInt8(0x2a, 3);
      // data
      packet.writeUInt8(filter, 4); // filter policy: white list is not used
      packet.writeUInt8(this.addressType, 5); // own address type
      packet.writeUInt8(addressType, 6); // peer address type
      addressToBuffer(address).copy(packet, 7); // peer address
      packet.writeUInt8(0x05, 13); // initiating PHYs: LE 1M + LE Coded
      packet.writeUInt16LE(interval, 14); // phy 1M - scan interval (msec * 1.6)
      packet.writeUInt16LE(window, 16); // phy 1M - scan window (msec * 1.6)
      packet.writeUInt16LE(minInterval, 18); // phy 1M - min interval (msec * 0.8)
      packet.writeUInt16LE(maxInterval, 20); // phy 1M - max interval (msec * 0.8)
      packet.writeUInt16LE(latency, 22); // phy 1M - latency
      packet.writeUInt16LE(timeout, 24); // phy 1M - supervision timeout (sec * 100)
      packet.writeUInt16LE(minCeLength, 26); // phy 1M - min ce length
      packet.writeUInt16LE(maxCeLength, 28); // phy 1M - max ce length
      packet.writeUInt16LE(interval, 30); // phy CODED - scan interval (msec * 1.6)
      packet.writeUInt16LE(window, 32); // phy CODED - scan window (msec * 1.6)
      packet.writeUInt16LE(minInterval, 34); // phy CODED - min interval (msec * 0.8)
      packet.writeUInt16LE(maxInterval, 36); // phy CODED - max interval (msec * 0.8)
      packet.writeUInt16LE(latency, 38); // phy CODED - latency
      packet.writeUInt16LE(timeout, 40); // phy CODED - supervision timeout (sec * 100)
      packet.writeUInt16LE(minCeLength, 42); // phy CODED - min ce length
      packet.writeUInt16LE(maxCeLength, 44); // phy CODED - max ce length
      debug("Hci.leCreateConn: write %s", packet.toString("hex"));
      this._socket.write(packet);
    } else {
      const packet = Buffer.allocUnsafe(4 + 25);
      // header
      packet.writeUInt8(HCI_COMMAND_PKT, 0);
      packet.writeUInt16LE(OCF_LE_CREATE_CONN | (OGF_LE_CTL << 10), 1);
      // length
      packet.writeUInt8(0x19, 3);
      // data
      packet.writeUInt16LE(interval, 4); // interval (msec * 1.6)
      packet.writeUInt16LE(window, 6); // window (msec * 1.6)
      packet.writeUInt8(filter, 8); // initiator filter
      packet.writeUInt8(addressType, 9); // peer address type
      addressToBuffer(address).copy(packet, 10); // peer address
      packet.writeUInt8(this.addressType, 16); // own address type
      packet.writeUInt16LE(minInterval, 17); // min interval (msec * 0.8)
      packet.writeUInt16LE(maxInterval, 19); // max interval (msec * 0.8)
      packet.writeUInt16LE(latency, 21); // latency
      packet.writeUInt16LE(timeout, 23); // supervision timeout (sec * 100)
      packet.writeUInt16LE(minCeLength, 25); // min ce length
      packet.writeUInt16LE(maxCeLength, 27); // max ce length
      debug("Hci.leCreateConn: write %s", packet.toString("hex"));
      this._socket.write(packet);
    }
  }

  leCreateConnCancel() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_LE_CREATE_CONN_CANCEL | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(0x0, 3);

    debug("Hci.leCreateConnCancel: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leClearWhiteList() {
    const packet = Buffer.allocUnsafe(4);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_LE_CLEAR_WHITE_LIST | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(0, 3);
    debug("Hci.leClearWhiteList: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leAddDeviceToWhiteList(addressType, address) {
    const packet = Buffer.allocUnsafe(4 + 7);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(
      OCF_LE_ADD_DEVICE_TO_WHITE_LIST | (OGF_LE_CTL << 10),
      1
    );
    // length
    packet.writeUInt8(7, 3);
    // data
    // uint8_t bdaddr_type;
    // bdaddr_t bdaddr;
    packet.writeUInt8(addressType, 4);
    addressToBuffer(address).copy(packet, 5);

    debug("Hci.leAddDeviceToWhiteList: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leRemoveDeviceFromWhiteList(addressType, address) {
    const packet = Buffer.allocUnsafe(4 + 7);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(
      OCF_LE_REMOVE_DEVICE_FROM_WHITE_LIST | (OGF_LE_CTL << 10),
      1
    );
    // length
    packet.writeUInt8(7, 3);
    // data
    // uint8_t bdaddr_type;
    // bdaddr_t bdaddr;
    packet.writeUInt8(addressType, 4);
    addressToBuffer(address).copy(packet, 5);

    debug("Hci.leRemoveDeviceFromWhiteList: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leConnUpdate(handle, minInterval, maxInterval, latency, supervisionTimeout) {
    const packet = Buffer.allocUnsafe(4 + 14);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_LE_CONN_UPDATE | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(0x0e, 3);
    // data
    packet.writeUInt16LE(handle, 4);
    packet.writeUInt16LE(minInterval, 6); // min interval
    packet.writeUInt16LE(maxInterval, 8); // max interval
    packet.writeUInt16LE(latency, 10); // latency
    packet.writeUInt16LE(supervisionTimeout, 12); // supervision timeout
    packet.writeUInt16LE(0x0000, 14); // min ce length
    packet.writeUInt16LE(0x0000, 16); // max ce length
    debug("Hci.leConnUpdate: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  leStartEncryption(handle, random, diversifier, key) {
    const packet = Buffer.allocUnsafe(4 + 28);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_LE_START_ENCRYPTION | (OGF_LE_CTL << 10), 1);
    // length
    packet.writeUInt8(28, 3);
    // data
    // uint16_t handle;
    // uint64_t random;
    // uint16_t diversifier;
    // uint8_t key[16];
    packet.writeUInt16LE(handle, 4);
    random.copy(packet, 6);
    diversifier.copy(packet, 14);
    key.copy(packet, 16);
    debug("Hci.leStartEncryption: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  disconnect(handle, reason = HCI_OE_USER_ENDED_CONNECTION) {
    const packet = Buffer.allocUnsafe(4 + 3);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_DISCONNECT | (OGF_LINK_CTL << 10), 1);
    // length
    packet.writeUInt8(0x03, 3);
    // data
    packet.writeUInt16LE(handle, 4); // handle
    packet.writeUInt8(reason, 6); // reason
    debug("Hci.disconnect: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }

  readRssi(handle) {
    const packet = Buffer.allocUnsafe(4 + 2);
    // header
    packet.writeUInt8(HCI_COMMAND_PKT, 0);
    packet.writeUInt16LE(OCF_READ_RSSI | (OGF_STATUS_PARAM << 10), 1);
    // length
    packet.writeUInt8(0x02, 3);
    // data
    packet.writeUInt16LE(handle, 4); // handle
    debug("Hci.readRssi: write %s", packet.toString("hex"));
    this._socket.write(packet);
  }
}

module.exports = Hci;
