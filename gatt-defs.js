// gatt-defs.js

module.exports = Object.freeze({
  // GATT service type UUIDs
  GATT_PRIMARY_SVC_UUID: 0x2800,
  GATT_SECONDARY_SVC_UUID: 0x2801,
  GATT_INCLUDED_SVC_UUID: 0x2802,
  GATT_CHARACTERISTIC_UUID: 0x2803,

  // GATT characteristic configuration UUIDs
  GATT_EXTENDED_CHARAC_CFG_UUID: 0x2900,
  GATT_USER_CHARAC_CFG_UUID: 0x2901,
  GATT_CLIENT_CHARAC_CFG_UUID: 0x2902,
  GATT_SERVER_CHARAC_CFG_UUID: 0x2903,
  GATT_PRESENTATION_FMT_CFG_UUID: 0x2904,
  GATT_AGGREGATE_FMT_CFG_UUID: 0x2905,

  // GATT Characteristic Properties Bitfield values
  GATT_CHRC_PROP_BROADCAST: 0x01,
  GATT_CHRC_PROP_READ: 0x02,
  GATT_CHRC_PROP_WRITE_WITHOUT_RESP: 0x04,
  GATT_CHRC_PROP_WRITE: 0x08,
  GATT_CHRC_PROP_NOTIFY: 0x10,
  GATT_CHRC_PROP_INDICATE: 0x20,
  GATT_CHRC_PROP_AUTH: 0x40,
  GATT_CHRC_PROP_EXT_PROP: 0x80,

  // GATT Characteristic Properties Bitfield values
  GATT_CHRC_PROP_BROADCAST: 0x01,
  GATT_CHRC_PROP_READ: 0x02,
  GATT_CHRC_PROP_WRITE_WITHOUT_RESP: 0x04,
  GATT_CHRC_PROP_WRITE: 0x08,
  GATT_CHRC_PROP_NOTIFY: 0x10,
  GATT_CHRC_PROP_INDICATE: 0x20,
  GATT_CHRC_PROP_AUTH: 0x40,
  GATT_CHRC_PROP_EXT_PROP: 0x80,

  // GATT Characteristic Extended Properties Bitfield values
  GATT_CHRC_EXT_PROP_RELIABLE_WRITE: 0x01,
  GATT_CHRC_EXT_PROP_WRITABLE_AUX: 0x02,
  GATT_CHRC_EXT_PROP_ENC_READ: 0x04,
  GATT_CHRC_EXT_PROP_ENC_WRITE: 0x08,
  GATT_CHRC_EXT_PROP_AUTH_READ: 0x10,
  GATT_CHRC_EXT_PROP_AUTH_WRITE: 0x20,

  // GATT Auth Req
  GATT_AUTH_REQ_NONE: 0,
  GATT_AUTH_REQ_NO_MITM: 1,
  GATT_AUTH_REQ_MITM: 2,
  GATT_AUTH_REQ_SIGNED_NO_MITM: 3,
  GATT_AUTH_REQ_SIGNED_MITM: 4,
});
