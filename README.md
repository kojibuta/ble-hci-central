# ble-hci-central

[![license](https://img.shields.io/badge/license-MIT-0.svg)](MIT)
[![NPM](https://img.shields.io/npm/v/@kojibuta/ble-hci-central.svg)](https://www.npmjs.com/package/@kojibuta/ble-hci-central)

Bluetooth LE HCI Central for Node.js.

Mostly based on [node-bluetooth-hci-socket](https://github.com/noble/node-bluetooth-hci-socket) and [noble](https://github.com/noble/noble) projects.

**NOTE:** Currently only supports **Linux**.

## Prerequisites

- On-board Bluetooth 4.0+ controller.

- [node-gyp](https://github.com/nodejs/node-gyp?tab=readme-ov-file#installation)

**NOTE:** `node-gyp` is only required if the npm cannot find binary for your OS version.

## Install

```sh
npm install @kojibuta/ble-hci-central
```

## Usage

```js
import central from "@kojibuta/ble-hci-central";

const onAdvertisement = async (
  type,
  addressType,
  address,
  advLength,
  advData,
  rssi,
  numReports
) => {
  // Wait for an advertisement from target device C1:79:C4:77:5A:06
  if (address !== "c179c4775a06") return;
  central.off("advertisement", onAdvertisement);

  // Stop scanning before opening a connection
  await central.stopScanningAsync();

  // Connect to device
  const connection = await central.connectAsync(addressType, address);
  console.log("connected", connection);

  // Discover all services, characteristics and descriptors
  const services = await central.discoverAsync(address, true);
  console.log("services", JSON.stringify(services, null, 4));

  // Read device name
  const handle = services["1800"]?.characteristics["2a00"]?.handle;
  if (handle) {
    const result = await central.readAsync(address, handle);
    if (result.error) {
      console.log("error reading device name", result.error);
    } else {
      console.log("device name", result.value.toString("utf8"));
    }
  }

  // Close connection
  await central.disconnectAsync(address);

  // That's all folks
  process.exit(0);
};

// Start BLE HCI Central
central.start();

// Register advertisement callback
central.on("advertisement", onAdvertisement);

// Set scan parameters (active scan, allow duplicates)
central.setScanParameters(1, 0x20, 0x20, 0, 0);

// Start scanning
central.startScanning();
```

## Examples

See [examples folder](https://github.com/kojibuta/ble-hci-central/tree/main/examples) for code examples.

## Platform Notes

### Linux

#### Install system packages

```sh
sudo apt install bluez libbluetooth-dev libcap2-bin cmake
```

#### Grant permissions to Node.js

If not running as root, following permissions must be granted to node executable.

```sh
sudo setcap 'cap_net_raw,cap_net_admin+eip' $(eval readlink -f `which node`)
```
