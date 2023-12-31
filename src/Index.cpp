// Index.cpp

#include <nan.h>

#include "HciSocket.h"

NAN_MODULE_INIT(InitModule) {
    HciSocket::Init(target);
}

NODE_MODULE(hci_socket, InitModule);