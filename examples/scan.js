const Central = require("../central.js");

// Create BLE HCI Central instance
const central = new Central();

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

// Register advertisement callback
central.on(
  "advertisement",
  (type, addressType, address, advLength, advData, rssi, numReports) => {
    // console.log("data: " + data.toString("hex"));
    console.log(
      address,
      ["public", "random"][addressType],
      [
        "ADV_IND",
        "ADV_DIRECT_IND",
        "ADV_SCAN_IND",
        "ADV_NONCONN_IND",
        "SCAN_RSP",
      ][type],
      rssi,
      advLength
    );
    hexdump(advData, console.log);
  }
);

// Start
central.start();

// Set scan parameters (active scan, allow duplicates)
central.setScanParameters(1, 0x20, 0x20, 0, 0);

// Start scanning
central.startScanning();

// Terminate in 15 seconds
setTimeout(() => process.exit(0), 15000);
