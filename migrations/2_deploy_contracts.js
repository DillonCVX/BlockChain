const SimpleERC20 = artifacts.require("SimpleERC20");
const TokenEmitter = artifacts.require("TokenEmitter");

module.exports = async function(deployer) {
  // Deploy SimpleERC20(name, symbol, initialSupply)
  await deployer.deploy(SimpleERC20, "TestToken", "TTK", 1000);
  // Deploy TokenEmitter
  await deployer.deploy(TokenEmitter);
};
