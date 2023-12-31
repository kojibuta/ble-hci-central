// smp-defs.js

module.exports = Object.freeze({
  // L2CAP Channel ID for Security Manager Protocol (SMP)
  SMP_CID: 0x0006,

  // SMP Protocol Opcodes
  SMP_PAIRING_REQUEST: 0x01,
  SMP_PAIRING_RESPONSE: 0x02,
  SMP_PAIRING_CONFIRM: 0x03,
  SMP_PAIRING_RANDOM: 0x04,
  SMP_PAIRING_FAILED: 0x05,
  SMP_ENCRYPT_INFO: 0x06,
  SMP_MASTER_IDENT: 0x07,

  // SMP Out-Of-Band mode
  OOB_DATA_DISABLE: 0x00,
  OOB_DATA_ENABLE: 0x01,

  // SMP I/O Capability
  IO_CAP_DISPLAY_ONLY: 0x00, // DisplayOnly
  IO_CAP_DISPLAY_YES_NO: 0x01, // DisplayYesNo
  IO_CAP_KEYBOARD_ONLY: 0x02, // KeyboardOnly
  IO_CAP_NO_INPUT_NO_OUTPUT: 0x03, // NoInputNoOutput
  IO_CAP_KEYBOARD_DISPLAY: 0x04, // Keyboard display

  // SMP Auth Request
  AUTH_REQ_NONE: 0x00,
  AUTH_REQ_BOND_MASK: 0x01,
  AUTH_REQ_MITM_MASK: 0x04,
  AUTH_REQ_SC_MASK: 0x08,

  // Security key distribution
  KEY_DIST_NONE: 0x00, // Do not exchange keys in the init key & response key
  KEY_DIST_ENC_KEY_MASK: 0x01, // Exchange the Enc key in the init key & response key
  KEY_DIST_ID_KEY_MASK: 0x02, // Exchange the IRK key in the init key & response key
  KEY_DIST_CSR_KEY_MASK: 0x04, // Exchange the CSRK key in the init key & response key
  KEY_DIST_LINK_KEY_MASK: 0x08, // Exchange the Link key (this key just used in the BLE & BR/EDR coexist mode) in the init key & response key
});
