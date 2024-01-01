// index.d.ts

/// <reference types="node" />

import events = require("events");

export declare const AttDefs: any;
export declare const GattDefs: any;
export declare const HciDefs: any;
export declare const SmpDefs: any;

export declare function availableL2Sockets(): number;
export declare function setAuth(enabled: boolean): void;
export declare function setEncrypt(enabled: boolean): void;

export declare function start(): void;
export declare function on(event: "start", listener: () => void): events.EventEmitter;
export declare function once(event: "start", listener: () => void): events.EventEmitter;

export declare function stop(): void;
export declare function on(event: "stop", listener: () => void): events.EventEmitter;
export declare function once(event: "stop", listener: () => void): events.EventEmitter;

export declare function reset(): void;
export declare function on(event: "reset", listener: (status: number) => void): events.EventEmitter;
export declare function once(event: "reset", listener: (status: number) => void): events.EventEmitter;

export declare function on(event: "error", listener: (error: Error) => void): events.EventEmitter;
export declare function once(event: "error", listener: (error: Error) => void): events.EventEmitter;

export declare function on(event: "address", listener: (addressType: number, address: string) => void): events.EventEmitter;
export declare function once(event: "address", listener: (addressType: number, address: string) => void): events.EventEmitter;

export declare function setScanParameters(type: number, interval: number, window: number, ownAddressType: number, filter: number): void;
export declare function setScanParametersAsync(type: number, interval: number, window: number, ownAddressType: number, filter: number): Promise<number>;
export declare function on(event: "scanParametersSet", listener: (status: number) => void): events.EventEmitter;
export declare function once(event: "scanParametersSet", listener: (status: number) => void): events.EventEmitter;

export declare function startScanning(filterDuplicates: boolean, duration: number, period: number): void;
export declare function startScanningAsync(filterDuplicates: boolean, duration: number, period: number): Promise<number>;
export declare function on(event: "scanStart", listener: (status: number) => void): events.EventEmitter;
export declare function once(event: "scanStart", listener: (status: number) => void): events.EventEmitter;

export declare function stopScanning(): void;
export declare function stopScanningAsync(): Promise<number>;
export declare function on(event: "scanStop", listener: (status: number) => void): events.EventEmitter;
export declare function once(event: "scanStop", listener: (status: number) => void): events.EventEmitter;

export declare function on(event: "advertisement", listener: (type: number, addressType: number, address: string, advLength: number, advData: Buffer, rssi: number, numReports: number) => void): events.EventEmitter;
export declare function once(event: "advertisement", listener: (type: number, addressType: number, address: string, advLength: number, advData: Buffer, rssi: number, numReports: number) => void): events.EventEmitter;
export declare function on(event: "extendedAdvertisement", listener: (type: number, addressType: number, address: string, primaryPhy: number, secondaryPhy: number, sid: number, txpower: number, rssi: number, periodicAdvInterval: number, directAddressType: number, directAddress: string, advData: Buffer, numReports: number) => void): events.EventEmitter;
export declare function once(event: "extendedAdvertisement", listener: (type: number, addressType: number, address: string, primaryPhy: number, secondaryPhy: number, sid: number, txpower: number, rssi: number, periodicAdvInterval: number, directAddressType: number, directAddress: string, advData: Buffer, numReports: number) => void): events.EventEmitter;

export declare function connect(addressType: number, address: string, parameters: any): void;
export declare function connectAsync(addressType: number, address: string, parameters: any): Promise<any>;
export declare function on(event: "connect", listener: (status: number, handle: number, role: number, addressType: number, address: string, interval: number, latency: number, supervisionTimeout: number, masterClockAccuracy: number, localResolvablePrivateAddress: string, peerResolvablePrivateAddress: string) => void): events.EventEmitter;
export declare function once(event: "connect", listener: (status: number, handle: number, role: number, addressType: number, address: string, interval: number, latency: number, supervisionTimeout: number, masterClockAccuracy: number, localResolvablePrivateAddress: string, peerResolvablePrivateAddress: string) => void): events.EventEmitter;

export declare function disconnect(address: string): void;
export declare function disconnectAsync(address: string): Promise<any>;
export declare function on(event: "disconnect", listener: (address: string, reason: number) => void): events.EventEmitter;
export declare function once(event: "disconnect", listener: (address: string, reason: number) => void): events.EventEmitter;

export declare function cancelConnect(): void;

export declare function exchangeMtu(address: string): void;
export declare function exchangeMtuAsync(address: string): Promise<any>;
export declare function on(event: "mtu", listener: (address: string, mtu: number) => void): events.EventEmitter;
export declare function once(event: "mtu", listener: (address: string, mtu: number) => void): events.EventEmitter;

export declare function encrypt(address: string, options: any): void;
export declare function on(event: "encryptChange", listener: (address: string, encrypt: number) => void): events.EventEmitter;
export declare function once(event: "encryptChange", listener: (address: string, encrypt: number) => void): events.EventEmitter;
export declare function on(event: "encryptFail", listener: (address: string) => void): events.EventEmitter;
export declare function once(event: "encryptFail", listener: (address: string) => void): events.EventEmitter;

export declare function updateConnectionParameters(address: string, minInterval: number, maxInterval: number, latency: number, supervisionTimeout: number): void;
export declare function updateConnectionParametersAsync(address: string, minInterval: number, maxInterval: number, latency: number, supervisionTimeout: number): Promise<any>;
export declare function on(event: "connectionParametersUpdate", listener: (status: number, address: string, interval: number, latency: number, supervisionTimeout: number) => void): events.EventEmitter;
export declare function once(event: "connectionParametersUpdate", listener: (status: number, address: string, interval: number, latency: number, supervisionTimeout: number) => void): events.EventEmitter;

export declare function discoverServices(address: string): void;
export declare function discoverServicesAsync(address: string): Promise<any>;
export declare function on(event: "servicesDiscover", listener: (address: string, services: any) => void): events.EventEmitter;
export declare function once(event: "servicesDiscover", listener: (address: string, services: any) => void): events.EventEmitter;

export declare function discoverIncludedServices(address: string, serviceUuid: string): void;
export declare function discoverIncludedServicesAsync(address: string, serviceUuid: string): Promise<any>;
export declare function on(event: "servicesIncludedDiscover", listener: (address: string, serviceUuid: string, includedServices: any) => void): events.EventEmitter;
export declare function once(event: "servicesIncludedDiscover", listener: (address: string, serviceUuid: string, includedServices: any) => void): events.EventEmitter;

export declare function discoverCharacteristics(address: string, serviceUuid: string): void;
export declare function discoverCharacteristicsAsync(address: string, serviceUuid: string): Promise<any>;
export declare function on(event: "characteristicsDiscover", listener: (address: string, serviceUuid: string, characteristics: any) => void): events.EventEmitter;
export declare function once(event: "characteristicsDiscover", listener: (address: string, serviceUuid: string, characteristics: any) => void): events.EventEmitter;

export declare function discoverDescriptors(address: string, serviceUuid: string, characteristicUuid: string): void;
export declare function discoverDescriptorsAsync(address: string, serviceUuid: string, characteristicUuid: string): Promise<any>;
export declare function on(event: "descriptorsDiscover", listener: (address: string, serviceUuid: string, characteristicUuid: string, descriptors: any) => void): events.EventEmitter;
export declare function once(event: "descriptorsDiscover", listener: (address: string, serviceUuid: string, characteristicUuid: string, descriptors: any) => void): events.EventEmitter;

export declare function discoverAsync(address: string, includeDescriptors: boolean, timeout: number): Promise<any>;

export declare function getMtu(address: string): number;
export declare function getServices(address: string): any;
export declare function getServiceByUuid(address: string, serviceUuid: string): any;
export declare function getCharacteristicByUuid(address: string, serviceUuid: string, characteristicUuid: string): any;
export declare function getCharacteristicByHandle(address: string, characteristicHandle: number): any;
export declare function getDescriptorByUuid(address: string, serviceUuid: string, characteristicUuid: string, descriptorUuid: string): any;
export declare function getDescriptorByHandle(address: string, descriptorHandle: number): any;

export declare function read(address: string, handle: number): void;
export declare function readAsync(address: string, handle: number): Promise<any>;
export declare function on(event: "read", listener: (address: string, handle: number, value: Buffer, error: Error) => void): events.EventEmitter;
export declare function once(event: "read", listener: (address: string, handle: number, value: Buffer, error: Error) => void): events.EventEmitter;

export declare function write(address: string, handle: number, value: Buffer, whitoutResponse: boolean): void;
export declare function writeAsync(address: string, handle: number, value: Buffer, whitoutResponse: boolean): Promise<any>;
export declare function on(event: "write", listener: (address: string, handle: number, value: Buffer, error: Error) => void): events.EventEmitter;
export declare function once(event: "write", listener: (address: string, handle: number, value: Buffer, error: Error) => void): events.EventEmitter;

export declare function broadcast(address: string, handle: number, broadcast: number): void;
export declare function broadcastAsync(address: string, handle: number, broadcast: number): Promise<any>;
export declare function on(event: "broadcast", listener: (address: string, handle: number, descriptorHandle: number, broadcast: number, error: Error) => void): events.EventEmitter;
export declare function once(event: "broadcast", listener: (address: string, handle: number, descriptorHandle: number, broadcast: number, error: Error) => void): events.EventEmitter;

export declare function notify(address: string, handle: number, notify: number): void;
export declare function notifyAsync(address: string, handle: number, notify: number): Promise<any>;
export declare function on(event: "notify", listener: (address: string, handle: number, descriptorHandle: number, notify: number, error: Error) => void): events.EventEmitter;
export declare function once(event: "notify", listener: (address: string, handle: number, descriptorHandle: number, notify: number, error: Error) => void): events.EventEmitter;

export declare function on(event: "notification", listener: (address: string, handle: number, value: Buffer) => void): events.EventEmitter;
export declare function once(event: "notification", listener: (address: string, handle: number, value: Buffer) => void): events.EventEmitter;

export declare function readDescriptor(address: string, handle: number): void;
export declare function readDescriptorAsync(address: string, handle: number): Promise<any>;
export declare function on(event: "readDescriptor", listener: (address: string, handle: number, value: Buffer, error: Error) => void): events.EventEmitter;
export declare function once(event: "readDescriptor", listener: (address: string, handle: number, value: Buffer, error: Error) => void): events.EventEmitter;

export declare function writeDescriptor(address: string, handle: number, value: Buffer): void;
export declare function writeDescriptorAsync(address: string, handle: number, value: Buffer): Promise<any>;
export declare function on(event: "writeDescriptor", listener: (address: string, handle: number, value: Buffer, error: Error) => void): events.EventEmitter;
export declare function once(event: "writeDescriptor", listener: (address: string, handle: number, value: Buffer, error: Error) => void): events.EventEmitter;

