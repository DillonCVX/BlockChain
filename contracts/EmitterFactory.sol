// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TokenEmitter.sol";

/// @title EmitterFactory - deploy many TokenEmitter instances for event testing
/// @notice Allows convenient deployment of multiple TokenEmitter contracts and tracks them
contract EmitterFactory {
    address[] public deployed;

    event Deployed(address indexed deployer, address indexed instance);

    /// @notice Deploys a fresh TokenEmitter and records the address
    function deployEmitter() external returns (address) {
        TokenEmitter t = new TokenEmitter();
        address addr = address(t);
        deployed.push(addr);
        emit Deployed(msg.sender, addr);
        return addr;
    }

    /// @notice Get number of deployed emitters
    function count() external view returns (uint256) {
        return deployed.length;
    }

    /// @notice Get deployed emitter at index
    function get(uint256 idx) external view returns (address) {
        require(idx < deployed.length, "index OOB");
        return deployed[idx];
    }
}
