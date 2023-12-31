// le-scan-test.js

const {
  OGF_HOST_CTL,
  OCF_RESET,
  OCF_LE_SET_SCAN_PARAMETERS,
  EVT_LE_ADVERTISING_REPORT,
  EVT_LE_META_EVENT,
  EVT_CMD_STATUS,
  EVT_CMD_COMPLETE,
  HCI_EVENT_PKT,
  HCI_COMMAND_PKT,
  OGF_LE_CTL,
  OCF_LE_SET_SCAN_ENABLE,
  HCI_SUCCESS,
} = require("../hci-defs.js");
const HciSocket = require("../hci-socket.js");

var hciSocket = new HciSocket();

const hexdump = (buffer, logger) => {
  for (let i = 0; i < buffer.length; i += 16) {
    let address = i.toString(16).padStart(8, "0"); // address
    let block = buffer.slice(i, i + 16); // cut buffer into blocks of 16
    let hexArray = [];
    let asciiArray = [];
    for (let value of block) {
      hexArray.push(value.toString(16).padStart(2, "0"));
      asciiArray.push(
        value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : "."
      );
    }
    let hexString = hexArray.join(" ");
    let asciiString = asciiArray.join("");
    logger(`${address}  ${hexString.padEnd(48, " ")}  |${asciiString}|`);
  }
};

hciSocket.on("data", function (data) {
  // console.log("data: " + data.toString("hex"));

  if (data.readUInt8(0) === HCI_EVENT_PKT) {
    if (data.readUInt8(1) === EVT_CMD_COMPLETE) {
      if (data.readUInt16LE(4) === LE_SET_SCAN_PARAMETERS_CMD) {
        if (data.readUInt8(6) === HCI_SUCCESS) {
          console.log("LE Scan Parameters Set");
        }
      } else if (data.readUInt16LE(4) === LE_SET_SCAN_ENABLE_CMD) {
        if (data.readUInt8(6) === HCI_SUCCESS) {
          console.log("LE Scan Enable Set");
        }
      }
    } else if (data.readUInt8(1) === EVT_LE_META_EVENT) {
      if (data.readUInt8(3) === EVT_LE_ADVERTISING_REPORT) {
        data = data.subarray(4);
        var numReports = data.readUInt8(0);
        data = data.subarray(1);
        for (let i = 0; i < numReports; i++) {
          var gapAdvType = data.readUInt8(0);
          var gapAddrType = data.readUInt8(1);
          var gapAddr = Buffer.from(data.subarray(2, 8));
          var length = data.readUInt8(8);
          var eir = data.subarray(9, length + 9);
          var rssi = data.readInt8(length + 9);
          data = data.subarray(length + 10);

          console.log(
            gapAddr.reverse().toString("hex"),
            ["public", "random"][gapAddrType],
            [
              "ADV_IND",
              "ADV_DIRECT_IND",
              "ADV_SCAN_IND",
              "ADV_NONCONN_IND",
              "SCAN_RSP",
            ][gapAdvType],
            rssi,
            length
          );
          hexdump(eir, console.log);
        }
      }
    }
  }
});

hciSocket.on("error", function (error) {
  console.error(error);
});

var LE_SET_SCAN_PARAMETERS_CMD =
  OCF_LE_SET_SCAN_PARAMETERS | (OGF_LE_CTL << 10);

var LE_SET_SCAN_ENABLE_CMD = OCF_LE_SET_SCAN_ENABLE | (OGF_LE_CTL << 10);

var RESET_CMD = OCF_RESET | (OGF_HOST_CTL << 10);

function setFilter() {
  var filter = Buffer.allocUnsafe(14);
  var typeMask = 1 << HCI_EVENT_PKT;
  var eventMask1 = (1 << EVT_CMD_COMPLETE) | (1 << EVT_CMD_STATUS);
  var eventMask2 = 1 << (EVT_LE_META_EVENT - 32);
  var opcode = 0;

  filter.writeUInt32LE(typeMask, 0);
  filter.writeUInt32LE(eventMask1, 4);
  filter.writeUInt32LE(eventMask2, 8);
  filter.writeUInt16LE(opcode, 12);

  hciSocket.setFilter(filter);
}

function setScanParameters() {
  var cmd = Buffer.allocUnsafe(11);

  // header
  cmd.writeUInt8(HCI_COMMAND_PKT, 0);
  cmd.writeUInt16LE(LE_SET_SCAN_PARAMETERS_CMD, 1);

  // length
  cmd.writeUInt8(0x07, 3);

  // data
  cmd.writeUInt8(0x01, 4); // type: 0 -> passive, 1 -> active
  cmd.writeUInt16LE(0x0020, 5); // internal, ms * 1.6
  cmd.writeUInt16LE(0x0020, 7); // window, ms * 1.6
  cmd.writeUInt8(0x00, 9); // own address type: 0 -> public, 1 -> random
  cmd.writeUInt8(0x00, 10); // filter: 0 -> all event types

  hciSocket.write(cmd);
}

function setScanEnable(enabled, duplicates) {
  var cmd = Buffer.allocUnsafe(6);

  // header
  cmd.writeUInt8(HCI_COMMAND_PKT, 0);
  cmd.writeUInt16LE(LE_SET_SCAN_ENABLE_CMD, 1);

  // length
  cmd.writeUInt8(0x02, 3);

  // data
  cmd.writeUInt8(enabled ? 0x01 : 0x00, 4); // enable: 0 -> disabled, 1 -> enabled
  cmd.writeUInt8(duplicates ? 0x01 : 0x00, 5); // duplicates: 0 -> allow duplicates, 1 -> no duplicates

  hciSocket.write(cmd);
}

function reset() {
  var cmd = Buffer.allocUnsafe(4);

  // header
  cmd.writeUInt8(HCI_COMMAND_PKT, 0);
  cmd.writeUInt16LE(RESET_CMD, 1);

  // length
  cmd.writeUInt8(0x00, 3);

  hciSocket.write(cmd);
}

hciSocket.bind();
setFilter();
hciSocket.start();
reset();
// setScanEnable(false, false);
setScanParameters();
setScanEnable(true, false);

setTimeout(() => process.exit(0), 15000);
