const Central = require("../central.js");

const targetAddress = "c179c4775a06";

const onAdvertisement = async (
  type,
  addressType,
  address,
  advLength,
  advData,
  rssi,
  numReports
) => {
  console.log(
    "advertisement",
    type,
    addressType,
    address,
    advLength,
    advData,
    rssi,
    numReports
  );

  // Wait for an advertisement from target device address
  if (address !== targetAddress) return;
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

// Create BLE HCI Central instance
const central = new Central({ autoMtu: true });

// Start BLE HCI Central
central.start();

// Register advertisement callback
central.on("advertisement", onAdvertisement);

// Set scan parameters (active scan, allow duplicates)
central.setScanParameters(1, 0x20, 0x20, 0, 0);

// Start scanning
central.startScanning();
