// central.js

const debug = require("debug")("ble-hci-central:central");

const { EventEmitter } = require("node:events");

const Acl = require("./acl.js");
const Gatt = require("./gatt.js");
const Hci = require("./hci.js");
const { HCI_SUCCESS, LE_ROLE_CENTRAL } = require("./hci-defs.js");
const Signaling = require("./signaling.js");

// BLE Central
class Central extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this._scanState = "stopped";
    this._addressTypes = {}; // Device address types (by address)
    this._connectionInProgress = null; // currently connecting device address
    this._connectionQueue = []; // Pending connections queue
    this._handles = {}; // Device addresses by connection handle & vice versa
    this._gatts = {}; // Gatt interfaces by connection handle and by address
    this._acls = {}; // ACL transports by connection handle only
    this._signalings = {}; // Signaling channels by connection handle only
    this._hci = new Hci(options);
    this._hci.on("start", this.onStart.bind(this));
    this._hci.on("stop", this.onStop.bind(this));
    this._hci.on("reset", this.onReset.bind(this));
    this._hci.on("readBdAddr", this.onReadBdAddr.bind(this));
    this._hci.on("leSetScanParameters", this.onLeSetScanParameters.bind(this));
    this._hci.on("leSetScanEnable", this.onLeSetScanEnable.bind(this));
    this._hci.on("leAdvertisingReport", this.onLeAdvertisingReport.bind(this));
    this._hci.on(
      "leExtendedAdvertisingReport",
      this.onLeExtendedAdvertisingReport.bind(this)
    );
    this._hci.on("leConnComplete", this.onLeConnComplete.bind(this));
    this._hci.on("disconnComplete", this.onDisconnComplete.bind(this));
    this._hci.on("encryptChange", this.onEncryptChange.bind(this));
    this._hci.on(
      "leConnUpdateComplete",
      this.onLeConnUpdateComplete.bind(this)
    );
    this._hci.on("aclDataPkt", this.onAclDataPkt.bind(this));
    process.on("exit", this.onExit.bind(this));
  }

  AttDefs = require("./att-defs.js");
  GattDefs = require("./gatt-defs.js");
  HciDefs = require("./hci-defs.js");
  SmpDefs = require("./smp-defs.js");

  onExit() {
    debug("Central.onExit");
    this.stopScanning();
    for (const handle in this._acls) {
      this._hci.disconnect(handle);
    }
  }

  availableL2Sockets() {
    return this._hci.availableL2Sockets();
  }

  setAuth(enabled) {
    this._hci.setAuth(!!enabled);
  }

  setEncrypt(enabled) {
    this._hci.setEncrypt(!!enabled);
  }

  start() {
    this._hci.start();
  }

  onStart() {
    this.emit("start");
  }

  stop() {
    this._hci.stop();
  }

  onStop() {
    this.emit("stop");
  }

  reset() {
    this._hci.reset();
  }

  onReset(status) {
    this.emit("reset", status);
  }

  onReadBdAddr(addressType, address) {
    this.emit("address", addressType, address);
  }

  setScanParameters(type, interval, window, ownAddressType, filter) {
    this._hci.leSetScanParameters(
      type,
      interval,
      window,
      ownAddressType,
      filter
    );
  }

  setScanParametersAsync(type, interval, window, ownAddressType, filter) {
    return new Promise((resolve, reject) => {
      this.once("scanParametersSet", resolve);
      this.setScanParameters(type, interval, window, ownAddressType, filter);
    });
  }

  onLeSetScanParameters(status) {
    this.emit("scanParametersSet", status);
  }

  startScanning(filterDuplicates, duration, period) {
    if (this._scanState === "stopping" || this._scanState === "stopped") {
      this._scanState = "starting";
      this._hci.leSetScanEnable(true, filterDuplicates, duration, period);
    } else if (this._scanState === "started") {
      setImmediate(() => this.emit("scanStart", HCI_SUCCESS));
    }
  }

  startScanningAsync(filterDuplicates, duration, period) {
    return new Promise((resolve, reject) => {
      this.once("scanStart", resolve);
      this.startScanning(filterDuplicates, duration, period);
    });
  }

  stopScanning() {
    if (this._scanState === "starting" || this._scanState === "started") {
      this._scanState = "stopping";
      this._hci.leSetScanEnable(false);
    } else if (this._scanState === "stopped") {
      setImmediate(() => this.emit("scanStop", HCI_SUCCESS));
    }
  }

  stopScanningAsync() {
    return new Promise((resolve, reject) => {
      this.once("scanStop", resolve);
      this.stopScanning();
    });
  }

  onLeSetScanEnable(status) {
    if (status !== HCI_SUCCESS) return;
    if (this._scanState === "starting") {
      this._scanState = "started";
      this.emit("scanStart", status);
    } else if (this._scanState === "stopping") {
      this._scanState = "stopped";
      this.emit("scanStop", status);
    }
  }

  onLeAdvertisingReport(
    type,
    addressType,
    address,
    advLength,
    advData,
    rssi,
    numReports
  ) {
    this.emit(
      "advertisement",
      type,
      addressType,
      address,
      advLength,
      advData,
      rssi,
      numReports
    );
  }

  onLeExtendedAdvertisingReport(
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
  ) {
    this.emit(
      "extendedAdvertisement",
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

  connect(addressType, address, parameters) {
    if (!this._connectionInProgress) {
      this._connectionInProgress = { addressType, address, parameters };
      this._hci.leCreateConn(addressType, address, parameters);
    } else {
      this._connectionQueue.push({ addressType, address, parameters });
    }
  }

  connectAsync(addressType, address, parameters) {
    return new Promise((resolve, reject) => {
      const listener = (
        status,
        handle,
        role,
        addressType,
        address_,
        interval,
        latency,
        supervisionTimeout,
        masterClockAccuracy,
        localResolvablePrivateAddress,
        peerResolvablePrivateAddress
      ) => {
        if (address === address_) {
          this.off("connect", listener);
          resolve({
            status,
            handle,
            role,
            addressType,
            address,
            interval,
            latency,
            supervisionTimeout,
            masterClockAccuracy,
            localResolvablePrivateAddress,
            peerResolvablePrivateAddress,
          });
        }
      };
      this.on("connect", listener);
      this.connect(addressType, address, parameters);
    });
  }

  disconnect(address) {
    this._hci.disconnect(this._handles[address]);
  }

  disconnectAsync(address) {
    return new Promise((resolve, reject) => {
      const listener = (address_, reason) => {
        if (address === address_) {
          this.off("disconnect", listener);
          resolve({ address, reason });
        }
      };
      this.on("disconnect", listener);
      this.disconnect(address);
    });
  }

  cancelConnect(address) {
    this._connectionQueue = this._connectionQueue.filter(
      (connection) => connection.address !== address
    );
    this._hci.leCreateConnCancel();
  }

  onLeConnComplete(
    status,
    handle,
    role,
    addressType,
    address,
    interval,
    latency,
    supervisionTimeout,
    masterClockAccuracy,
    localResolvablePrivateAddress,
    peerResolvablePrivateAddress
  ) {
    // not central, ignore
    if (role !== undefined && role !== LE_ROLE_CENTRAL) return;
    if (status === HCI_SUCCESS) {
      const acl = new Acl(
        this._hci,
        handle,
        this._hci.addressType,
        this._hci.address,
        addressType,
        address
      );
      const gatt = new Gatt(address, acl);
      const signaling = new Signaling(handle, acl);

      this._gatts[address] = gatt;
      this._gatts[handle] = gatt;
      this._acls[handle] = acl;
      this._handles[address] = handle;
      this._handles[handle] = address;
      this._signalings[handle] = signaling;

      gatt.on("mtu", this.onMtu.bind(this));
      gatt.on("encryptFail", this.onEncryptFail.bind(this));
      gatt.on("servicesDiscover", this.onServicesDiscover.bind(this));
      gatt.on(
        "includedServicesDiscover",
        this.onIncludedServicesDiscover.bind(this)
      );
      gatt.on(
        "characteristicsDiscover",
        this.onCharacteristicsDiscover.bind(this)
      );
      gatt.on("descriptorsDiscover", this.onDescriptorsDiscover.bind(this));
      gatt.on("read", this.onRead.bind(this));
      gatt.on("write", this.onWrite.bind(this));
      gatt.on("broadcast", this.onBroadcast.bind(this));
      gatt.on("notify", this.onNotify.bind(this));
      gatt.on("notification", this.onNotification.bind(this));
      gatt.on("readDescriptor", this.onReadDescriptor.bind(this));
      gatt.on("writeDescriptor", this.onWriteDescriptor.bind(this));

      signaling.on(
        "connectionParameterUpdateRequest",
        this.onConnectionParameterUpdateRequest.bind(this)
      );

      if (this._connectionInProgress?.parameters?.autoMtu) gatt.exchangeMtu();
    }

    this.emit(
      "connect",
      status,
      handle,
      role,
      addressType,
      address,
      interval,
      latency,
      supervisionTimeout,
      masterClockAccuracy,
      localResolvablePrivateAddress,
      peerResolvablePrivateAddress
    );

    if (this._connectionQueue.length > 0) {
      const connection = this._connectionQueue.shift();
      this._connectionInProgress = connection;
      this._hci.leCreateConn(
        connection.addressType,
        connection.address,
        connection.parameters
      );
    } else {
      delete this._connectionInProgress;
    }
  }

  onDisconnComplete(handle, reason) {
    const address = this._handles[handle];
    debug(
      "Central.onDisconnComplete: handle %d, reason %d, address %s",
      handle,
      reason,
      address
    );
    if (address) {
      this._acls[handle].close();
      this._gatts[handle].close();
      this._signalings[handle].close();
      delete this._gatts[address];
      delete this._gatts[handle];
      delete this._acls[handle];
      delete this._handles[address];
      delete this._handles[handle];
      delete this._signalings[handle];
      this.emit("disconnect", address, reason);
    }
  }

  onEncryptChange(handle, encrypt) {
    const acl = this._acls[handle];
    if (acl) acl.pushEncrypt(encrypt);
    const address = this._handles[handle];
    this.emit("encryptChange", address, encrypt);
  }

  onAclDataPkt(handle, cid, data) {
    const acl = this._acls[handle];
    if (acl) acl.push(cid, data);
  }

  exchangeMtu(address) {
    this._gatts[address].exchangeMtu();
  }

  exchangeMtuAsync(address) {
    return new Promise((resolve, reject) => {
      const listener = (address_, mtu) => {
        if (address === address_) {
          this.off("mtu", listener);
          resolve({ address, mtu });
        }
      };
      this.on("mtu", listener);
      this.exchangeMtu(address);
    });
  }

  onMtu(address, mtu) {
    this.emit("mtu", address, mtu);
  }

  encrypt(address, options) {
    this._gatts[address].encrypt(options);
  }

  onEncryptFail(address) {
    this.emit("encryptFail", address);
  }

  updateConnectionParameters(
    address,
    minInterval,
    maxInterval,
    latency,
    supervisionTimeout
  ) {
    const handle = this._handles[address];
    this._hci.leConnUpdate(
      handle,
      minInterval,
      maxInterval,
      latency,
      supervisionTimeout
    );
  }

  updateConnectionParametersAsync(
    address,
    minInterval,
    maxInterval,
    latency,
    supervisionTimeout
  ) {
    return new Promise((resolve, reject) => {
      const listener = (
        status,
        address_,
        interval,
        latency,
        supervisionTimeout
      ) => {
        if (address === address_) {
          this.off("connectionParametersUpdate", listener);
          resolve({ status, address, interval, latency, supervisionTimeout });
        }
      };
      this.on("connectionParametersUpdate", listener);
      this.updateConnectionParameters(
        address,
        minInterval,
        maxInterval,
        latency,
        supervisionTimeout
      );
    });
    s;
  }

  onLeConnUpdateComplete(
    status,
    handle,
    interval,
    latency,
    supervisionTimeout
  ) {
    const address = this._handles[handle];
    this.emit(
      "connectionParametersUpdate",
      status,
      address,
      interval,
      latency,
      supervisionTimeout
    );
  }

  discoverServices(address) {
    this._gatts[address].discoverServices();
  }

  discoverServicesAsync(address) {
    return new Promise((resolve, reject) => {
      const listener = (address_, services) => {
        if (address_ === address) {
          this.off("servicesDiscover", listener);
          resolve({ address, services });
        }
      };
      this.on("servicesDiscover", listener);
      this.discoverServices(address);
    });
  }

  onServicesDiscover(address, services) {
    this.emit("servicesDiscover", address, services);
  }

  discoverIncludedServices(address, serviceUuid) {
    this._gatts[address].discoverServices(serviceUuid);
  }

  discoverIncludedServicesAsync(address, serviceUuid) {
    return new Promise((resolve, reject) => {
      const listener = (address_, serviceUuid_, includedServices) => {
        if (address_ === address && serviceUuid_ == serviceUuid) {
          this.off("includedServicesDiscover", listener);
          resolve({ address, serviceUuid, includedServices });
        }
      };
      this.on("includedServicesDiscover", listener);
      this.discoverIncludedServices(address, serviceUuid);
    });
  }

  onIncludedServicesDiscover(address, serviceUuid, includedServices) {
    this.emit(
      "includedServicesDiscover",
      address,
      serviceUuid,
      includedServices
    );
  }

  discoverCharacteristics(address, serviceUuid) {
    this._gatts[address].discoverCharacteristics(serviceUuid);
  }

  discoverCharacteristicsAsync(address, serviceUuid) {
    return new Promise((resolve, reject) => {
      const listener = (address_, serviceUuid_, characteristics) => {
        if (address_ === address && serviceUuid_ === serviceUuid) {
          this.off("characteristicsDiscover", listener);
          resolve({ address, serviceUuid, characteristics });
        }
      };
      this.on("characteristicsDiscover", listener);
      this.discoverCharacteristics(address, serviceUuid);
    });
  }

  onCharacteristicsDiscover(address, serviceUuid, characteristics) {
    this.emit("characteristicsDiscover", address, serviceUuid, characteristics);
  }

  discoverDescriptors(address, serviceUuid, characteristicUuid) {
    this._gatts[address].discoverDescriptors(serviceUuid, characteristicUuid);
  }

  discoverDescriptorsAsync(address, serviceUuid, characteristicUuid) {
    return new Promise((resolve, reject) => {
      const listener = (
        address_,
        serviceUuid_,
        characteristicUuid_,
        descriptors
      ) => {
        if (
          address_ === address &&
          serviceUuid_ === serviceUuid &&
          characteristicUuid_ === characteristicUuid
        ) {
          this.off("descriptorsDiscover", listener);
          resolve({ address, serviceUuid, characteristicUuid, descriptors });
        }
      };
      this.on("descriptorsDiscover", listener);
      this.discoverDescriptors(address, serviceUuid, characteristicUuid);
    });
  }

  onDescriptorsDiscover(address, serviceUuid, characteristicUuid, descriptors) {
    this.emit(
      "descriptorsDiscover",
      address,
      serviceUuid,
      characteristicUuid,
      descriptors
    );
  }

  discoverAsync(address, includeDescriptors, timeout) {
    return new Promise((resolve, reject) => {
      const gatt = this._gatts[address];
      let services;
      let service;
      let characteristics;
      let characteristic;
      let rejected;

      if (timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          rejected = true;
          reject(new Error("Service discovery timeout " + address));
        }, timeout);
      }

      const onServicesDiscover = (address_, services_) => {
        if (address_ !== address) return;
        debug("Central.discoverAsync: services %o", services_);
        services = Object.values(services_);
        if (services.length) {
          service = services.shift();
          gatt.discoverCharacteristics(service.uuid);
        } else {
          done();
        }
      };

      const onCharacteristicsDiscover = (
        address_,
        serviceUuid,
        characteristics_
      ) => {
        if (address_ !== address) return;
        if (serviceUuid !== service.uuid) return;
        debug("Central.discoverAsync: characteristics %o", characteristics_);
        characteristics = Object.values(characteristics_);
        if (includeDescriptors && characteristics.length) {
          characteristic = characteristics.shift();
          gatt.discoverDescriptors(service.uuid, characteristic.uuid);
        } else if (services.length) {
          service = services.shift();
          gatt.discoverCharacteristics(service.uuid);
        } else {
          done();
        }
      };

      const onDescriptorsDiscover = (
        address_,
        serviceUuid,
        characteristicUuid,
        descriptors_
      ) => {
        if (address_ !== address) return;
        if (serviceUuid !== service.uuid) return;
        if (characteristicUuid !== characteristic.uuid) return;
        debug("Central.discoverAsync: descriptors %o", descriptors_);
        if (characteristics.length) {
          characteristic = characteristics.shift();
          gatt.discoverDescriptors(service.uuid, characteristic.uuid);
        } else if (services.length) {
          service = services.shift();
          gatt.discoverCharacteristics(service.uuid);
        } else {
          done();
        }
      };

      const done = () => {
        gatt.off("servicesDiscover", onServicesDiscover);
        gatt.off("characteristicsDiscover", onCharacteristicsDiscover);
        if (includeDescriptors) {
          gatt.off("descriptorsDiscover", onDescriptorsDiscover);
        }
        if (timeout) clearTimeout(timeout);
        if (rejected) return;
        resolve(gatt.getServices());
      };

      gatt.on("servicesDiscover", onServicesDiscover);
      gatt.on("characteristicsDiscover", onCharacteristicsDiscover);
      if (includeDescriptors) {
        gatt.on("descriptorsDiscover", onDescriptorsDiscover);
      }

      gatt.discoverServices();
    });
  }

  getMtu(address) {
    return this._gatts[address].getMtu();
  }

  getServices(address) {
    return this._gatts[address].getServices();
  }

  getServiceByUuid(address, serviceUuid) {
    return this._gatts[address].getServiceByUuid(serviceUuid);
  }

  getCharacteristicByUuid(address, serviceUuid, characteristicUuid) {
    return this._gatts[address].getCharacteristicByUuid(
      serviceUuid,
      characteristicUuid
    );
  }

  getCharacteristicByHandle(address, characteristicHandle) {
    return this._gatts[address].getCharacteristicByHandle(characteristicHandle);
  }

  getDescriptorByUuid(
    address,
    serviceUuid,
    characteristicUuid,
    descriptorUuid
  ) {
    return this._gatts[address].getDescriptorByUuid(
      serviceUuid,
      characteristicUuid,
      descriptorUuid
    );
  }

  getDescriptorByHandle(address, descriptorHandle) {
    return this._gatts[address].getDescriptorByHandle(descriptorHandle);
  }

  read(address, handle) {
    this._gatts[address].read(handle);
  }

  readAsync(address, handle) {
    return new Promise((resolve, reject) => {
      const listener = (address_, handle_, value, error) => {
        if (address_ === address && handle_ === handle) {
          this.off("read", listener);
          resolve({ address, handle, value, error });
        }
      };
      this.on("read", listener);
      this.readByHandle(address, handle);
    });
  }

  onRead(address, handle, value, error) {
    this.emit("read", address, handle, value, error);
  }

  write(address, handle, value, withoutResponse) {
    this._gatts[address].write(handle, value, withoutResponse);
  }

  writeAsync(address, handle, value, withoutResponse) {
    return new Promise((resolve, reject) => {
      if (withoutResponse) {
        setImmediate(() => resolve({ address, handle, value }));
      } else {
        const listener = (address_, handle_, value, error) => {
          if (address_ === address && handle_ === handle) {
            this.off("write", listener);
            resolve({ address, handle, value, error });
          }
        };
        this.on("write", listener);
        this.write(address, handle, value, withoutResponse);
      }
    });
  }

  onWrite(address, handle, value, error) {
    this.emit("write", address, handle, value, error);
  }

  broadcast(address, handle, broadcast) {
    this._gatts[address].broadcast(handle, broadcast);
  }

  broadcastAsync(address, handle, broadcast) {
    return new Promise((resolve, reject) => {
      const listener = (
        address_,
        handle_,
        descriptorHandle,
        broadcast,
        error
      ) => {
        if (address_ === address && handle_ === handle) {
          this.off("broadcast", listener);
          resolve({ address, handle, descriptorHandle, broadcast, error });
        }
      };
      this.on("broadcast", listener);
      this.broadcast(address, handle, broadcast);
    });
  }

  onBroadcast(address, handle, descriptorHandle, broadcast, error) {
    this.emit("broadcast", address, handle, descriptorHandle, broadcast, error);
  }

  notify(address, handle, notify) {
    this._gatts[address].notify(handle, notify);
  }

  notifyAsync(address, handle, notify) {
    return new Promise((resolve, reject) => {
      const listener = (address_, handle_, descriptorHandle, notify, error) => {
        if (address_ === address && handle_ === handle) {
          this.off("notify", listener);
          resolve({ address, handle, descriptorHandle, notify, error });
        }
      };
      this.on("notify", listener);
      this.notify(address, handle, notify);
    });
  }

  onNotify(address, handle, descriptorHandle, notify, error) {
    this.emit("notify", address, handle, descriptorHandle, notify, error);
  }

  onNotification(address, handle, value) {
    this.emit("notification", address, handle, value);
  }

  readDescriptor(address, handle) {
    this._gatts[address].readDescriptor(handle);
  }

  readDescriptorAsync(address, handle) {
    return new Promise((resolve, reject) => {
      const listener = (address_, handle_, value, error) => {
        if (address_ === address && handle_ === handle) {
          this.off("readDescriptor", listener);
          resolve({ address, descriptor, value, error });
        }
      };
      this.on("readDescriptor", listener);
      this.readDescriptor(address, handle);
    });
  }

  onReadDescriptor(address, handle, value, error) {
    this.emit("readDescriptor", address, handle, value, error);
  }

  writeDescriptor(address, handle, value) {
    this._gatts[address].writeDescriptor(handle, value);
  }

  writeDescriptorAsync(address, handle, value) {
    return new Promise((resolve, reject) => {
      const listener = (address_, handle_, value, error) => {
        if (address_ === address && handle_ === handle) {
          this.off("writeDescriptor", listener);
          resolve({ address, handle, value, error });
        }
      };
      this.on("writeDescriptor", listener);
      this.writeDescriptor(address, handle, value);
    });
  }

  onWriteDescriptor(address, handle, value, error) {
    this.emit("writeDescriptor", address, handle, value, error);
  }

  onConnectionParameterUpdateRequest(
    handle,
    minInterval,
    maxInterval,
    latency,
    supervisionTimeout
  ) {
    this._hci.leConnUpdate(
      handle,
      minInterval,
      maxInterval,
      latency,
      supervisionTimeout
    );
  }
}

module.exports = Central;
