# ble-hci-central

Bluetooth LE HCI Central for Node.js.

Mostly based on [node-bluetooth-hci-socket](https://github.com/noble/node-bluetooth-hci-socket) and [noble](https://github.com/noble/noble) projects.

**NOTE:** Currently only supports **Linux**.

## Install

```sh
npm install @kojibuta/ble-hci-central
```

## Prerequisites

- On-board Bluetooth 4.0+ controller.

- [node-gyp](https://github.com/nodejs/node-gyp?tab=readme-ov-file#installation)

**NOTE:** `node-gyp` is only required if the npm cannot find binary for your OS version.

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
