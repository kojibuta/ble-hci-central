// HciSocket.cpp

#include "HciSocket.h"

#include <errno.h>
#include <node_buffer.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

using namespace v8;

Nan::Persistent<v8::FunctionTemplate> HciSocket::constructor;

L2Socket::L2Socket(HciSocket* parent, uint8_t* srcAddr, uint8_t srcType, uint8_t* dstAddr, uint8_t dstType) : _parent(parent), _socket(-1), _handle(0x0fff), _src({}), _dst({}) {
#ifdef DEBUG
    printf("L2Socket::L2Socket: srcAddr %02x%02x%02x%02x%02x%02x, srcType %u, dstAddr %02x%02x%02x%02x%02x%02x, dstType %u\n",
           srcAddr[5], srcAddr[4], srcAddr[3], srcAddr[2], srcAddr[1], srcAddr[0], srcType,
           dstAddr[5], dstAddr[4], dstAddr[3], dstAddr[2], dstAddr[1], dstAddr[0], dstType);
#endif

    memset(&_src, 0, sizeof(_src));
    _src.l2_family = AF_BLUETOOTH;
    _src.l2_cid = htobs(ATT_CID);
    memcpy(&_src.l2_bdaddr, srcAddr, sizeof(_src.l2_bdaddr));
    _src.l2_bdaddr_type = srcType;  // BDADDR_BREDR (0x00), BDADDR_LE_PUBLIC (0x01), BDADDR_LE_RANDOM (0x02)

    memset(&_dst, 0, sizeof(_dst));
    _dst.l2_family = AF_BLUETOOTH;
    memcpy(&_dst.l2_bdaddr, dstAddr, sizeof(_dst.l2_bdaddr));
    _dst.l2_cid = _src.l2_cid;
    _dst.l2_bdaddr_type = dstType;  // BDADDR_BREDR (0x00), BDADDR_LE_PUBLIC (0x01), BDADDR_LE_RANDOM (0x02)

    connect();
}

L2Socket::~L2Socket() {
    disconnect();
}

void L2Socket::connect() {
    _socket = socket(PF_BLUETOOTH, SOCK_SEQPACKET, BTPROTO_L2CAP);
    if (_socket < 0) {
        return;
    }

    int rc = ::bind(_socket, (struct sockaddr*)&_src, sizeof(_src));
    if (rc < 0) {
#ifdef DEBUG
        printf("L2Socket::connect: bind %d %s", rc, strerror(errno));
#endif
        close(_socket);
        _socket = -1;
        return;
    }

    // The kernel needs to flush the socket before we continue
    while ((rc = ::connect(_socket, (struct sockaddr*)&_dst, sizeof(_dst))) < 0) {
#ifdef DEBUG
        printf("L2Socket::connect: connect %d %s", rc, strerror(errno));
#endif
        if (errno != EINTR && errno != EISCONN) {
            close(_socket);
            _socket = -1;
            break;
        }
    }
}

void L2Socket::disconnect() {
    if (_socket != -1) {
        close(_socket);
    }
    _socket = -1;
    _handle = 0x0fff;
}

bool L2Socket::connected() const {
    return _socket != -1;
}

NAN_MODULE_INIT(HciSocket::Init) {
    Nan::HandleScope scope;

    v8::Local<v8::FunctionTemplate> ctor = Nan::New<v8::FunctionTemplate>(HciSocket::New);
    constructor.Reset(ctor);
    ctor->InstanceTemplate()->SetInternalFieldCount(1);
    ctor->SetClassName(Nan::New("HciSocket").ToLocalChecked());

    Nan::SetPrototypeMethod(ctor, "availableL2Sockets", AvailableL2Sockets);
    Nan::SetPrototypeMethod(ctor, "start", Start);
    Nan::SetPrototypeMethod(ctor, "bind", Bind);
    Nan::SetPrototypeMethod(ctor, "isDeviceUp", IsDeviceUp);
    Nan::SetPrototypeMethod(ctor, "setFilter", SetFilter);
    Nan::SetPrototypeMethod(ctor, "stop", Stop);
    Nan::SetPrototypeMethod(ctor, "write", Write);

    Nan::Set(target, Nan::New("HciSocket").ToLocalChecked(), Nan::GetFunction(ctor).ToLocalChecked());
}

HciSocket::HciSocket() : node::ObjectWrap(), _socket(-1), _deviceId(0), _pollHandle(), _address(), _addressType(BDADDR_LE_PUBLIC), _availableL2Sockets(L2_SOCKETS_MAX) {
    for (int i = 0; i < L2_SOCKETS_MAX; i++) {
        _l2Sockets[i] = nullptr;
    }

    int fd = socket(AF_BLUETOOTH, SOCK_RAW | SOCK_CLOEXEC, BTPROTO_HCI);
    if (fd < 0) {
        Nan::ThrowError(Nan::ErrnoException(errno, "socket"));
        return;
    }
    _socket = fd;

    int opt = 1;
    if (setsockopt(fd, SOL_HCI, HCI_DATA_DIR, &opt, sizeof(opt)) < 0) {
        Nan::ThrowError(Nan::ErrnoException(errno, "setsockopt SOL_HCI HCI_DATA_DIR"));
        return;
    }

    // opt = 1;
    // if (setsockopt(fd, SOL_HCI, HCI_TIME_STAMP, &opt, sizeof(opt)) < 0) {
    //     Nan::ThrowError(Nan::ErrnoException(errno, "setsockopt SOL_HCI HCI_TIME_STAMP"));
    //     return;
    // }

    if (uv_poll_init(uv_default_loop(), &_pollHandle, _socket) < 0) {
        Nan::ThrowError("uv_poll_init failed");
        return;
    }
    _pollHandle.data = this;
}

HciSocket::~HciSocket() {
    for (int i = 0; i < L2_SOCKETS_MAX; i++) {
        if (_l2Sockets[i] != nullptr) {
            _l2Sockets[i]->disconnect();
            _l2Sockets[i] = nullptr;
            _availableL2Sockets++;
        }
    }
    uv_close((uv_handle_t*)&_pollHandle, (uv_close_cb)HciSocket::PollCloseCallback);
    close(_socket);
}

int HciSocket::availableL2Sockets() const {
    return _availableL2Sockets;
}

void HciSocket::start() {
    if (uv_poll_start(&_pollHandle, UV_READABLE, HciSocket::PollCallback) < 0) {
        Nan::ThrowError("uv_poll_start failed");
    }
}

int HciSocket::bind(int* deviceId) {
    struct sockaddr_hci a = {};
    struct hci_dev_info di = {};

    memset(&a, 0, sizeof(a));
    a.hci_family = AF_BLUETOOTH;
    a.hci_dev = deviceIdFor(deviceId, true);
    // a.hci_channel = HCI_CHANNEL_RAW;

    _deviceId = a.hci_dev;

#ifdef DEBUG
    printf("HciSocket::bind: deviceId %d\n", _deviceId);
#endif

    if (ioctl(_socket, HCIDEVRESET, _deviceId) < 0) {
        Nan::ThrowError(Nan::ErrnoException(errno, "ioctl HCIDEVRESET"));
        return -1;
    }

    if (ioctl(_socket, HCIDEVDOWN, _deviceId) < 0) {
        Nan::ThrowError(Nan::ErrnoException(errno, "ioctl HCIDEVDOWN"));
        return -1;
    }

    if (ioctl(_socket, HCIDEVUP, _deviceId) < 0) {
        Nan::ThrowError(Nan::ErrnoException(errno, "ioctl HCIDEVUP"));
        return -1;
    }

    if (::bind(_socket, (struct sockaddr*)&a, sizeof(a)) < 0) {
        Nan::ThrowError(Nan::ErrnoException(errno, "bind"));
        return -1;
    }

    // Get the local address and address type
    memset(&di, 0, sizeof(di));
    di.dev_id = _deviceId;
    memset(_address, 0, sizeof(_address));
    _addressType = 0;

    if (ioctl(_socket, HCIGETDEVINFO, (void*)&di) < 0) {
        Nan::ThrowError(Nan::ErrnoException(errno, "ioctl HCIGETDEVINFO"));
        return -1;
    }

    memcpy(_address, &di.bdaddr, sizeof(di.bdaddr));
    _addressType = di.type;
    if (_addressType != BDADDR_LE_RANDOM) {
        _addressType = BDADDR_LE_PUBLIC;
    }

    return _deviceId;
}

bool HciSocket::isDeviceUp() {
    struct hci_dev_info di = {};
    bool isUp = false;

    memset(&di, 0x00, sizeof(di));
    di.dev_id = _deviceId;

    if (ioctl(_socket, HCIGETDEVINFO, (void*)&di) > -1) {
        isUp = (di.flags & (1 << HCI_UP)) != 0;
    }

    return isUp;
}

void HciSocket::setFilter(char* data, int length) {
    if (setsockopt(_socket, SOL_HCI, HCI_FILTER, data, length) < 0) {
        emitErrnoError("setsockopt SOL_HCI HCI_FILTER");
    }
}

void HciSocket::setAuth(bool enabled) {
    struct hci_dev_req dr = {};

    dr.dev_id = _deviceId;
    dr.dev_opt = enabled ? AUTH_ENABLED : AUTH_DISABLED;

    if (ioctl(_socket, HCISETAUTH, (unsigned long)&dr) < 0) {
        emitErrnoError("ioctl HCISETAUTH");
    }
}

void HciSocket::setEncrypt(bool enabled) {
    struct hci_dev_req dr = {};

    dr.dev_id = _deviceId;
    dr.dev_opt = enabled ? ENCRYPT_P2P : ENCRYPT_DISABLED;

    if (ioctl(_socket, HCISETENCRYPT, (unsigned long)&dr) < 0) {
        emitErrnoError("ioctl HCISETENCRYPT");
    }
}

void HciSocket::poll() {
    Nan::HandleScope scope;

    int length = 0;
    char data[HCI_MAX_FRAME_SIZE];

    length = read(_socket, data, sizeof(data));

    if (length > 0) {
        l2SocketOnHciRead(data, length);

        Local<Value> argv[2] = {
            Nan::New("data").ToLocalChecked(),
            Nan::CopyBuffer(data, length).ToLocalChecked()};

        Nan::AsyncResource res("HciSocket::poll");
        res.runInAsyncScope(
               Nan::New<Object>(this->This),
               Nan::New("emit").ToLocalChecked(),
               2,
               argv)
            .FromMaybe(v8::Local<v8::Value>());
    }
}

void HciSocket::stop() {
    uv_poll_stop(&_pollHandle);
}

void HciSocket::write_(char* data, int length) {
    if (l2SocketOnHciWrite(data, length)) {
        return;
    }
    if (write(_socket, data, length) < 0) {
        emitErrnoError("write");
    }
}

void HciSocket::emitError(const char* message) {
    v8::Local<v8::Value> error = Nan::Error(message);

    Local<Value> argv[2] = {
        Nan::New("error").ToLocalChecked(),
        error};
    Nan::AsyncResource res("HciSocket::emitError");
    res.runInAsyncScope(
           Nan::New<Object>(this->This),
           Nan::New("emit").ToLocalChecked(),
           2,
           argv)
        .FromMaybe(v8::Local<v8::Value>());
}

void HciSocket::emitErrnoError(const char* syscall) {
    v8::Local<v8::Value> error = Nan::ErrnoException(errno, syscall, strerror(errno));

    Local<Value> argv[2] = {
        Nan::New("error").ToLocalChecked(),
        error};
    Nan::AsyncResource res("HciSocket::emitErrnoError");
    res.runInAsyncScope(
           Nan::New<Object>(this->This),
           Nan::New("emit").ToLocalChecked(),
           2,
           argv)
        .FromMaybe(v8::Local<v8::Value>());
}

int HciSocket::deviceIdFor(const int* pDeviceId, bool isUp) {
    int deviceId = 0;  // default

    if (pDeviceId == nullptr) {
        struct hci_dev_list_req* dl;
        struct hci_dev_req* dr;

        dl = (hci_dev_list_req*)calloc(HCI_MAX_DEV * sizeof(*dr) + sizeof(*dl), 1);
        dr = dl->dev_req;
        dl->dev_num = HCI_MAX_DEV;

        if (ioctl(_socket, HCIGETDEVLIST, dl) > -1) {
            for (int i = 0; i < dl->dev_num; i++, dr++) {
                bool devUp = dr->dev_opt & (1 << HCI_UP);
                if (isUp == devUp) {
                    // choose the first device that is match
                    // it would be good to also HCIGETDEVINFO and check the HCI_RAW flag
                    deviceId = dr->dev_id;
                    break;
                }
            }
        }

        free(dl);
    } else {
        deviceId = *pDeviceId;
    }

    return deviceId;
}

void HciSocket::l2SocketOnHciRead(char* data, int length) {
    if (length == 22 && data[0] == HCI_EVENT_PKT && data[1] == EVT_LE_META_EVENT && data[2] == 19 && data[3] == EVT_LE_CONN_COMPLETE && data[4] == 0x00) {
        // On HCI Event - LE Meta Event - LE Connection Complete => manually create L2CAP socket or update existing
#ifdef DEBUG
        printf("HciSocket::l2SocketOnHciRead: evt_type HCI_EVENT_PKT, sub_evt_type EVT_LE_META_EVENT, sub_evt EVT_LE_CONN_COMPLETE\n");
#endif
        // Data format
        // uint8_t evt_type: HCI_EVENT_PKT (0x04)
        // uint8_t sub_evt_type: EVT_LE_META_EVENT (0x3b)
        // uint8_t pkt_len: (19)
        // uint8_t sub_evt: EVT_LE_CONN_COMPLETE (0x01)
        // uint8_t status
        // uint16_t handle
        // uint8_t role
        // uint8_t peer_bdaddr_type
        // bdaddr_t peer_bdaddr
        // uint16_t interval
        // uint16_t latency
        // uint16_t supervision_timeout
        // uint8_t master_clock_accuracy
        uint16_t handle = *((uint16_t*)(&data[5]));
        handle = handle & 0x0fff;  // Remove flags
        uint8_t peerAddrType = data[8] + 1;
        uint8_t* peerAddr = (uint8_t*)(&data[9]);
#ifdef DEBUG
        uint16_t interval = (data[16] << 8) | data[15];
        uint16_t latency = (data[18] << 8) | data[17];
        uint16_t timeout = (data[20] << 8) | data[19];
        printf("HciSocket::l2SocketOnHciRead: handle %u, peerAddrType %u, peerAddr %02x%02x%02x%02x%02x%02x, interval %u, latency %u, timeout %u\n",
               handle, peerAddrType, peerAddr[5], peerAddr[4], peerAddr[3], peerAddr[2], peerAddr[1], peerAddr[0], interval, latency, timeout);
#endif

        std::shared_ptr<L2Socket> l2Socket = nullptr;
        for (int i = 0; i < L2_SOCKETS_MAX; i++) {
            if (_l2Sockets[i] != nullptr) {
                uint8_t* sockAddr = (uint8_t*)_l2Sockets[i]->_dst.l2_bdaddr.b;
                if (!memcmp(sockAddr, peerAddr, 6)) {
                    l2Socket = _l2Sockets[i];
                    break;
                }
            }
        }

        if (l2Socket != nullptr) {
#ifdef DEBUG
            printf("HciSocket::l2SocketOnHciRead: socket found (connected %d)\n", l2Socket->connected());
#endif
            l2Socket->_handle = handle;
        } else {
#ifdef DEBUG
            printf("HciSocket::l2SocketOnHciRead: socket not found (available %d)\n", _availableL2Sockets);
#endif
            l2Socket = std::make_shared<L2Socket>(this, _address, _addressType, peerAddr, peerAddrType);
            if (!l2Socket->connected()) {
#ifdef DEBUG
                printf("HciSocket::l2SocketOnHciRead: socket not connected\n");
#endif
                emitError("L2SocketNotConnected");
                return;
            }
            l2Socket->_handle = handle;
            for (int i = 0; i < L2_SOCKETS_MAX; i++) {
                if (_l2Sockets[i] == nullptr) {
                    _l2Sockets[i] = l2Socket;
                    _availableL2Sockets--;
                    break;
                }
            }
        }
    } else if (length == 7 && data[0] == HCI_EVENT_PKT && data[1] == EVT_DISCONN_COMPLETE && data[2] == 4 && data[3] == 0x00) {
        // On HCI Event - Disconn Complete => manually destroy L2CAP socket
#ifdef DEBUG
        printf("HciSocket::l2SocketOnHciRead: evt_type HCI_EVENT_PKT, sub_evt_type EVT_DISCONN_COMPLETE\n");
#endif
        // Data format
        // uint8_t evt_type: HCI_EVENT_PKT (0x04)
        // uint8_t sub_evt_type: EVT_DISCONN_COMPLETE (0x05)
        // uint8_t pkt_len: (4)
        // uint8_t status
        // uint16_t handle
        // uint8_t reason
        uint16_t handle = *((uint16_t*)(&data[4]));
        handle = handle & 0x0fff;  // Remove flags

#ifdef DEBUG
        printf("HciSocket::l2SocketOnHciRead: handle %u\n", handle);
#endif

        for (int i = 0; i < L2_SOCKETS_MAX; i++) {
            if (_l2Sockets[i] != nullptr && _l2Sockets[i]->_handle == handle) {
#ifdef DEBUG
                printf("HciSocket::l2SocketOnHciRead: socket found (connected %d)\n", _l2Sockets[i]->connected());
#endif
                _l2Sockets[i]->disconnect();
                _l2Sockets[i] = nullptr;
                _availableL2Sockets++;
                break;
            }
        }
    }
}

bool HciSocket::l2SocketOnHciWrite(char* data, int length) {
    if (length == 29 && data[0] == HCI_COMMAND_PKT && ((data[2] << 8) | data[1]) == (OCF_LE_CREATE_CONN | (OGF_LE_CTL << 10)) && data[3] == 25) {
        // On HCI Command - LE Create Conn => manually create L2CAP socket
#ifdef DEBUG
        printf("HciSocket::l2SocketOnHciWrite: evt_type HCI_COMMAND_PKT, command OCF_LE_CREATE_CONN\n");
#endif
        // Data format
        // uint8_t evt_type: HCI_COMMAND_PKT (0x01)
        // uint16_t command: OCF_LE_CREATE_CONN | (OGF_LE_CTL << 10) (0x200d)
        // uint8_t pkt_len: (25)
        // uint16_t interval
        // uint16_t window
        // uint8_t initiator_filter
        // uint8_t peer_bdaddr_type
        // bdaddr_t peer_bdaddr
        // uint8_t own_bdaddr_type
        // uint16_t min_interval
        // uint16_t max_interval
        // uint16_t latency
        // uint16_t supervision_timeout
        // uint16_t min_ce_length
        // uint16_t max_ce_length
        uint8_t peerAddrType = data[9] + 1;
        uint8_t* peerAddr = (uint8_t*)(&data[10]);
        uint16_t minInterval = (data[18] << 8) | data[17];
        uint16_t maxInterval = (data[20] << 8) | data[19];
        uint16_t latency = (data[22] << 8) | data[21];
        uint16_t timeout = (data[24] << 8) | data[23];
#ifdef DEBUG
        uint16_t interval = (data[5] << 8) | data[4];
        uint16_t window = (data[7] << 8) | data[6];
        printf("HciSocket::l2SocketOnHciWrite: interval %u, window %u, peerAddrType %u, peerAddr %02x%02x%02x%02x%02x%02x, minInterval %u, maxInterval %u, latency %u, timeout %u\n",
               interval, window, peerAddrType, peerAddr[5], peerAddr[4], peerAddr[3], peerAddr[2], peerAddr[1], peerAddr[0], minInterval, maxInterval, latency, timeout);
#endif

        std::shared_ptr<L2Socket> l2Socket = nullptr;
        for (int i = 0; i < L2_SOCKETS_MAX; i++) {
            if (_l2Sockets[i] != nullptr) {
                uint8_t* sockAddr = (uint8_t*)_l2Sockets[i]->_dst.l2_bdaddr.b;
                if (!memcmp(sockAddr, peerAddr, 6)) {
                    l2Socket = _l2Sockets[i];
                    break;
                }
            }
        }

        if (l2Socket != nullptr) {
#ifdef DEBUG
            printf("HciSocket::l2SocketOnHciWrite: socket found (connected %d)\n", l2Socket->connected());
#endif
            setConnectionParameters(minInterval, maxInterval, latency, timeout);
            l2Socket->disconnect();
            l2Socket->connect();
        } else if (_availableL2Sockets > 0) {
#ifdef DEBUG
            printf("HciSocket::l2SocketOnHciWrite: socket not found (available %d)\n", _availableL2Sockets);
#endif
            setConnectionParameters(minInterval, maxInterval, latency, timeout);
            l2Socket = std::make_shared<L2Socket>(this, _address, _addressType, peerAddr, peerAddrType);
            if (!l2Socket->connected()) {
#ifdef DEBUG
                printf("HciSocket::l2SocketOnHciWrite: created socket not connected\n");
#endif
                emitError("L2SocketNotConnected");
                return false;
            }
            for (int i = 0; i < L2_SOCKETS_MAX; i++) {
                if (_l2Sockets[i] == nullptr) {
                    _l2Sockets[i] = l2Socket;
                    _availableL2Sockets--;
                    break;
                }
            }
        }

        // Return true to skip sending this command to HCI, because the command will be sent by the connect() operation
        return true;
    }

    return false;
}

// Override the HCI devices connection parameters using debugfs
void HciSocket::setConnectionParameters(uint16_t minInterval, uint16_t maxInterval, uint16_t latency, uint16_t timeout) {
    char command[80];
    sprintf(command, "echo %u > /sys/kernel/debug/bluetooth/hci%d/conn_min_interval", minInterval, _deviceId);
    system(command);
    sprintf(command, "echo %u > /sys/kernel/debug/bluetooth/hci%d/conn_max_interval", maxInterval, _deviceId);
    system(command);
    sprintf(command, "echo %u > /sys/kernel/debug/bluetooth/hci%d/conn_latency", latency, _deviceId);
    system(command);
    sprintf(command, "echo %u > /sys/kernel/debug/bluetooth/hci%d/supervision_timeout", timeout, _deviceId);
    system(command);
}

NAN_METHOD(HciSocket::New) {
    Nan::HandleScope scope;
    HciSocket* p = new HciSocket();
    p->Wrap(info.This());
    p->This.Reset(info.This());
    info.GetReturnValue().Set(info.This());
}

NAN_METHOD(HciSocket::Start) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    p->start();
    info.GetReturnValue().SetUndefined();
}

NAN_METHOD(HciSocket::Bind) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    int deviceId = 0;
    int* pDeviceId = nullptr;
    if (info.Length() > 0) {
        Local<Value> arg0 = info[0];
        if (arg0->IsInt32() || arg0->IsUint32()) {
            deviceId = Nan::To<int32_t>(arg0).FromJust();
            pDeviceId = &deviceId;
        }
    }
    deviceId = p->bind(pDeviceId);
    info.GetReturnValue().Set(deviceId);
}

NAN_METHOD(HciSocket::AvailableL2Sockets) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    int availableL2Sockets = p->availableL2Sockets();
    info.GetReturnValue().Set(availableL2Sockets);
}

NAN_METHOD(HciSocket::IsDeviceUp) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    bool isDeviceUp = p->isDeviceUp();
    info.GetReturnValue().Set(isDeviceUp);
}

NAN_METHOD(HciSocket::SetFilter) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    if (info.Length() > 0) {
        Local<Value> arg0 = info[0];
        if (arg0->IsObject()) {
            p->setFilter(node::Buffer::Data(arg0), node::Buffer::Length(arg0));
        }
    }
    info.GetReturnValue().SetUndefined();
}

NAN_METHOD(HciSocket::SetAuth) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    if (info.Length() > 0) {
        Local<Value> arg0 = info[0];
        if (arg0->IsBoolean()) {
            p->setAuth(Nan::To<bool>(arg0).FromJust());
        }
    }
    info.GetReturnValue().SetUndefined();
}

NAN_METHOD(HciSocket::SetEncrypt) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    if (info.Length() > 0) {
        Local<Value> arg0 = info[0];
        if (arg0->IsBoolean()) {
            p->setEncrypt(Nan::To<bool>(arg0).FromJust());
        }
    }
    info.GetReturnValue().SetUndefined();
}

NAN_METHOD(HciSocket::Stop) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    p->stop();
    info.GetReturnValue().SetUndefined();
}

NAN_METHOD(HciSocket::Write) {
    Nan::HandleScope scope;
    HciSocket* p = node::ObjectWrap::Unwrap<HciSocket>(info.This());
    if (info.Length() > 0) {
        Local<Value> arg0 = info[0];
        if (arg0->IsObject()) {
            p->write_(node::Buffer::Data(arg0), node::Buffer::Length(arg0));
        }
    }
    info.GetReturnValue().SetUndefined();
}

void HciSocket::PollCloseCallback(uv_poll_t* handle) {
    delete handle;
}

void HciSocket::PollCallback(uv_poll_t* handle, int status, int events) {
    HciSocket* p = (HciSocket*)handle->data;
    p->poll();
}
