// index.js

const Central = require("../central.js");

const targetAddress = "c179c4775a06"; // Duo-EK
// const targetAddress = "e8cb2c2c4377"; // SleepO2
// const targetAddress = "a4c100001a0d"; // AOJ-20A

let targetAddressType;

const central = new Central({ autoMtu: false });

central.start();

let found = false;

central.on(
  "advertisement",
  async (type, addressType, address, advLength, advData, rssi, numReports) => {
    if (address === targetAddress && !found) {
      found = true;
      try {
        targetAddressType = addressType;
        await central.stopScanningAsync();
        const connection = await central.connectAsync(
          targetAddressType,
          targetAddress
        );
        console.log("*** connected", connection);
        const mtu = await central.exchangeMtuAsync(address);
        console.log("*** mtu", mtu);
        const services = await central.discoverAsync(address, true);
        console.log("*** services", JSON.stringify(services, null, 4));
        await central.disconnectAsync(address);
        process.exit(0);
      } catch (error) {
        console.log("error", error);
      }
    }
  }
);

const main = async () => {
  await central.setScanParametersAsync(1, 0x20, 0x20, 0, 0);
  await central.startScanningAsync();
  console.log("*** scanning");
};

main();
