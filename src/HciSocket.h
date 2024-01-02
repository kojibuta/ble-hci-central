// HciSocket.h

#ifndef HCI_SOCKET_H
#define HCI_SOCKET_H

#include <bluetooth/bluetooth.h>
#include <bluetooth/hci.h>
#include <bluetooth/l2cap.h>
#include <nan.h>
#include <node.h>

#include <memory>

#define L2_SOCKETS_MAX 5
#define L2_CONNECT_TIMEOUT 60000000000
#define ATT_CID 0x0004

class HciSocket;

class L2Socket {
    friend class HciSocket;

   public:
    L2Socket(HciSocket* parent, uint8_t* srcAddr, uint8_t srcType, uint8_t* dstAddr, uint8_t dstType);
    ~L2Socket();
    void disconnect();
    void connect();
    bool connected() const;

   private:
    HciSocket* _parent;
    int _socket;
    uint16_t _handle;
    struct sockaddr_l2 _src;
    struct sockaddr_l2 _dst;

   private:
    int _errno;
    const char* _syscall;
};

class HciSocket : public node::ObjectWrap {
    friend class L2Socket;

   public:
    static NAN_MODULE_INIT(Init);
    static NAN_METHOD(New);
    static NAN_METHOD(Bind);
    static NAN_METHOD(IsDeviceUp);
    static NAN_METHOD(SetFilter);
    static NAN_METHOD(SetAuth);
    static NAN_METHOD(SetEncrypt);
    static NAN_METHOD(AvailableL2Sockets);
    static NAN_METHOD(Start);
    static NAN_METHOD(Stop);
    static NAN_METHOD(Write);

   private:
    HciSocket();
    ~HciSocket();

    int availableL2Sockets() const;
    void start();
    int bind(int* deviceId);
    bool isDeviceUp();
    void setFilter(char* data, int length);
    void setAuth(bool enabled);
    void setEncrypt(bool enabled);
    void stop();
    void write(char* data, int length);
    void poll();
    void emitErrnoError(int err_no, const char* syscall);
    int deviceIdFor(const int* deviceId, bool isUp);
    void l2SocketOnHciRead(char* data, int length);
    bool l2SocketOnHciWrite(char* data, int length);
    void setConnectionParameters(uint16_t minInterval, uint16_t maxInterval, uint16_t latency, uint16_t timeout);

    static void PollCloseCallback(uv_poll_t* handle);
    static void PollCallback(uv_poll_t* handle, int status, int events);

   private:
    Nan::Persistent<v8::Object> This;

    int _socket;
    int _deviceId;
    uv_poll_t _pollHandle;
    uint8_t _address[6];
    uint8_t _addressType;
    int _availableL2Sockets;
    std::shared_ptr<L2Socket> _l2Sockets[L2_SOCKETS_MAX];

    static Nan::Persistent<v8::FunctionTemplate> constructor;
};

#endif  // HCI_SOCKET_H
