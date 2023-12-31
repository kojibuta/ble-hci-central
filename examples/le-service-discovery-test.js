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
        const address = await central.connectAsync(
          targetAddressType,
          targetAddress
        );
        console.log("*** connected");
        const mtu = await central.exchangeMtuAsync(address);
        console.log("*** mtu", mtu);
        const { services } = await central.discoverServicesAsync(address);
        console.log("*** services", services);
        for (const service of Object.values(services)) {
          const { characteristics } =
            await central.discoverCharacteristicsAsync(address, service.uuid);
          console.log("*** characteristics", characteristics);
          for (const characteristic of Object.values(characteristics)) {
            const { descriptors } = await central.discoverDescriptorsAsync(
              address,
              service.uuid,
              characteristic.uuid
            );
            console.log("*** descriptors", descriptors);
          }
        }
        await central.disconnectAsync(address);
        console.log(JSON.stringify(services, null, 4));
        process.exit(0);
      } catch (error) {
        console.log("error", error);
      }
    }
  }
);

const main = async () => {
  await central.setScanParametersAsync();
  await central.startScanningAsync();
  console.log("*** scanStart");
};

main();

// central.setScanParameters();

// central.on("scanParametersSet", () => {
//   console.log("*** scanParametersSet");
//   central.startScanning();
// });

// central.on("scanStart", () => {
//   console.log("*** scanStart");
//   setTimeout(() => {
//     central.stopScanning();
//   }, 30000);
// });

// central.on(
//   "advertisement",
//   (type, addressType, address, advLength, advData, rssi, numReports) => {
//     if (address === targetAddress) {
//       targetAddressType = addressType;
//       central.stopScanning();
//     }
//   }
// );

// central.once("scanStop", () => {
//   console.log("*** scanStop");
//   central.connect(targetAddressType, targetAddress);
// });

// central.once("connect", (address, error) => {
//   console.log("*** connect", address, error);
//   if (error) return;

//   central.once("mtu", (mtu) => {
//     console.log("*** mtu", mtu);

//     central.discoverServices(address);

//     setTimeout(() => {
//       central.disconnect(address);
//     }, 30000);
//   });
// });

// let _services;

// central.on("servicesDiscover", (address, services) => {
//   console.log("*** servicesDiscover", services);
//   _services = services;
//   for (const service of Object.values(services)) {
//     central.discoverCharacteristics(address, service.uuid);
//   }

//   central.on(
//     "characteristicsDiscover",
//     (address, serviceUuid, characteristics) => {
//       console.log(
//         "*** characteristicsDiscover",
//         serviceUuid,
//         characteristics
//       );

//       for (const characteristic of Object.values(characteristics)) {
//         central.discoverDescriptors(
//           address,
//           characteristic.serviceUuid,
//           characteristic.uuid
//         );
//       }
//     }
//   );

//   central.on(
//     "descriptorsDiscover",
//     (address, serviceUuid, characteristicUuid, descriptors) => {
//       console.log(
//         "*** descriptorsDiscover",
//         serviceUuid,
//         characteristicUuid,
//         descriptors
//       );
//     }
//   );
// });

// central.once("disconnect", () => {
//   console.log("*** disconnect");

//   console.log(JSON.stringify(_services, null, 4));

//   process.exit(0);
// });
