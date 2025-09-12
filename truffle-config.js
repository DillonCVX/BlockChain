module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",     // Ganache GUI default
      port: 7546,            // Ganache GUI default
      network_id: "*",       // Match any network id
    },
  },
  compilers: { solc: { version: "0.8.17" } }
};
