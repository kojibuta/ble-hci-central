{
  "targets": [
    {
      "target_name": "hci_socket",
      "conditions": [
        ["OS=='linux'", {
          "sources": [
            "src/Index.cpp",
            "src/HciSocket.cpp"
          ]
        }]
      ],
      "include_dirs" : [
            "<!(node -e \"require('nan')\")"
        ]
    },
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [ "hci_socket" ],
      "copies": [
        {
          "files": [ "<(PRODUCT_DIR)/hci_socket.node" ],
          "destination": "./lib/<(OS)/<(target_arch)/"
        }
      ]
    }
  ]
}
