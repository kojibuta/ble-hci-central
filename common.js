// common.js

module.exports.bufferToAddress = bufferToAddress = (data, startIndex) =>
  Buffer.from(data.subarray(startIndex, startIndex + 6))
    .reverse()
    .toString("hex");

module.exports.addressToBuffer = addressToBuffer = (address) =>
  Buffer.from(address, "hex").reverse();
